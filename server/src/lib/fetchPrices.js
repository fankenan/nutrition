/**
 * 系统自带的价格抓取：直接访问两个官方数据接口，不依赖任何本地文件
 *  - 万邦国际农产品物流   https://wap.api.banglail.com:62021  (JSON)
 *  - 郑州市发改委价格查询 https://fgw.zhengzhou.gov.cn/.../RichPublicWebService.asmx (SOAP)
 */
const https = require('https');
const db = require('../db');
const { upsertWb, upsertZz } = require('./prices');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/* ---------------- 通用 HTTPS 请求（忽略自签证书错误） ---------------- */
function request(urlStr, { method = 'GET', headers = {}, body = null, timeout = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method,
      headers,
      timeout,
      rejectUnauthorized: false
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 160)}`));
        resolve(text);
      });
    });
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function postJson(url, payload, extraHeaders = {}) {
  const text = await request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'User-Agent': UA,
      ...extraHeaders
    },
    body: JSON.stringify(payload)
  });
  return JSON.parse(text);
}

const retry = async (fn, times = 3) => {
  let last;
  for (let i = 0; i < times; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
  }
  throw last;
};

/* ================= 万邦 ================= */
const WB_API = 'https://wap.api.banglail.com:62021';
const WB_CATEGORIES = ['蔬菜类', '果品类', '水产类', '畜禽蛋品', '粮油', '副食', '干调类'];
const WB_LOOKBACK_DAYS = 10;

const fmtDate = (ms) => {
  const d = new Date(Number(ms) + 8 * 3600 * 1000); // 统一按东八区
  return d.toISOString().slice(0, 10);
};
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

async function wbCategories() {
  const today = new Date(Date.now() + 8 * 3600 * 1000);
  for (let back = 0; back < 4; back++) {
    const ds = new Date(today.getTime() - back * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
    try {
      const r = await postJson(`${WB_API}/api-entrance/productcategory/categoryOfficialWebsite?tenantId=webApp`,
        { dateStr: ds, tenantId: 'webApp' }, { Origin: 'https://www.wbncp.com', Referer: 'https://www.wbncp.com/' });
      const cats = (r.data || []).map((x) => x.categoryName).filter(Boolean);
      if (cats.length) return cats;
    } catch { /* 换下一天试 */ }
  }
  return WB_CATEGORIES;
}

async function wbCategoryRows(name, startMs, endMs) {
  const out = [];
  let page = 1;
  for (let guard = 0; guard < 20; guard++) {
    const r = await retry(() => postJson(`${WB_API}/api-entrance/productcategory/officialWebsite`, {
      page, limit: 3000, categoryName: name, productName: '', startTime: startMs, endTime: endMs
    }, { Origin: 'https://www.wbncp.com', Referer: 'https://www.wbncp.com/' }));
    const data = r.data || {};
    const list = data.list || [];
    out.push(...list);
    if (!list.length || out.length >= (data.total || 0)) break;
    page += 1;
  }
  return out;
}

async function fetchWb() {
  const cats = await wbCategories();
  const now = Date.now();
  const start = now - WB_LOOKBACK_DAYS * 86400000;
  const rows = [];
  for (const c of cats) {
    const list = await wbCategoryRows(c, start, now);
    for (const x of list) {
      const name = String(x.productName || '').trim();
      if (!name || !x.recordDate) continue;
      rows.push([
        fmtDate(x.recordDate),
        String(x.categoryName || c).trim(),
        name,
        String(x.productPlace || '').trim(),
        String(x.productSize || '').trim(),
        String(x.unit || '').trim(),
        num(x.priceMax), num(x.priceMin), num(x.priceAvg)
      ]);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!rows.length) throw new Error('万邦接口返回空数据');
  const inserted = await upsertWb(rows);
  const latest = rows.reduce((m, r) => (r[0] > m ? r[0] : m), '');
  return { rows: inserted, date: latest, categories: cats.length };
}

/* ================= 郑州 ================= */
const ZZ_URL = 'https://fgw.zhengzhou.gov.cn/RichWebServices/services/RichPublicWebService.asmx';
const ZZ_NS = 'http://www.zzpn.gov.cn/RichPublicWebService/';
const ZZ_ENVELOPE = "<?xml version='1.0' encoding='utf-8'?>"
  + "<soap:Envelope xmlns:xsi='http://www.w3.org/2001/XMLSchema-instance' xmlns:xsd='http://www.w3.org/2001/XMLSchema' "
  + "xmlns:soap='http://schemas.xmlsoap.org/soap/envelope/'>"
  + "<soap:Header><Header xmlns='http://www.zzpn.gov.cn/RichPublicWebService/'>"
  + '<HeaderData>RichWebServices</HeaderData></Header></soap:Header>'
  + '<soap:Body></soap:Body></soap:Envelope>';

async function soap(action) {
  const text = await request(ZZ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: `"${ZZ_NS}${action}"`,
      'Content-Length': Buffer.byteLength(ZZ_ENVELOPE),
      'User-Agent': 'nutrition-analysis/1.0'
    },
    body: ZZ_ENVELOPE
  });
  return text;
}

/** 极简 XML 记录抽取：返回 [{字段: 文本}] */
function xmlRows(xml, tag) {
  const out = [];
  const block = new RegExp(`<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${tag}>`, 'g');
  let m;
  while ((m = block.exec(xml))) {
    const body = m[1];
    const rec = {};
    const field = /<([\w.-]+)\b[^>]*>([\s\S]*?)<\/\1>/g;
    let f;
    while ((f = field.exec(body))) {
      const key = f[1].split(':').pop();
      if (key === 'EntityKey' || key === 'EntityState' || key.endsWith('Reference')) continue;
      rec[key] = f[2].trim();
    }
    if (Object.keys(rec).length) out.push(rec);
  }
  return out;
}

async function fetchZz() {
  const [namesXml, marketsXml, kindsXml, mkindsXml, detailsXml] = await Promise.all([
    retry(() => soap('GetNames')),
    retry(() => soap('GetMarkets')),
    retry(() => soap('GetKinds')),
    retry(() => soap('GetMarket_kinds')),
    retry(() => soap('GetDetailsLastDay'))
  ]);

  const names = new Map(xmlRows(namesXml, 'name').map((r) => [r.name_id, r]));
  const markets = new Map(xmlRows(marketsXml, 'market').map((r) => [r.market_id, r]));
  const kinds = new Map(xmlRows(kindsXml, 'kind').map((r) => [r.kind_id, r.kind_name]));
  const mkinds = new Map(xmlRows(mkindsXml, 'market_kind').map((r) => [r.market_kind_id, r.market_kind_name]));
  const details = xmlRows(detailsXml, 'detail');
  if (!details.length) throw new Error('郑州接口返回空明细');

  const rows = [];
  for (const d of details) {
    const date = String(d.dates || '').slice(0, 10);
    if (!date) continue;
    const nm = names.get(d.name_id) || {};
    const mk = markets.get(d.market_id) || {};
    const price = num(d.prices);
    rows.push([
      date,
      kinds.get(d.kind_id) || d.kind_id || '',
      nm.names || d.name_id || '',
      nm.grades || '',
      mkinds.get(d.market_kind_id) || d.market_kind_id || '',
      mk.market_name || d.market_id || '',
      price
    ]);
  }
  const inserted = await upsertZz(rows);
  const latest = rows.reduce((m, r) => (r[0] > m ? r[0] : m), '');
  return { rows: inserted, date: latest };
}

/* ================= 抓取日志 ================= */
const LOG_DDL = `
CREATE TABLE IF NOT EXISTS price_fetch_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source VARCHAR(8) NOT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME DEFAULT NULL,
  ok TINYINT NOT NULL DEFAULT 0,
  row_count INT NOT NULL DEFAULT 0,
  price_date DATE DEFAULT NULL,
  message VARCHAR(255) DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;
async function ensureFetchLog() { await db.query(LOG_DDL); }

async function runOne(source) {
  const [r] = await db.query('INSERT INTO price_fetch_log (source) VALUES (?)', [source]);
  const id = r.insertId;
  try {
    const res = source === 'wb' ? await fetchWb() : await fetchZz();
    await db.query('UPDATE price_fetch_log SET finished_at = NOW(), ok = 1, row_count = ?, price_date = ?, message = ? WHERE id = ?',
      [res.rows, res.date, `${source === 'wb' ? '万邦' : '郑州'}抓取成功`, id]);
    return { source, ok: true, ...res };
  } catch (e) {
    await db.query('UPDATE price_fetch_log SET finished_at = NOW(), ok = 0, message = ? WHERE id = ?',
      [String(e.message || e).slice(0, 240), id]);
    return { source, ok: false, error: String(e.message || e) };
  }
}

async function fetchAll(sources = ['wb', 'zz']) {
  const out = [];
  for (const s of sources) out.push(await runOne(s));
  return out;
}

async function status() {
  const [rows] = await db.query(
    `SELECT source,
            DATE_FORMAT(DATE_ADD(started_at, INTERVAL 8 HOUR), '%Y-%m-%d %H:%i') AS started_at,
            DATE_FORMAT(DATE_ADD(finished_at, INTERVAL 8 HOUR), '%Y-%m-%d %H:%i') AS finished_at,
            ok, row_count, DATE_FORMAT(price_date, '%Y-%m-%d') AS price_date, message
     FROM price_fetch_log ORDER BY id DESC LIMIT 12`);
  return rows;
}

/* ================= 定时抓取 ================= */
/** 每天在指定小时（东八区）跑一次；若当日已成功则跳过 */
async function autoFetchIfDue() {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const today = now.toISOString().slice(0, 10);
  for (const s of ['wb', 'zz']) {
    const [[last]] = await db.query(
      'SELECT price_date, ok FROM price_fetch_log WHERE source = ? ORDER BY id DESC LIMIT 1', [s]);
    if (last && last.ok && last.price_date && String(last.price_date).slice(0, 10) === today) continue;
    await runOne(s);
  }
}

function startScheduler(log = console.log) {
  const TICK = 3 * 3600 * 1000; // 每 3 小时检查一次
  const run = () => autoFetchIfDue().catch((e) => log('[prices] 自动抓取失败：' + e.message));
  setTimeout(run, 30 * 1000);
  setInterval(run, TICK);
}

module.exports = { fetchWb, fetchZz, fetchAll, status, ensureFetchLog, startScheduler };

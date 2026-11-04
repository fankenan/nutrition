const express = require('express');
const db = require('../db');
const { importCsv, calcCost, latestWbDate, importPlatform } = require('../lib/prices');
const { fetchAll, status } = require('../lib/fetchPrices');

const router = express.Router();

/** MySQL DATE 字段会以 JS Date 返回，统一转成 YYYY-MM-DD */
const dstr = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

/* ---------- 立即抓取（管理员手动触发） ---------- */
router.post('/fetch', async (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: '仅管理员可触发抓取' });
  const src = req.body?.source;
  const sources = src === 'wb' || src === 'zz' ? [src] : ['wb', 'zz'];
  try {
    const out = await fetchAll(sources);
    const failed = out.filter((x) => !x.ok);
    res.json({
      ok: failed.length === 0,
      results: out,
      message: failed.length ? failed.map((f) => `${f.source}：${f.error}`).join('；') : '抓取完成'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------- 抓取日志 ---------- */
router.get('/status', async (req, res) => {
  try { res.json({ logs: await status() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- 导入（给每日导出任务推送，也支持管理员手动导入） ---------- */
router.post('/import', async (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: '仅管理员可导入' });
  const { source, csv } = req.body || {};
  if (!['wb', 'zz'].includes(source)) return res.status(400).json({ error: 'source 只能是 wb 或 zz' });
  if (!csv || typeof csv !== 'string') return res.status(400).json({ error: '缺少 csv 内容' });
  try {
    const r = await importCsv(source, csv);
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ---------- 报价日列表 ---------- */
router.get('/meta', async (req, res) => {
  const [[wb]] = await db.query('SELECT COUNT(*) c, MIN(price_date) f, MAX(price_date) l FROM price_wb');
  const [[zz]] = await db.query('SELECT COUNT(*) c, MIN(price_date) f, MAX(price_date) l FROM price_zz');
  const [wbDates] = await db.query('SELECT DISTINCT price_date d FROM price_wb ORDER BY d DESC LIMIT 60');
  const [zzDates] = await db.query('SELECT DISTINCT price_date d FROM price_zz ORDER BY d DESC LIMIT 60');
  const fmt = (r) => ({ count: r.c, from: dstr(r.f), to: dstr(r.l) });
  res.json({
    wb: { ...fmt(wb), dates: wbDates.map((x) => dstr(x.d)).filter(Boolean) },
    zz: { ...fmt(zz), dates: zzDates.map((x) => dstr(x.d)).filter(Boolean) }
  });
});

/* ---------- 明细查询 ---------- */
router.get('/list', async (req, res) => {
  const source = req.query.source === 'zz' ? 'zz' : 'wb';
  const q = (req.query.q || '').trim();
  const cat = (req.query.category || '').trim();
  const limit = Math.min(Number(req.query.limit) || 600, 2000);

  if (source === 'wb') {
    const date = (req.query.date || '').trim() || await latestWbDate();
    if (!date) return res.json({ source, date: null, list: [], categories: [] });
    const where = ['price_date = ?'];
    const args = [date];
    if (q) { where.push('name LIKE ?'); args.push(`%${q}%`); }
    if (cat) { where.push('category = ?'); args.push(cat); }
    const [rows] = await db.query(
      `SELECT name, category, origin, spec, unit, price_max, price_min, price_avg
       FROM price_wb WHERE ${where.join(' AND ')}
       ORDER BY FIELD(category, '蔬菜类', '畜禽蛋品', '水产类', '粮油', '副食', '干调类', '果品类'), name, price_avg
       LIMIT ${limit}`, args);
    const [cats] = await db.query('SELECT category, COUNT(*) c FROM price_wb WHERE price_date = ? GROUP BY category ORDER BY c DESC', [date]);
    return res.json({
      source, date: dstr(date), unit: '元/公斤',
      categories: cats.map((x) => ({ value: x.category, count: x.c })),
      list: rows
    });
  }

  const date = (req.query.date || '').trim() || null;
  const d = date || (await db.query('SELECT MAX(price_date) d FROM price_zz').then(([r]) => dstr(r[0]?.d)));
  if (!d) return res.json({ source, date: null, list: [], categories: [] });
  const where = ['price_date = ?'];
  const args = [d];
  if (q) { where.push('name LIKE ?'); args.push(`%${q}%`); }
  if (cat) { where.push('category = ?'); args.push(cat); }
  const [rows] = await db.query(
    `SELECT name, category, grade, price_type, market, price
     FROM price_zz WHERE ${where.join(' AND ')}
     ORDER BY FIELD(category, '蔬菜', '肉蛋禽', '水产', '粮油', '水果', '调味调料'), name, market
     LIMIT ${limit}`, args);
  const [cats] = await db.query('SELECT category, COUNT(*) c FROM price_zz WHERE price_date = ? GROUP BY category ORDER BY c DESC', [d]);
  res.json({
    source, date: dstr(d), unit: '元/500克',
    categories: cats.map((x) => ({ value: x.category, count: x.c })),
    list: rows
  });
});

/* ---------- 平台价格：上传导入 ---------- */
router.post('/platform/import', async (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: '仅管理员可上传平台价格' });
  const date = String(req.body?.date || '').trim();
  const rows = req.body?.rows;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: '报价日格式应为 YYYY-MM-DD' });
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: '没有解析到数据行' });
  try {
    const r = await importPlatform(date, rows);
    res.json({ ok: true, date, ...r });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ---------- 平台价格：报价日列表 ---------- */
router.get('/platform/meta', async (req, res) => {
  const [rows] = await db.query(
    `SELECT DATE_FORMAT(price_date, '%Y-%m-%d') d, COUNT(*) c,
            DATE_FORMAT(DATE_ADD(MAX(upload_at), INTERVAL 8 HOUR), '%Y-%m-%d %H:%i') uploaded
     FROM price_platform GROUP BY price_date ORDER BY price_date DESC LIMIT 60`);
  res.json({
    dates: rows.map((x) => ({ date: x.d, count: x.c, uploaded: x.uploaded })),
    latest: rows[0] || null
  });
});

/* ---------- 平台价格：明细 ---------- */
router.get('/platform/list', async (req, res) => {
  const q = (req.query.q || '').trim();
  const cat = (req.query.category || '').trim();
  let date = (req.query.date || '').trim();
  if (!date) {
    const [[r]] = await db.query('SELECT MAX(price_date) d FROM price_platform');
    date = r?.d ? (r.d instanceof Date ? r.d.toISOString().slice(0, 10) : String(r.d).slice(0, 10)) : '';
  }
  if (!date) return res.json({ date: null, list: [], categories: [] });
  const where = ['price_date = ?'];
  const args = [date];
  if (q) { where.push('(name LIKE ? OR code LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
  if (cat) { where.push('category = ?'); args.push(cat); }
  const [rows] = await db.query(
    `SELECT code, name, category, spec, price, gram_per_unit, per_gram, per_500g, status
     FROM price_platform WHERE ${where.join(' AND ')}
     ORDER BY FIELD(category, '蔬菜类', '水产肉类', '蛋奶类', '豆制品面条类', '米面油类', '干调类', '冻品类', '点心类', '水果类'), name
     LIMIT 2000`, args);
  const [cats] = await db.query(
    'SELECT category, COUNT(*) c FROM price_platform WHERE price_date = ? GROUP BY category ORDER BY c DESC', [date]);
  res.json({
    date,
    categories: cats.map((x) => ({ value: x.category, count: x.c })),
    list: rows
  });
});

/* ---------- 成本计算（万邦·只计公斤单价） ---------- */
router.post('/cost', async (req, res) => {
  const items = (req.body?.items || []).filter((i) => i && i.key);
  if (!items.length) return res.json({ date: null, items: {}, skipped: {} });
  try {
    const r = await calcCost(items);
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

const { parse } = require('csv-parse/sync');
const db = require('../db');
const { PRICE_DDL, PRICE_PLATFORM_DDL } = require('../schema');

/* ================= 建表 ================= */
async function ensurePriceTables() {
  for (const s of PRICE_DDL.split(';').map((x) => x.trim()).filter(Boolean)) await db.query(s);
  for (const s of PRICE_PLATFORM_DDL.split(';').map((x) => x.trim()).filter(Boolean)) await db.query(s);
}

/* ================= 数值处理 ================= */
const n = (v) => {
  if (v == null || v === '') return null;
  const x = Number(String(v).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(x) ? x : null;
};
const isKg = (u) => ['公斤', 'kg', 'KG', '千克', 'Kg'].includes(String(u || '').trim());

/* ================= 入库（CSV 导入与接口抓取共用） ================= */
/**
 * rows: [[date, category, name, origin, spec, unit, max, min, avg], ...]
 */
async function upsertWb(rows) {
  if (!rows.length) return 0;
  const dates = [...new Set(rows.map((r) => r[0]))];
  for (const d of dates) await db.query('DELETE FROM price_wb WHERE price_date = ?', [d]);
  await db.query(
    `INSERT INTO price_wb (price_date, category, name, origin, spec, unit, price_max, price_min, price_avg) VALUES ?
     ON DUPLICATE KEY UPDATE price_max = VALUES(price_max), price_min = VALUES(price_min), price_avg = VALUES(price_avg)`,
    [rows]);
  return rows.length;
}

/**
 * rows: [[date, category, name, grade, price_type, market, price], ...]
 */
async function upsertZz(rows) {
  if (!rows.length) return 0;
  const dates = [...new Set(rows.map((r) => r[0]))];
  for (const d of dates) await db.query('DELETE FROM price_zz WHERE price_date = ?', [d]);
  await db.query(
    `INSERT INTO price_zz (price_date, category, name, grade, price_type, market, price) VALUES ?
     ON DUPLICATE KEY UPDATE price = VALUES(price)`,
    [rows]);
  return rows.length;
}

/* ================= 导入 CSV ================= */
/**
 * source: 'wb' 万邦 | 'zz' 郑州
 * csvText: 原始 CSV 文本（带 BOM 亦可）
 */
async function importCsv(source, csvText) {
  const rows = parse(csvText, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true });
  if (!rows.length) return { inserted: 0, date: null };

  if (source === 'wb') {
    const values = [];
    for (const r of rows) {
      const d = (r['日期'] || '').trim();
      const name = (r['商品名称'] || '').trim();
      if (!d || !name) continue;
      values.push([d, (r['商品类别'] || '').trim(), name, (r['产地'] || '').trim(), (r['规格'] || '').trim(),
        (r['单位'] || '').trim(), n(r['最高价']), n(r['最低价']), n(r['均价'])]);
    }
    const inserted = await upsertWb(values);
    return { inserted, date: values.length ? values[values.length - 1][0] : null };
  }

  if (source === 'zz') {
    const values = [];
    for (const r of rows) {
      const d = (r['日期'] || '').trim();
      const name = (r['商品名称'] || '').trim();
      if (!d || !name) continue;
      values.push([d, (r['商品类别'] || '').trim(), name, (r['规格等级'] || '').trim(),
        (r['价格类型'] || '').trim(), (r['市场'] || '').trim(), n(r['价格(元/500克)'] ?? r['价格'] ?? r['均价'])]);
    }
    const inserted = await upsertZz(values);
    return { inserted, date: values.length ? values[values.length - 1][0] : null };
  }

  throw new Error('未知来源，仅支持 wb / zz');
}

/* ================= 匹配报价 ================= */
/** 万邦：只认「公斤」单价，取同日同名均价 */
async function latestWbDate() {
  const [[r]] = await db.query('SELECT MAX(price_date) d FROM price_wb');
  if (!r?.d) return null;
  return r.d instanceof Date ? r.d.toISOString().slice(0, 10) : String(r.d).slice(0, 10);
}

async function buildWbIndex() {
  const date = await latestWbDate();
  if (!date) return { date: null, map: new Map() };
  const [rows] = await db.query(
    `SELECT name, unit, AVG(price_avg) AS p FROM price_wb WHERE price_date = ? GROUP BY name, unit`, [date]);
  const kg = new Map();
  const other = new Map();
  for (const r of rows) {
    if (r.p == null) continue;
    if (isKg(r.unit)) {
      if (!kg.has(r.name)) kg.set(r.name, Number(r.p));
      else kg.set(r.name, Math.min(kg.get(r.name), Number(r.p)));
    } else if (!other.has(r.name)) {
      other.set(r.name, r.unit);
    }
  }
  return { date, map: kg, other };
}

/** 名称匹配：精确 → 别名 → 去括号 → 双向包含（优先长度最接近） */
const ALIAS = {
  小麦粉: '面粉', 面粉: '面粉', 标准粉: '面粉', 特一粉: '面粉',
  番茄: '西红柿', 西红柿: '西红柿', 圣女果: '圣女果',
  猪肉: '白条猪', 猪瘦肉: '精瘦肉', 瘦肉: '精瘦肉', 里脊: '纯里脊', 里脊肉: '精瘦肉',
  鸡腿肉: '琵琶腿', 鸡腿: '琵琶腿', 鸡胸肉: '鸡胸', 鸡翅: '翅中', 鸡翅中: '翅中',
  小葱: '香葱', 大白菜: '白菜', 娃娃菜: '白菜',
  木耳: '黑木耳', 银耳: '白木耳',
  北豆腐: '老豆腐', 南豆腐: '嫩豆腐', 豆腐: '中豆腐',
  青椒: '圆椒', 柿子椒: '圆椒',
  豆角: '豇豆', 黄豆芽: '大黄豆芽', 绿豆芽: '绿豆芽',
  花生仁: '花生米', 花生: '花生米',
  白萝卜: '萝卜', 香菇: '花菇', 油菜: '上海青',
  小米: '金苗小米', 排骨: '通排', 猪排骨: '通排', 带鱼: '冻带鱼',
  豆腐皮: '薄千张', 千张: '薄千张', 鸭腿: '鸭腿', 鸡腿排: '鸡排腿'
};

function pick(map, name) {
  const raw = String(name || '').trim();
  if (!raw) return null;
  const base = raw.replace(/[（(].*?[）)]/g, '').replace(/\s/g, '').trim();
  const tries = [raw];
  if (base && base !== raw) tries.push(base);
  const alias = ALIAS[raw] || ALIAS[base];
  if (alias) tries.push(alias);

  for (const t of tries) {
    if (map.has(t)) return { name: t, price: map.get(t) };
  }
  for (const t of tries) {
    let best = null;
    for (const [k, v] of map) {
      if (k.includes(t) || t.includes(k)) {
        const diff = Math.abs(k.length - t.length);
        if (!best || diff < best.diff) best = { name: k, price: v, diff };
      }
    }
    if (best) return { name: best.name, price: best.price };
  }
  return null;
}

/**
 * 计算成本
 * items: [{ key, names: ['食物成分名','学校叫法'] , grams }]
 * 返回：{ date, items: {key: {pricePerKg, cost, matched, unit}}, skipped: {key: reason} }
 */
async function calcCost(items) {
  const { date, map, other } = await buildWbIndex();
  const out = {};
  const skipped = {};
  for (const it of items) {
    const grams = Number(it.grams) || 0;
    if (!grams) { skipped[it.key] = 'no_amount'; continue; }
    let hit = null;
    for (const nm of it.names || []) {
      hit = pick(map, nm);
      if (hit) break;
    }
    if (hit) {
      const cost = Math.round((grams / 1000) * hit.price * 100) / 100;
      out[it.key] = { pricePerKg: Math.round(hit.price * 1000) / 1000, cost, matched: hit.name, unit: '公斤' };
      continue;
    }
    // 名称对上了但单位不是公斤
    let unitHit = null;
    for (const nm of it.names || []) if (nm && other.has(nm)) { unitHit = other.get(nm); break; }
    skipped[it.key] = unitHit ? 'unit_not_kg' : 'no_price';
    if (unitHit) skipped[it.key] = 'unit_not_kg';
  }
  return { date, items: out, skipped };
}

module.exports = { ensurePriceTables, importCsv, upsertWb, upsertZz, calcCost, latestWbDate, isKg, gramsOfSpec, importPlatform };


/* ================= 平台价格（Excel 上传） ================= */
/**
 * 从「单位/规格」里推断一个销售单位折合多少克
 * 支持：5kg/袋、500g/斤、25kg/袋、2.5kg/包、180g/袋、5L/桶、200ml/盒
 * 体积按 1L≈1000g、1ml≈1g 估算（油类实际密度略低，这里按水计，仅作参考）
 */
function gramsOfSpec(spec) {
  const s = String(spec || '').toLowerCase().replace(/\s/g, '');
  if (!s) return null;
  let m = s.match(/(\d+(?:\.\d+)?)(kg|千克|公斤)/);
  if (m) return { grams: Number(m[1]) * 1000, approx: false };
  m = s.match(/(\d+(?:\.\d+)?)(ml|毫升)/);
  if (m) return { grams: Number(m[1]), approx: true };
  m = s.match(/(\d+(?:\.\d+)?)(g|克)/);
  if (m) return { grams: Number(m[1]), approx: false };
  m = s.match(/(\d+(?:\.\d+)?)(l|升)/);
  if (m) return { grams: Number(m[1]) * 1000, approx: true };
  return null;
}

/** 导入平台价格：rows = [{code,name,category,spec,price,status}] */
async function importPlatform(date, rows) {
  const values = [];
  let approx = 0, noUnit = 0;
  for (const r of rows) {
    const name = String(r.name || '').trim();
    if (!name) continue;
    const price = Number(r.price);
    const g = gramsOfSpec(r.spec);
    if (!g) noUnit += 1;
    if (g && g.approx) approx += 1;
    const perGram = g && g.grams > 0 && Number.isFinite(price) ? price / g.grams : null;
    const per500 = perGram != null ? perGram * 500 : null;
    values.push([
      date, String(r.code || '').trim(), name, String(r.category || '').trim(),
      String(r.spec || '').trim(), Number.isFinite(price) ? price : null,
      g ? g.grams : null, perGram, per500, String(r.status || '').trim()
    ]);
  }
  if (!values.length) return { inserted: 0, approx, noUnit };
  await db.query('DELETE FROM price_platform WHERE price_date = ?', [date]);
  await db.query(
    `INSERT INTO price_platform (price_date, code, name, category, spec, price, gram_per_unit, per_gram, per_500g, status) VALUES ?
     ON DUPLICATE KEY UPDATE price = VALUES(price), spec = VALUES(spec), category = VALUES(category),
       gram_per_unit = VALUES(gram_per_unit), per_gram = VALUES(per_gram), per_500g = VALUES(per_500g), status = VALUES(status)`,
    [values]);
  return { inserted: values.length, approx, noUnit };
}

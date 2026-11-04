const express = require('express');
const db = require('../db');
const { requireLogin, requireAdmin } = require('../lib/auth');

const router = express.Router();

function parseItems(s) {
  try {
    const v = JSON.parse(s || '[]');
    return Array.isArray(v) ? v.filter((i) => i && i.raw_name) : [];
  } catch { return []; }
}
const toRow = (r) => ({
  id: r.id,
  name: r.name,
  category: r.category || '',
  items: parseItems(r.items_json),
  use_count: r.use_count,
  total_g: parseItems(r.items_json).reduce((s, i) => s + (Number(i.amount_g) || 0), 0),
  updated_at: r.updated_at
});
function cleanItems(items) {
  return (items || [])
    .filter((i) => i && String(i.raw_name || '').trim())
    .map((i) => ({ raw_name: String(i.raw_name).trim(), amount_g: Number(i.amount_g) || 0 }));
}

// 菜品库列表（所有登录/游客可读，用于录入时选择）
router.get('/', async (req, res) => {
  const q = (req.query.q || '').trim();
  const cat = (req.query.category || '').trim();
  const where = ['status = 1'];
  const args = [];
  if (q) { where.push('name LIKE ?'); args.push(`%${q}%`); }
  if (cat) { where.push('category = ?'); args.push(cat); }
  const limit = Math.min(Number(req.query.limit) || 2000, 5000);
  const [rows] = await db.query(
    `SELECT * FROM dish_library WHERE ${where.join(' AND ')} ORDER BY use_count DESC, id ASC LIMIT ${limit}`, args);
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) total FROM dish_library WHERE ${where.join(' AND ')}`, args);
  res.json({ list: rows.map(toRow), total });
});

router.get('/categories', async (req, res) => {
  const [rows] = await db.query(
    "SELECT category, COUNT(*) AS c FROM dish_library WHERE status = 1 GROUP BY category ORDER BY c DESC");
  res.json({ categories: rows.map((r) => ({ value: r.category || '未分类', count: r.c })) });
});

// 新增（同名覆盖）
router.post('/', requireAdmin, async (req, res) => {
  const { name, category, items } = req.body || {};
  const nm = String(name || '').trim();
  if (!nm) return res.status(400).json({ error: '缺少菜品名称' });
  const it = cleanItems(items);
  if (!it.length) return res.status(400).json({ error: '至少填写一项食材' });
  await db.query(
    `INSERT INTO dish_library (name, category, items_json, created_by) VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE category = VALUES(category), items_json = VALUES(items_json), status = 1`,
    [nm, category || '', JSON.stringify(it), req.user?.id || null]);
  res.json({ ok: true });
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { name, category, items } = req.body || {};
  const nm = String(name || '').trim();
  if (!nm) return res.status(400).json({ error: '缺少菜品名称' });
  const it = cleanItems(items);
  if (!it.length) return res.status(400).json({ error: '至少填写一项食材' });
  await db.query('UPDATE dish_library SET name=?, category=?, items_json=? WHERE id=?',
    [nm, category || '', JSON.stringify(it), req.params.id]);
  res.json({ ok: true });
});

router.delete('/:id', requireAdmin, async (req, res) => {
  await db.query('UPDATE dish_library SET status = 0 WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// 被使用一次，热度 +1
router.post('/:id/use', requireLogin, async (req, res) => {
  await db.query('UPDATE dish_library SET use_count = use_count + 1 WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;

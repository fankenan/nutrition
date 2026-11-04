const express = require('express');
const db = require('../db');
const { requireLogin } = require('../lib/auth');
const { matchOne, learn, normalize } = require('../lib/matcher');

const router = express.Router();

// 批量匹配（登录用户可用；游客只读匹配、结果不学习）
router.post('/match', async (req, res) => {
  const names = (req.body?.names || []).map((s) => String(s).trim()).filter(Boolean);
  const out = [];
  for (const raw of names) {
    const m = await matchOne(db, raw);
    if (m.status === 'none' && raw) {
      const rn = normalize(raw);
      await db.query(
        `INSERT INTO unmatched_log (raw_name, hit_count) VALUES (?, 1)
         ON DUPLICATE KEY UPDATE hit_count = hit_count + 1`, [rn]).catch(() => {});
    }
    out.push({ raw, status: m.status, score: m.score, food: m.food ? { id: m.food.id, name: m.food.name, category_l1: m.food.category_l1, edible: m.food.edible } : null, candidates: m.candidates || [] });
  }
  res.json({ results: out });
});

// 确认映射（学习一次，记住一次）
router.post('/confirm', requireLogin, async (req, res) => {
  const { raw, food_id } = req.body || {};
  if (!raw || !food_id) return res.status(400).json({ error: '缺少参数' });
  await learn(db, raw, food_id, req.user.id, 'manual');
  res.json({ ok: true });
});

router.get('/list', async (req, res) => {
  const q = (req.query.q || '').trim();
  const [rows] = await db.query(
    `SELECT m.*, f.name AS food_name, f.category_l1 FROM ingredient_map m
     JOIN foods f ON f.id = m.food_id
     ${q ? 'WHERE m.raw_name LIKE ? OR f.name LIKE ?' : ''}
     ORDER BY m.use_count DESC, m.updated_at DESC LIMIT 200`,
    q ? [`%${q}%`, `%${q}%`] : []);
  res.json({ maps: rows });
});

router.get('/pending', async (req, res) => {
  const [rows] = await db.query('SELECT * FROM unmatched_log WHERE resolved = 0 ORDER BY hit_count DESC LIMIT 200');
  res.json({ pending: rows });
});

// 删除待确认食材（置 resolved=1，此后不再进入待确认列表）
router.delete('/pending/:id', requireLogin, async (req, res) => {
  await db.query('UPDATE unmatched_log SET resolved = 1 WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// 修改映射（食材名 / 对应食物）
router.put('/:id', requireLogin, async (req, res) => {
  const { raw_name, food_id } = req.body || {};
  const nm = String(raw_name || '').trim();
  if (!nm) return res.status(400).json({ error: '缺少食材名' });
  if (!food_id) return res.status(400).json({ error: '请选择对应食物成分' });
  try {
    await db.query('UPDATE ingredient_map SET raw_name = ?, food_id = ? WHERE id = ?', [nm, food_id, req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: `「${nm}」已存在于映射库，请直接修改那一条` });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireLogin, async (req, res) => {
  await db.query('DELETE FROM ingredient_map WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;

const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../lib/auth');
const { STAGE_AGE } = require('../lib/standardsData');

const router = express.Router();

router.get('/stages', (req, res) => {
  res.json({ stages: Object.keys(STAGE_AGE).map((k) => ({ key: k, ...STAGE_AGE[k] })) });
});

router.get('/wst', async (req, res) => {
  const [n] = await db.query('SELECT * FROM standard_wst554 ORDER BY age_group, nutrient_key, sex');
  const [g] = await db.query('SELECT * FROM standard_wst554_group ORDER BY age_group, scope, group_key');
  res.json({ nutrients: n, groups: g });
});

router.get('/dris', async (req, res) => {
  const { age_group, sex } = req.query;
  const where = [], args = [];
  if (age_group) { where.push('age_group = ?'); args.push(age_group); }
  if (sex) { where.push('sex = ?'); args.push(sex); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await db.query(`SELECT * FROM standard_dris ${w} ORDER BY age_group, sex, nutrient_key`, args);
  res.json({ dris: rows });
});

router.put('/dris/:id', requireAdmin, async (req, res) => {
  const b = req.body || {};
  await db.query(
    `UPDATE standard_dris SET ear = COALESCE(?, ear), rni = COALESCE(?, rni), ai = COALESCE(?, ai), ul = COALESCE(?, ul),
     amdr_min = COALESCE(?, amdr_min), amdr_max = COALESCE(?, amdr_max), verified = COALESCE(?, verified)
     WHERE id = ?`,
    [b.ear ?? null, b.rni ?? null, b.ai ?? null, b.ul ?? null, b.amdr_min ?? null, b.amdr_max ?? null, b.verified ?? null, req.params.id]);
  res.json({ ok: true });
});

// 批量导入（覆盖），用于用户核对后导入准确 DRIs 数值
router.post('/dris/import', requireAdmin, async (req, res) => {
  const rows = req.body?.rows || [];
  if (!rows.length) return res.status(400).json({ error: '无数据' });
  const vals = rows.map((r) => [r.age_group, r.sex || '男', r.nutrient_key, r.ear ?? null, r.rni ?? null, r.ai ?? null, r.ul ?? null, r.amdr_min ?? null, r.amdr_max ?? null, r.verified ?? 1, r.source || '人工导入']);
  for (let i = 0; i < vals.length; i += 200) {
    const chunk = vals.slice(i, i + 200);
    await db.query(
      `INSERT INTO standard_dris (age_group, sex, nutrient_key, ear, rni, ai, ul, amdr_min, amdr_max, verified, source)
       VALUES ${chunk.map(() => '(?,?,?,?,?,?,?,?,?,?,?)').join(',')}
       ON DUPLICATE KEY UPDATE ear=VALUES(ear), rni=VALUES(rni), ai=VALUES(ai), ul=VALUES(ul),
       amdr_min=VALUES(amdr_min), amdr_max=VALUES(amdr_max), verified=VALUES(verified), source=VALUES(source)`,
      chunk.flat());
  }
  res.json({ ok: true, count: vals.length });
});

module.exports = router;

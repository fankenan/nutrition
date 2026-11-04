const express = require('express');
const db = require('../db');
const { requireLogin, requireAdmin } = require('../lib/auth');
const { detectGroup, FOOD_GROUPS } = require('../lib/nutrients');

const router = express.Router();

// 可写入的营养字段（与 foods 表列名一致）
const NUM_FIELDS = [
  'edible', 'water', 'energy_kj', 'protein', 'fat', 'cholesterol', 'ash', 'carb', 'fiber',
  'carotene', 'vit_a', 'alpha_te', 'vit_b1', 'vit_b2', 'vit_b3', 'vit_c',
  'ca', 'p', 'k', 'na', 'mg', 'fe', 'zn', 'se', 'cu', 'mn', 'i',
  'sfa', 'mufa', 'pufa', 'total_fa'
];

const GROUP_KEYS = FOOD_GROUPS.map((g) => g.key);

// Atwater 系数（kJ/g）：蛋白 17、脂肪 37、碳水 17、膳食纤维 8
const ATWATER = { protein: 17, fat: 37, carb: 17, fiber: 8 };

const KG_PER_KCAL = 4.184;

/** 数值清洗：空 → null；非数字/负数/超范围 → 报错 */
function cleanNum(v, field) {
  if (v === undefined || v === null || v === '') return { ok: true, val: null };
  const n = Number(v);
  if (!Number.isFinite(n)) return { ok: false, msg: `${field} 必须是数字` };
  if (n < 0) return { ok: false, msg: `${field} 不能为负数` };
  if (n > 1000000) return { ok: false, msg: `${field} 数值过大` };
  return { ok: true, val: Math.round(n * 1000) / 1000 };
}

/** 按三大营养素估算能量（kJ/100g） */
function estimateEnergy(v) {
  const e = (v.protein || 0) * ATWATER.protein
    + (v.fat || 0) * ATWATER.fat
    + (v.carb || 0) * ATWATER.carb
    + (v.fiber || 0) * ATWATER.fiber;
  return e > 0 ? Math.round(e * 100) / 100 : null;
}

/** 从请求体装配营养字段；返回 { error } 或 { vals } */
function collectNumbers(body) {
  const vals = {};
  for (const f of NUM_FIELDS) {
    const r = cleanNum(body[f], f);
    if (!r.ok) return { error: r.msg };
    vals[f] = r.val;
  }
  // 允许前端以 kcal 传值
  if (vals.energy_kj == null && body.energy_kcal != null && body.energy_kcal !== '') {
    const r = cleanNum(body.energy_kcal, '能量');
    if (!r.ok) return { error: r.msg };
    if (r.val != null) vals.energy_kj = Math.round(r.val * KG_PER_KCAL * 100) / 100;
  }
  return { vals };
}

// 食物成分检索（支持分类过滤、来源过滤、分页）
router.get('/', async (req, res) => {
  const q = (req.query.q || '').trim();
  const cat = req.query.category || '';
  const source = (req.query.source || '').trim();
  const page = Math.max(Number(req.query.page || 1), 1);
  const size = Math.min(Number(req.query.size || 20), 100);
  const where = [];
  const args = [];
  if (q) { where.push('f.name LIKE ?'); args.push(`%${q}%`); }
  if (cat) { where.push('f.category_l1 = ?'); args.push(cat); }
  if (source === 'manual' || source === 'std') { where.push('f.source = ?'); args.push(source); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order = req.query.sort === 'recent' ? 'f.id DESC' : 'f.id ASC';

  const [[{ c }]] = await db.query(`SELECT COUNT(*) c FROM foods f ${w}`, args);
  const [rows] = await db.query(
    `SELECT f.id, f.name, f.category_l1, f.category_l2, f.edible, f.energy_kj,
            f.protein, f.fat, f.carb, f.ca, f.fe, f.zn,
            f.vit_a, f.vit_b1, f.vit_b2, f.vit_c, f.fiber, f.group_key,
            f.source, f.created_at, u.username AS created_by_name
       FROM foods f
       LEFT JOIN users u ON u.id = f.created_by
       ${w} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...args, size, (page - 1) * size]
  );
  res.json({ total: c, page, size, foods: rows });
});

// 分类清单
router.get('/categories', async (req, res) => {
  const [rows] = await db.query('SELECT category_l1, COUNT(*) c FROM foods WHERE category_l1 IS NOT NULL GROUP BY category_l1 ORDER BY c DESC');
  res.json({ categories: rows });
});

// 表单元数据：分组、常用营养字段单位
router.get('/meta', async (req, res) => {
  const [cats] = await db.query('SELECT category_l1, COUNT(*) c FROM foods WHERE category_l1 IS NOT NULL GROUP BY category_l1 ORDER BY c DESC');
  const [[{ total }]] = await db.query('SELECT COUNT(*) total FROM foods');
  const [[{ manual }]] = await db.query("SELECT COUNT(*) manual FROM foods WHERE source = 'manual'");
  res.json({
    categories: cats,
    groups: FOOD_GROUPS,
    total,
    manual_count: manual,
    atwater: ATWATER,
    kcal_per_kj: 1 / KG_PER_KCAL
  });
});

// 全量选项（供前端做汉字/拼音首字母本地筛选）
router.get('/options', async (req, res) => {
  const [rows] = await db.query('SELECT id, name, category_l1 FROM foods ORDER BY name');
  res.json({ list: rows });
});

// 智能搜索：给录入框做联想（含匹配评分）
router.get('/suggest', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ list: [] });
  const [rows] = await db.query(
    `SELECT id, name, category_l1, group_key, edible, energy_kj, protein
     FROM foods WHERE name LIKE ? ORDER BY CHAR_LENGTH(name) LIMIT 15`, [`%${q}%`]);
  res.json({ list: rows });
});

// 详情（含全部营养字段，供编辑回填）
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID 无效' });
  const [rows] = await db.query(
    `SELECT f.*, u.username AS created_by_name
       FROM foods f LEFT JOIN users u ON u.id = f.created_by
      WHERE f.id = ?`, [id]);
  if (!rows.length) return res.status(404).json({ error: '食材不存在' });
  res.json({ food: rows[0] });
});

// 新增食材（手工录入）
router.post('/', requireLogin, async (req, res) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: '食材名称不能为空' });
    if (name.length > 128) return res.status(400).json({ error: '食材名称最多 128 字' });

    const [dup] = await db.query(
      'SELECT id, name, category_l1, source FROM foods WHERE name = ? LIMIT 1', [name]);
    if (dup.length) {
      return res.status(409).json({
        error: `「${name}」已存在（${dup[0].source === 'manual' ? '手工录入' : '标准成分表'}），可直接编辑该条`,
        exist: dup[0]
      });
    }

    const { vals, error } = collectNumbers(b);
    if (error) return res.status(400).json({ error });

    if (vals.edible == null) vals.edible = 100;

    // 能量缺省时按三大营养素估算
    let estimated = false;
    if (vals.energy_kj == null) {
      const e = estimateEnergy(vals);
      if (e != null) { vals.energy_kj = e; estimated = true; }
    }

    // 食物分组：未指定则按名称与分类自动判定
    let groupKey = String(b.group_key || '').trim();
    if (!groupKey || !GROUP_KEYS.includes(groupKey)) {
      groupKey = detectGroup({ name, category_l1: b.category_l1 });
    }

    const cols = ['name', 'category_l1', 'category_l2', 'group_key', 'source', 'created_by', ...NUM_FIELDS];
    const args = [
      name,
      String(b.category_l1 || '').trim() || null,
      String(b.category_l2 || '').trim() || null,
      groupKey,
      'manual',
      req.user.id,
      ...NUM_FIELDS.map((f) => (vals[f] == null ? null : vals[f]))
    ];
    const [r] = await db.query(
      `INSERT INTO foods (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, args);
    const id = r.insertId;

    // 写入同名别名映射，让食谱里的同名食材能直接匹配到这条新数据
    let alias = false;
    if (b.alias !== false) {
      try {
        const [ar] = await db.query(
          `INSERT IGNORE INTO ingredient_map (raw_name, display_name, food_id, source, created_by)
           VALUES (?, ?, ?, 'auto-food', ?)`, [name, name, id, req.user.id]);
        alias = ar.affectedRows > 0;
      } catch (e) { /* 别名写入失败不影响主流程 */ }
    }

    res.json({
      ok: true, id, name, group_key: groupKey,
      energy_kj: vals.energy_kj,
      energy_kcal: vals.energy_kj == null ? null : Math.round((vals.energy_kj / KG_PER_KCAL) * 100) / 100,
      estimated, alias
    });
  } catch (e) {
    console.error('[foods:create]', e);
    res.status(500).json({ error: '保存失败：' + e.message });
  }
});

// 修改食材（标准库需管理员，手工录入登录即可）
router.put('/:id', requireLogin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID 无效' });
    const [rows] = await db.query('SELECT * FROM foods WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: '食材不存在' });
    const old = rows[0];

    if (old.source !== 'manual' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '标准成分表数据需管理员修改；你可以新增一条手工食材' });
    }

    const b = req.body || {};
    const name = b.name === undefined ? old.name : String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: '食材名称不能为空' });
    if (name.length > 128) return res.status(400).json({ error: '食材名称最多 128 字' });

    if (name !== old.name) {
      const [dup] = await db.query('SELECT id FROM foods WHERE name = ? AND id <> ? LIMIT 1', [name, id]);
      if (dup.length) return res.status(409).json({ error: `「${name}」已存在，请换一个名称` });
    }

    const { vals, error } = collectNumbers(b);
    if (error) return res.status(400).json({ error });

    // 只更新请求中出现的字段（营养字段以 undefined 表示未提交）
    const sets = [];
    const args = [];
    const push = (col, val) => { sets.push(`${col} = ?`); args.push(val); };

    push('name', name);
    if (b.category_l1 !== undefined) push('category_l1', String(b.category_l1 || '').trim() || null);
    if (b.category_l2 !== undefined) push('category_l2', String(b.category_l2 || '').trim() || null);

    let groupKey = b.group_key === undefined ? old.group_key : String(b.group_key || '').trim();
    if (b.group_key === undefined && (b.name !== undefined || b.category_l1 !== undefined)) {
      groupKey = detectGroup({ name, category_l1: b.category_l1 === undefined ? old.category_l1 : b.category_l1 });
    } else if (!groupKey || !GROUP_KEYS.includes(groupKey)) {
      groupKey = detectGroup({ name, category_l1: b.category_l1 === undefined ? old.category_l1 : b.category_l1 });
    }
    push('group_key', groupKey);

    let estimated = false;
    let energyProvided = false;
    for (const f of NUM_FIELDS) {
      if (b[f] === undefined && !(f === 'energy_kj' && b.energy_kcal !== undefined)) continue;
      if (f === 'energy_kj') {
        if (b.energy_kj === undefined && b.energy_kcal !== undefined) {
          const r = cleanNum(b.energy_kcal, '能量');
          if (!r.ok) return res.status(400).json({ error: r.msg });
          push(f, r.val == null ? null : Math.round(r.val * KG_PER_KCAL * 100) / 100);
          energyProvided = true;
        } else {
          if (vals[f] != null) energyProvided = true;
          push(f, vals[f]);
        }
      } else {
        push(f, vals[f]);
      }
    }

    // 三大营养素变了但没给能量 → 重新估算
    const macroTouched = ['protein', 'fat', 'carb', 'fiber'].some((k) => b[k] !== undefined);
    if (!energyProvided && macroTouched) {
      const merged = { ...old, ...vals };
      const e = estimateEnergy(merged);
      if (e != null) { push('energy_kj', e); estimated = true; }
    }

    await db.query(`UPDATE foods SET ${sets.join(', ')} WHERE id = ?`, [...args, id]);

    const [after] = await db.query('SELECT energy_kj, group_key FROM foods WHERE id = ?', [id]);
    res.json({
      ok: true, id, name,
      group_key: after[0].group_key,
      energy_kj: after[0].energy_kj,
      energy_kcal: after[0].energy_kj == null ? null : Math.round((after[0].energy_kj / KG_PER_KCAL) * 100) / 100,
      estimated
    });
  } catch (e) {
    console.error('[foods:update]', e);
    res.status(500).json({ error: '保存失败：' + e.message });
  }
});

// 删除手工食材（被菜品/映射引用时拒绝）
router.delete('/:id', requireLogin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID 无效' });
    const [rows] = await db.query('SELECT id, name, source FROM foods WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: '食材不存在' });
    if (rows[0].source !== 'manual') {
      return res.status(403).json({ error: '标准成分表数据不能删除' });
    }

    const [[{ items }]] = await db.query('SELECT COUNT(*) items FROM dish_items WHERE food_id = ?', [id]);
    if (items > 0) {
      return res.status(409).json({ error: `该食材已被 ${items} 条菜品配料引用，不能删除` });
    }
    const [[{ maps }]] = await db.query(
      'SELECT COUNT(*) maps FROM ingredient_map WHERE food_id = ? AND raw_name <> ?', [id, rows[0].name]);
    if (maps > 0) {
      return res.status(409).json({ error: `该食材被 ${maps} 条名称映射引用，请先在映射库处理` });
    }

    await db.query('DELETE FROM ingredient_map WHERE food_id = ? AND raw_name = ?', [id, rows[0].name]);
    await db.query('DELETE FROM foods WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[foods:delete]', e);
    res.status(500).json({ error: '删除失败：' + e.message });
  }
});

router.put('/:id/group', requireAdmin, async (req, res) => {
  const { group_key } = req.body || {};
  await db.query('UPDATE foods SET group_key = ? WHERE id = ?', [group_key, req.params.id]);
  res.json({ ok: true });
});

// 批量重算食物分组（管理员）
router.post('/rebuild-groups', requireAdmin, async (req, res) => {
  const [rows] = await db.query('SELECT id, name, category_l1 FROM foods');
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    await Promise.all(chunk.map((r) =>
      db.query('UPDATE foods SET group_key = ? WHERE id = ?', [detectGroup(r), r.id])));
  }
  res.json({ ok: true, count: rows.length });
});

module.exports = router;

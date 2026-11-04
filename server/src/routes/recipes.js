const express = require('express');
const db = require('../db');
const { requireLogin, requireAdmin } = require('../lib/auth');

const router = express.Router();

async function loadTree(recipeIds) {
  if (!recipeIds.length) return {};
  const [meals] = await db.query(
    `SELECT * FROM recipe_meals WHERE recipe_id IN (${recipeIds.map(() => '?').join(',')}) ORDER BY day_index, sort, id`, recipeIds);
  const mealIds = meals.map((m) => m.id);
  const dishes = mealIds.length
    ? (await db.query(`SELECT * FROM meal_dishes WHERE meal_id IN (${mealIds.map(() => '?').join(',')}) ORDER BY sort, id`, mealIds))[0]
    : [];
  const dishIds = dishes.map((d) => d.id);
  const items = dishIds.length
    ? (await db.query(
      `SELECT i.*, f.name AS food_name, f.category_l1 FROM dish_items i LEFT JOIN foods f ON f.id = i.food_id
       WHERE i.dish_id IN (${dishIds.map(() => '?').join(',')}) ORDER BY i.sort, i.id`, dishIds))[0]
    : [];

  const byDish = {};
  for (const it of items) (byDish[it.dish_id] ||= []).push(it);
  const byMeal = {};
  for (const d of dishes) (byMeal[d.meal_id] ||= []).push({ ...d, items: byDish[d.id] || [] });
  const byRecipe = {};
  for (const m of meals) (byRecipe[m.recipe_id] ||= []).push({ ...m, dishes: byMeal[m.id] || [] });
  return byRecipe;
}

async function saveRecipe(body, ownerId) {
  const { id, name, school, stage, grade_note, week_start, is_library, source } = body;
  let rid = id;
  if (rid) {
    await db.query('UPDATE recipes SET name=?, school=?, stage=?, grade_note=?, week_start=?, is_library=?, source=? WHERE id=?',
      [name, school || '', stage || '小学', grade_note || '', week_start || null, is_library ? 1 : 0, source || 'manual', rid]);
    await db.query('DELETE FROM recipe_meals WHERE recipe_id = ?', [rid]);
  } else {
    const [r] = await db.query(
      'INSERT INTO recipes (name, school, stage, grade_note, week_start, owner_id, is_library, source) VALUES (?,?,?,?,?,?,?,?)',
      [name, school || '', stage || '小学', grade_note || '', week_start || null, ownerId, is_library ? 1 : 0, source || 'manual']);
    rid = r.insertId;
  }
  for (const [mi, m] of (body.meals || []).entries()) {
    const [mr] = await db.query('INSERT INTO recipe_meals (recipe_id, day_index, meal_type, sort) VALUES (?,?,?,?)',
      [rid, m.day_index || 1, m.meal_type || 'lunch', mi]);
    for (const [di, d] of (m.dishes || []).entries()) {
      const [dr] = await db.query('INSERT INTO meal_dishes (meal_id, name, sort) VALUES (?,?,?)', [mr.insertId, d.name || '', di]);
      for (const [ii, it] of (d.items || []).entries()) {
        await db.query(
          'INSERT INTO dish_items (dish_id, raw_name, amount_g, food_id, match_status, edible_mode, sort) VALUES (?,?,?,?,?,?,?)',
          [dr.insertId, it.raw_name, Number(it.amount_g) || 0, it.food_id || null, it.match_status || 'none', it.edible_mode || 'raw_edible', ii]);
      }
    }
  }
  return rid;
}

router.get('/', requireLogin, async (req, res) => {
  const library = req.query.library === '1';
  const args = [];
  let sql = 'SELECT r.*, u.display_name AS owner_name FROM recipes r LEFT JOIN users u ON u.id = r.owner_id WHERE 1=1';
  if (library) sql += ' AND r.is_library = 1';
  else if (req.user.role !== 'admin') { sql += ' AND r.owner_id = ?'; args.push(req.user.id); }
  sql += ' ORDER BY r.updated_at DESC LIMIT 200';
  const [rows] = await db.query(sql, args);
  res.json({ recipes: rows });
});

router.get('/:id', requireLogin, async (req, res) => {
  const [rows] = await db.query('SELECT r.*, u.display_name AS owner_name FROM recipes r LEFT JOIN users u ON u.id = r.owner_id WHERE r.id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: '食谱不存在' });
  const r = rows[0];
  if (req.user.role !== 'admin' && r.owner_id !== req.user.id && !r.is_library) return res.status(403).json({ error: '无权查看' });
  const tree = await loadTree([r.id]);
  res.json({ recipe: { ...r, meals: tree[r.id] || [] } });
});

router.post('/', requireLogin, async (req, res) => {
  const body = req.body || {};
  if (!body.name) return res.status(400).json({ error: '请填写食谱名称' });
  if (body.is_library && req.user.role !== 'admin') return res.status(403).json({ error: '仅管理员可发布到食谱库' });
  const id = await saveRecipe(body, req.user.id);
  res.json({ id });
});

router.post('/:id/duplicate', requireLogin, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM recipes WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: '食谱不存在' });
  const r = rows[0];
  if (req.user.role !== 'admin' && r.owner_id !== req.user.id && !r.is_library) return res.status(403).json({ error: '无权使用' });
  const tree = await loadTree([r.id]);
  const copy = {
    name: `${r.name}（副本）`, school: r.school, stage: r.stage, grade_note: r.grade_note,
    week_start: r.week_start, is_library: 0,
    meals: (tree[r.id] || []).map((m) => ({
      day_index: m.day_index, meal_type: m.meal_type,
      dishes: (m.dishes || []).map((d) => ({ name: d.name, items: (d.items || []).map((i) => ({ raw_name: i.raw_name, amount_g: i.amount_g, food_id: i.food_id, match_status: i.match_status, edible_mode: i.edible_mode })) }))
    }))
  };
  const id = await saveRecipe(copy, req.user.id);
  res.json({ id });
});

router.delete('/:id', requireLogin, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM recipes WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: '食谱不存在' });
  const r = rows[0];
  if (req.user.role !== 'admin' && r.owner_id !== req.user.id) return res.status(403).json({ error: '无权删除' });
  await db.query('DELETE FROM recipes WHERE id = ?', [r.id]);
  await db.query('DELETE FROM recipe_meals WHERE recipe_id = ?', [r.id]);
  res.json({ ok: true });
});

router.put('/:id/library', requireAdmin, async (req, res) => {
  await db.query('UPDATE recipes SET is_library = ? WHERE id = ?', [req.body.is_library ? 1 : 0, req.params.id]);
  res.json({ ok: true });
});

module.exports = router;

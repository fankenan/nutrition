const express = require('express');
const db = require('../db');
const { NUTRIENT_MAP, FOOD_GROUPS } = require('../lib/nutrients');
const { emptyNutrients, emptyGroups, addItem, addGroup, evaluateWST, evaluateDRIs, energySplit } = require('../lib/analysis');
const { matchOne, buildCache } = require('../lib/matcher');
const { STAGE_AGE } = require('../lib/standardsData');

const router = express.Router();

/**
 * 两种输入：
 *   A) 按 recipe_id 自读：{ recipe_id, stage, sex }
 *      后端自动读取 recipes -> recipe_meals -> meal_dishes -> dish_items 数据链
 *   B) 前端直接喂 meals 树（兼容旧调用）
 */
async function loadRecipeMeals(recipeId) {
  const [rms] = await db.query(
    `SELECT id, day_index, meal_type
     FROM recipe_meals
     WHERE recipe_id = ?
     ORDER BY day_index, FIELD(meal_type,'breakfast','lunch','dinner','extra'), sort`,
    [recipeId]
  );
  const meals = [];
  for (const rm of rms) {
    const [mds] = await db.query(
      `SELECT id, name FROM meal_dishes WHERE meal_id = ? ORDER BY sort`,
      [rm.id]
    );
    const dishes = [];
    for (const md of mds) {
      const [its] = await db.query(
        `SELECT raw_name, amount_g, food_id, edible_mode, match_status
         FROM dish_items WHERE dish_id = ? ORDER BY sort`,
        [md.id]
      );
      dishes.push({
        name: md.name,
        items: its.map((it) => ({
          raw_name: it.raw_name,
          amount_g: it.amount_g,
          food_id: it.food_id,
          edible_mode: it.edible_mode || 'raw_edible',
          match_status: it.match_status,
        })),
      });
    }
    meals.push({ day_index: rm.day_index, meal_type: rm.meal_type, dishes });
  }
  return meals;
}

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const stage = body.stage || '小学';
    const sex = body.sex || '男';
    const recipeId = body.recipe_id || null;
    const meals = recipeId ? await loadRecipeMeals(recipeId) : (body.meals || []);

    const [allFoods] = await db.query('SELECT * FROM foods');
    const cache = buildCache(allFoods);
    const foodById = Object.fromEntries(allFoods.map((f) => [f.id, f]));
    const unmatched = [];

    const mealResults = [];
    for (const m of meals) {
      const mn = emptyNutrients();
      const mg = emptyGroups();
      const dishResults = [];
      for (const d of m.dishes || []) {
        const dn = emptyNutrients();
        for (const it of d.items || []) {
          let food = it.food_id ? foodById[it.food_id] : null;
          if (!food && it.raw_name) {
            const r = await matchOne(db, it.raw_name, cache);
            if (r.food) food = foodById[r.food.id];
            if (!food) unmatched.push({ raw_name: it.raw_name, candidates: r.candidates || [] });
          }
          if (!food) continue;
          addItem(dn, food, it.amount_g, it.edible_mode || 'raw_edible');
          addGroup(mg, food.group_key, it.amount_g);
        }
        for (const k of Object.keys(mn)) mn[k] += dn[k];
        dishResults.push({ name: d.name, nutrients: roundNut(dn) });
      }
      mealResults.push({ day_index: m.day_index || 1, meal_type: m.meal_type, nutrients: roundNut(mn), groups: roundNum(mg), dishes: dishResults });
    }

    const dayMap = {};
    for (const mr of mealResults) (dayMap[mr.day_index] ||= []).push(mr);
    const days = Object.keys(dayMap).sort((a, b) => a - b).map((d) => {
      const list = dayMap[d];
      const nut = emptyNutrients();
      const grp = emptyGroups();
      for (const mr of list) {
        for (const k of Object.keys(nut)) nut[k] += mr.nutrients[k] || 0;
        for (const k of Object.keys(grp)) grp[k] += mr.groups[k] || 0;
      }
      const totalE = nut.energy || 1;
      const ratio = {};
      for (const mr of list) ratio[mr.meal_type] = (mr.nutrients.energy || 0) / totalE;
      return { day_index: Number(d), nutrients: roundNut(nut), groups: roundNum(grp), mealRatio: ratio, meals: list };
    });

    const avg = emptyNutrients();
    const avgGroups = emptyGroups();
    for (const d of days) {
      for (const k of Object.keys(avg)) avg[k] += d.nutrients[k] / (days.length || 1);
      for (const k of Object.keys(avgGroups)) avgGroups[k] += d.groups[k] / (days.length || 1);
    }
    const mealRatios = {};
    for (const mt of ['breakfast', 'lunch', 'dinner']) {
      const vals = days.map((d) => d.mealRatio[mt]).filter((v) => v != null);
      mealRatios[mt] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }

    const [wstN] = await db.query('SELECT * FROM standard_wst554');
    const [wstG] = await db.query('SELECT * FROM standard_wst554_group');
    const [dris] = await db.query('SELECT * FROM standard_dris');
    const stageInfo = STAGE_AGE[stage] || STAGE_AGE['小学'];
    const wst = evaluateWST(avg, avgGroups, stage, sex, wstN, wstG, mealRatios);
    const drisMain = evaluateDRIs(avg, stageInfo.main, sex, dris, avgGroups);
    const drisRef = stageInfo.ref.filter((a) => a !== stageInfo.main).map((a) => evaluateDRIs(avg, a, sex, dris, avgGroups));

    res.json({
      stage, sex,
      days, avg: { nutrients: roundNut(avg), groups: roundNum(avgGroups), split: energySplit(avg) },
      mealRatios,
      wst: { ...wst, score: scoreOf(wst) },
      dris: { main: drisMain, ref: drisRef },
      unmatched: dedupe(unmatched),
      meta: { nutrientMeta: NUTRIENT_MAP, groupMeta: FOOD_GROUPS, days: days.length }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function roundNut(o) {
  const r = {};
  for (const k of Object.keys(o)) r[k] = +Number(o[k] || 0).toFixed(2);
  return r;
}
function roundNum(o) {
  const r = {};
  for (const k of Object.keys(o)) r[k] = +Number(o[k] || 0).toFixed(1);
  return r;
}
function dedupe(list) {
  const seen = new Set();
  return list.filter((x) => (seen.has(x.raw_name) ? false : seen.add(x.raw_name)));
}
function scoreOf(wst) {
  const all = [...wst.checks, ...wst.groupChecks, ...wst.mealChecks];
  const ok = all.filter((x) => x.status === 'ok').length;
  return { ok, total: all.length, percent: all.length ? Math.round(ok / all.length * 100) : 0 };
}

module.exports = router;

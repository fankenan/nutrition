const { NUTRIENTS, NUTRIENT_MAP, FOOD_GROUPS } = require('./nutrients');
const { WST_RULES, STAGE_AGE } = require('./standardsData');

const KJ2KCAL = 1 / 4.184;

function emptyNutrients() {
  const o = {};
  for (const n of NUTRIENTS) o[n.key] = 0;
  return o;
}

function emptyGroups() {
  const o = {};
  for (const g of FOOD_GROUPS) o[g.key] = 0;
  o.other = 0;
  return o;
}

// 单个配料累加：带量单位为 g（学校填写生重）
// edible_mode: raw_edible=可食部生重(直接计算) | raw_whole=毛重生重(按食部折算)
function addItem(target, food, amountG, edibleMode = 'raw_edible') {
  if (!food || !amountG) return;
  const g = Number(amountG);
  const factor = edibleMode === 'raw_whole' ? Number(food.edible || 100) / 100 : 1;
  const k = g / 100 * factor;
  target.energy += (Number(food.energy_kj) || 0) * k * KJ2KCAL;
  for (const n of NUTRIENTS) {
    if (n.key === 'energy') continue;
    target[n.key] += (Number(food[n.key]) || 0) * k;
  }
}

function addGroup(groups, groupKey, amountG) {
  if (groups[groupKey] == null) groups.other += Number(amountG) || 0;
  else groups[groupKey] += Number(amountG) || 0;
}

function sumNutrients(list) {
  const t = emptyNutrients();
  const g = emptyGroups();
  for (const x of list) {
    for (const n of NUTRIENTS) t[n.key] += x.nutrients ? x.nutrients[n.key] || 0 : 0;
    for (const k of Object.keys(g)) g[k] += x.groups ? x.groups[k] || 0 : 0;
  }
  return { nutrients: t, groups: g };
}

function energySplit(nut) {
  const e = nut.energy || 0;
  const p = (nut.protein || 0) * 4;
  const f = (nut.fat || 0) * 9;
  const c = (nut.carb || 0) * 4;
  const total = p + f + c || e || 1;
  return {
    proteinPct: +(p / total * 100).toFixed(1),
    fatPct: +(f / total * 100).toFixed(1),
    carbPct: +(c / total * 100).toFixed(1)
  };
}

function statusOf(ratio, min, max) {
  if (ratio == null) return 'na';
  if (max != null && ratio > max) return 'high';
  if (min != null && ratio < min) return 'low';
  return 'ok';
}

/**
 * WS/T 554 判定
 * @param {object} dayNutrients 日均营养素
 * @param {object} dayGroups 日均食物分组量
 * @param {string} stage 小学/初中/高中
 * @param {string} sex 男/女
 */
function evaluateWST(dayNut, dayGroups, stage, sex, wstNutrient, wstGroup, mealRatios) {
  const age = STAGE_AGE[stage] ? STAGE_AGE[stage].wst : '9-11';
  const target = (key) => {
    const row = wstNutrient.find((r) => r.age_group === age && r.sex === sex && r.nutrient_key === key);
    return row ? Number(row.value) : null;
  };

  const checks = [];
  for (const key of ['energy', 'protein', 'ca', 'fe', 'zn', 'vit_a', 'vit_b1', 'vit_b2', 'vit_c', 'fiber']) {
    const tv = target(key);
    if (tv == null) continue;
    // 能量 90%~110%、蛋白质 80%~120%（WS/T 554 原文）；其余营养素以达到供给量 90% 以上为达标
    const rule = WST_RULES[key] || { minRatio: 0.9, maxRatio: 2.5 };
    const value = dayNut[key] || 0;
    const ratio = value / tv;
    checks.push({
      key, label: NUTRIENT_MAP[key].label, unit: NUTRIENT_MAP[key].unit,
      value: +value.toFixed(2), target: tv, ratio: +ratio.toFixed(3),
      minRatio: rule.minRatio ?? null, maxRatio: rule.maxRatio ?? null,
      status: statusOf(ratio, rule.minRatio ?? null, rule.maxRatio ?? null)
    });
  }

  const split = energySplit(dayNut);
  checks.push({ key: 'fatPct', label: '脂肪供能比', unit: '%', value: split.fatPct, target: '20~30', ratio: null, status: split.fatPct >= 20 && split.fatPct <= 30 ? 'ok' : (split.fatPct > 30 ? 'high' : 'low') });
  checks.push({ key: 'carbPct', label: '碳水化合物供能比', unit: '%', value: split.carbPct, target: '50~65', ratio: null, status: split.carbPct >= 50 && split.carbPct <= 65 ? 'ok' : (split.carbPct > 65 ? 'high' : 'low') });

  // 食物种类数量（全天）
  const groupChecks = [];
  const dayRange = (wstGroup || []).filter((r) => r.age_group === age && r.scope === 'day');
  for (const g of FOOD_GROUPS) {
    if (g.key === 'other') continue;
    const row = dayRange.find((r) => r.group_key === g.key);
    if (!row) continue;
    const v = dayGroups[g.key] || 0;
    const min = Number(row.min_g), max = Number(row.max_g);
    let st = 'ok';
    if (v < min) st = 'low';
    else if (v > max) st = 'high';
    groupChecks.push({ key: g.key, label: g.label, value: +v.toFixed(1), min, max, status: st });
  }

  // 三餐供能比
  const mealChecks = [];
  for (const [mt, range] of Object.entries(WST_RULES.mealRatio)) {
    const r = mealRatios && mealRatios[mt];
    if (r == null) continue;
    mealChecks.push({
      key: mt, label: { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' }[mt],
      value: +(r * 100).toFixed(1), min: range[0] * 100, max: range[1] * 100,
      status: r >= range[0] && r <= range[1] ? 'ok' : (r > range[1] ? 'high' : 'low')
    });
  }

  return { ageGroup: age, checks, groupChecks, mealChecks };
}

/**
 * DRIs 判定
 */
function evaluateDRIs(dayNut, ageGroup, sex, drisRows, dayGroups) {
  const byKey = {};
  for (const r of drisRows) if (r.age_group === ageGroup && r.sex === sex) byKey[r.nutrient_key] = r;

  const checks = [];
  for (const n of NUTRIENTS) {
    const row = byKey[n.key];
    if (!row) continue;
    let value = dayNut[n.key] || 0;
    const rni = row.rni != null ? Number(row.rni) : null;
    const ai = row.ai != null ? Number(row.ai) : null;
    const ear = row.ear != null ? Number(row.ear) : null;
    const ul = row.ul != null ? Number(row.ul) : null;
    const amdrMin = row.amdr_min != null ? Number(row.amdr_min) : null;
    const amdrMax = row.amdr_max != null ? Number(row.amdr_max) : null;

    let status = 'na', target = null, ratio = null, type = '';

    if (amdrMin != null || amdrMax != null) {
      const split = energySplit(dayNut);
      const pct = n.key === 'fat' ? split.fatPct : n.key === 'carb' ? split.carbPct : null;
      if (pct != null) {
        status = pct < amdrMin ? 'low' : pct > amdrMax ? 'high' : 'ok';
        target = `${amdrMin}~${amdrMax}`;
        value = pct;
        type = 'AMDR';
      }
    } else if (rni != null) {
      ratio = value / rni;
      target = rni;
      type = 'RNI';
      if (ul != null && value > ul) status = 'high';
      else status = ratio < 0.8 ? 'verylow' : ratio < 1 ? 'low' : 'ok';
    } else if (ai != null) {
      ratio = value / ai;
      target = ai;
      type = 'AI';
      if (ul != null && value > ul) status = 'high';
      else status = ratio < 0.8 ? 'verylow' : ratio < 1 ? 'low' : 'ok';
    }

    if (status === 'na') continue;
    checks.push({
      key: n.key, label: n.label, unit: n.unit, type,
      value: +Number(value).toFixed(2), target, ratio: ratio != null ? +ratio.toFixed(3) : null,
      ear, rni, ai, ul, verified: Number(row.verified) === 1, status
    });
  }
  return { ageGroup, sex, checks };
}

module.exports = { emptyNutrients, emptyGroups, addItem, addGroup, sumNutrients, energySplit, evaluateWST, evaluateDRIs, KJ2KCAL };

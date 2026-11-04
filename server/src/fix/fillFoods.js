// 一次性数据修复脚本：对 dish_items 中已有克数(amount_g>0)但 food_id 为空的行，
// 用 matcher 匹配到 foods 表并固化 food_id。模糊匹配(fuzzy)不固化，留给人工确认。
const db = require('../db');
const { matchOne, buildCache } = require('../lib/matcher');

(async () => {
  const [allFoods] = await db.query('SELECT * FROM foods');
  const cache = buildCache(allFoods);
  const [dis] = await db.query('SELECT id, raw_name, amount_g FROM dish_items WHERE food_id IS NULL AND amount_g > 0');
  let matched = 0, total = dis.length;
  for (const d of dis) {
    const r = await matchOne(db, d.raw_name, cache);
    if (r.food) {
      const st = (r.status === 'fuzzy') ? 'none' : 'matched';
      await db.query('UPDATE dish_items SET food_id = ?, match_status = ? WHERE id = ?', [r.food.id, st, d.id]);
      matched++;
    }
  }
  console.log(`food_id 回填完成: total=${total}, matched=${matched}, unmatched=${total - matched}`);
  // 校验
  const [[v]] = await db.query('SELECT SUM(food_id IS NOT NULL) WITH_FOOD, SUM(amount_g>0) WITH_G, COUNT(*) TOT FROM dish_items');
  console.log('dish_items 现状:', JSON.stringify(v));
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });

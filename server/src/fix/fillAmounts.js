// 一次性数据修复脚本：把菜品库(dish_library.items_json)里已确认的带量克数，
// 回填到食谱实际构成(dish_items.amount_g)。带备份，可回滚。
const db = require('../db');

(async () => {
  // 1. 备份
  await db.query('DROP TABLE IF EXISTS dish_items_bak');
  await db.query('CREATE TABLE dish_items_bak LIKE dish_items');
  await db.query('INSERT INTO dish_items_bak SELECT * FROM dish_items');
  console.log('[1] 备份完成 dish_items_bak');

  // 2. 加载菜品库
  const [libs] = await db.query('SELECT name, items_json FROM dish_library');
  const libMap = {};
  for (const l of libs) {
    try { libMap[l.name] = JSON.parse(l.items_json || '[]'); } catch { libMap[l.name] = []; }
  }
  console.log('[2] 菜品库加载:', libs.length);

  // 3. 按菜名把克数回填到 dish_items
  const [mds] = await db.query('SELECT id, name FROM meal_dishes');
  let filled = 0, noLib = 0, dishCount = 0;
  for (const md of mds) {
    const items = libMap[md.name];
    if (!items || !items.length) { noLib++; continue; }
    const amtMap = {};
    for (const it of items) amtMap[it.raw_name] = it.amount_g;
    const [dis] = await db.query('SELECT id, raw_name, amount_g FROM dish_items WHERE dish_id = ?', [md.id]);
    for (const d of dis) {
      const amt = amtMap[d.raw_name];
      if (amt != null && Number(amt) > 0) {
        await db.query('UPDATE dish_items SET amount_g = ? WHERE id = ?', [amt, d.id]);
        filled++;
      }
      dishCount++;
    }
  }
  console.log(`[3] amount_g 回填完成: filled=${filled}, dish_items总数=${dishCount}, 无菜品库匹配的meal_dishes=${noLib}`);

  // 4. 校验
  const [[v]] = await db.query('SELECT SUM(amount_g>0) WITH_G, COUNT(*) TOT FROM dish_items');
  console.log('[4] 回填后 dish_items amount_g>0:', v.WITH_G, '/', v.TOT);
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });

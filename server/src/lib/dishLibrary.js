const db = require('../db');
const { DISH_LIBRARY_DDL } = require('../schema');
const SEED = require('../seed/dishSeed');

/** 建表 + 首次启动灌入常用菜品（已有数据则跳过） */
async function ensureDishLibrary() {
  await db.query(DISH_LIBRARY_DDL);
  const [[{ c }]] = await db.query('SELECT COUNT(*) c FROM dish_library');
  if (c > 0) return;
  for (const d of SEED) {
    const items = d.items.map(([n, g]) => ({ raw_name: n, amount_g: g }));
    await db.query(
      'INSERT IGNORE INTO dish_library (name, category, items_json) VALUES (?,?,?)',
      [d.name, d.category || '', JSON.stringify(items)]
    );
  }
  console.log(`[dish_library] 已初始化 ${SEED.length} 道常用菜品`);
}

module.exports = { ensureDishLibrary };

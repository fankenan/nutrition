const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { parse } = require('csv-parse/sync');
const db = require('../db');
const { DDL } = require('../schema');
const { detectGroup } = require('../lib/nutrients');
const { WST_NUTRIENT, WST_GROUP, DRIS, AGE_KEYS } = require('../lib/standardsData');

const DATA_DIR = path.resolve(__dirname, '../../../data');

const NUM_COLS = ['edible', 'water', 'energy_kj', 'protein', 'fat', 'cholesterol', 'ash', 'carb', 'fiber',
  'carotene', 'vit_a', 'alpha_te', 'vit_b1', 'vit_b2', 'vit_b3', 'vit_c', 'ca', 'p', 'k', 'na', 'mg',
  'fe', 'zn', 'se', 'cu', 'mn', 'i', 'sfa', 'mufa', 'pufa', 'total_fa'];

async function createTables() {
  const stmts = DDL.split(';').map((s) => s.trim()).filter(Boolean);
  for (const s of stmts) await db.query(s);
  console.log('[schema] 表结构就绪');
}

async function importFoods() {
  const [cnt] = await db.query('SELECT COUNT(*) c FROM foods');
  if (cnt[0].c > 0) {
    console.log(`[foods] 已有 ${cnt[0].c} 条，跳过（如需重导入请先清空 foods 表）`);
    return;
  }
  const csv = fs.readFileSync(path.join(DATA_DIR, 'foods.csv'), 'utf8');
  const rows = parse(csv, { columns: true, skip_empty_lines: true, bom: true });
  const cols = ['name', 'category_l1', 'category_l2', ...NUM_COLS, 'group_key'];
  const values = [];
  for (const r of rows) {
    if (!r.name) continue;
    const g = detectGroup({ name: r.name, category_l1: r.category_l1 });
    values.push([
      r.name, r.category_l1 || '', r.category_l2 || '',
      ...NUM_COLS.map((c) => (r[c] === '' || r[c] == null ? null : Number(r[c]))),
      g
    ]);
  }
  for (let i = 0; i < values.length; i += 400) {
    const chunk = values.slice(i, i + 400);
    const ph = chunk.map(() => `(${cols.map(() => '?').join(',')})`).join(',');
    await db.query(`INSERT INTO foods (${cols.join(',')}) VALUES ${ph}`, chunk.flat());
  }
  console.log(`[foods] 导入 ${values.length} 条食物成分数据`);
}

async function seedWST() {
  await db.query('DELETE FROM standard_wst554');
  await db.query('DELETE FROM standard_wst554_group');
  const vals = [];
  for (const [age, obj] of Object.entries(WST_NUTRIENT)) {
    for (const [key, sexVal] of Object.entries(obj)) {
      for (const [sex, v] of Object.entries(sexVal)) vals.push([age, sex, key, v]);
    }
  }
  for (let i = 0; i < vals.length; i += 200) {
    const chunk = vals.slice(i, i + 200);
    await db.query(
      `INSERT INTO standard_wst554 (age_group, sex, nutrient_key, value) VALUES ${chunk.map(() => '(?,?,?,?)').join(',')}`,
      chunk.flat()
    );
  }
  const gvals = [];
  for (const [scope, ages] of Object.entries(WST_GROUP)) {
    for (const [age, groups] of Object.entries(ages)) {
      for (const [gk, range] of Object.entries(groups)) gvals.push([age, scope, gk, range[0], range[1]]);
    }
  }
  await db.query(
    `INSERT INTO standard_wst554_group (age_group, scope, group_key, min_g, max_g) VALUES ${gvals.map(() => '(?,?,?,?,?)').join(',')}`,
    gvals.flat()
  );
  console.log(`[wst554] 标准 ${vals.length} 条 + 食物种类 ${gvals.length} 条`);
}

async function seedDRIs() {
  const [cnt] = await db.query('SELECT COUNT(*) c FROM standard_dris WHERE verified = 1');
  if (cnt[0].c > 0) {
    console.log('[dris] 已存在已核对数据，跳过预填');
    return;
  }
  await db.query('DELETE FROM standard_dris WHERE verified = 0');
  const vals = [];
  for (const [nutrient, ages] of Object.entries(DRIS)) {
    for (const age of AGE_KEYS) {
      const bySex = ages[age];
      if (!bySex) continue;
      for (const sex of ['男', '女']) {
        const v = bySex[sex];
        if (!v) continue;
        vals.push([age, sex, nutrient, v.ear, v.rni, v.ai, v.ul, v.amdrMin, v.amdrMax, 0, 'DRIs2023预填(待核对)']);
      }
    }
  }
  for (let i = 0; i < vals.length; i += 200) {
    const chunk = vals.slice(i, i + 200);
    await db.query(
      `INSERT INTO standard_dris (age_group, sex, nutrient_key, ear, rni, ai, ul, amdr_min, amdr_max, verified, source)
       VALUES ${chunk.map(() => '(?,?,?,?,?,?,?,?,?,?,?)').join(',')}`,
      chunk.flat()
    );
  }
  console.log(`[dris] 预填 ${vals.length} 条（verified=0 待核对）`);
}

async function seedAdmin() {
  const [u] = await db.query('SELECT id FROM users WHERE username = ?', ['admin']);
  if (u.length) return;
  const hash = bcrypt.hashSync(process.env.ADMIN_INIT_PASSWORD || 'admin123', 10);
  await db.query('INSERT INTO users (username, password_hash, display_name, role) VALUES (?,?,?,?)', ['admin', hash, '系统管理员', 'admin']);
  console.log('[admin] 已创建管理员 admin / admin123');
}

(async () => {
  try {
    await createTables();
    await importFoods();
    await seedWST();
    await seedDRIs();
    await seedAdmin();
    console.log('== 数据初始化完成 ==');
  } catch (e) {
    console.error('初始化失败：', e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();

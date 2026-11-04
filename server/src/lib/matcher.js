/**
 * 食材名称匹配引擎（自学习）
 * 匹配链路：精确名 → 映射库(学习) → 内置同义词 → 模糊候选(Top5) → 无匹配(人工确认后入库)
 * 说明：不使用营养成分表的"别名或俗名"列，全部由本引擎识别 + 人工确认学习。
 */

const STOP_CHARS = /[\s（）()【】·、,，"'"`~!！?？:：;；]/g;
// 烹饪/加工修饰词，规范化时剔除
const MODIFIERS = ['鲜', '净', '去皮', '去骨', '去根', '生', '鲜的', '新鲜', '干', '水发', '泡发'];
const CUT_WORDS = ['丝', '片', '丁', '块', '末', '条', '段', '粒', '蓉', '泥', '仁', '圈', '卷', '排'];

// 内置同义词（系统预置，人工确认结果会写入 ingredient_map 表，优先级更高）
const BUILTIN_SYNONYMS = {
  西红柿: '番茄', 番茄: '番茄', 圣女果: '樱桃番茄', 土豆: '马铃薯', 洋芋: '马铃薯', 山药蛋: '马铃薯',
  鸡脯: '鸡胸脯肉', 鸡胸: '鸡胸脯肉', 鸡脯肉: '鸡胸脯肉', 鸡胸肉: '鸡胸脯肉', 鸡腿肉: '鸡腿',
  瘦猪肉: '猪肉(瘦)', 猪瘦肉: '猪肉(瘦)', 后腿肉: '猪肉(腿)', 排骨: '猪小排', 五花肉: '猪肉(肋条肉)', 猪肉: '猪肉(肥瘦)(均值)', 大肉: '猪肉(肥瘦)(均值)',
  牛肉: '牛肉(肥瘦)(均值)', 羊肉: '羊肉(肥瘦)(均值)', 牛腩: '牛肉(肥瘦)(均值)', 猪肝: '猪肝',
  鸡肉: '鸡(均值)', 鸡块: '鸡(均值)', 鸡腿肉: '鸡腿', 鸡翅: '鸡翅',
  大米: '稻米', 米饭: '米饭(蒸)', 面粉: '小麦粉(标准粉)', 馒头: '馒头',
  食用油: '植物油', 植物油: '植物油', 花生油: '花生油', 色拉油: '色拉油', 豆油: '大豆油', 菜籽油: '菜籽油',
  木耳: '木耳(水发)', 银耳: '银耳(干)', 香菇: '香菇(鲜)', 金针菇: '金针菇', 平菇: '平菇(鲜)',
  鸡蛋: '鸡蛋(均值)', '鸡蛋(白皮)': '鸡蛋(均值)', 鸭蛋: '鸭蛋',
  牛奶: '牛乳(均值)', 纯牛奶: '牛乳(均值)', 酸奶: '酸奶(均值)',
  豆腐: '豆腐(均值)', 北豆腐: '豆腐(北)', 南豆腐: '豆腐(南)', 豆干: '豆腐干', 千张: '千张',
  大白菜: '大白菜(均值)', 白菜: '大白菜(均值)', 青菜: '小白菜', 油菜: '油菜', 菠菜: '菠菜',
  青椒: '柿子椒', 菜椒: '柿子椒', 柿子椒: '柿子椒', 尖椒: '辣椒(青)', 胡萝卜: '胡萝卜', 白萝卜: '白萝卜',
  芹菜: '芹菜(茎)', 西芹: '芹菜(茎)', 黄瓜: '黄瓜', 冬瓜: '冬瓜', 南瓜: '南瓜', 茄子: '茄子(均值)',
  莴苣: '莴笋[莴苣](鲜)', 莴笋: '莴笋[莴苣](鲜)', 生菜: '生菜(叶用莴苣)', 包菜: '甘蓝', 卷心菜: '甘蓝', 圆白菜: '甘蓝', 花菜: '菜花', 西兰花: '西兰花', 蒜苔: '蒜苗',
  洋葱: '洋葱', 大葱: '葱(大葱)', 葱: '小葱', 姜: '姜', 大蒜: '大蒜', 蒜: '大蒜',
  带鱼: '带鱼', 草鱼: '草鱼', 鲤鱼: '鲤鱼', 鲢鱼: '鲢鱼', 鲫鱼: '鲫鱼', 虾: '河虾', 海虾: '海虾', 虾仁: '海虾',
  粉丝: '粉丝', 粉条: '粉条', 白糖: '白砂糖', 糖: '白砂糖', 盐: '精盐', 食盐: '精盐',
  花生: '花生仁(生)', 花生米: '花生仁(生)', 芝麻: '芝麻(白)', 核桃: '核桃(鲜)',
  紫菜: '紫菜(干)', 海带: '海带(鲜)', 豆腐皮: '豆腐皮', 腐竹: '腐竹', 豆浆: '豆浆'
};

function stripBrackets(s) {
  return String(s || '').replace(/[（(【\[][^）)】\]]*[）)】\]]/g, '');
}

function normalize(name) {
  if (!name) return '';
  let s = String(name).replace(STOP_CHARS, '');
  s = s.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  s = s.replace(/[0-9.]+(g|G|克|ml|ML|毫升)/g, '');
  return s.trim();
}

// 学校食材名专用：额外剔除修饰词与刀工词（如“土豆丝”“鲜香菇”“净瘦肉”）
function normalizeInput(name) {
  let s = normalize(name);
  for (const w of MODIFIERS) s = s.split(w).join('');
  let changed = true;
  while (changed) {
    changed = false;
    for (const w of CUT_WORDS) {
      if (s.length > 2 && s.endsWith(w)) {
        s = s.slice(0, -w.length);
        changed = true;
      }
    }
  }
  return s.trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const dist = levenshtein(a, b);
  let score = 1 - dist / Math.max(a.length, b.length);
  if (a.includes(b) || b.includes(a)) score = Math.max(score, 0.82);
  // 公共字符比例加成（中文顺序不敏感）
  const set = new Set(a.split(''));
  let common = 0;
  for (const ch of new Set(b.split(''))) if (set.has(ch)) common++;
  const dice = (2 * common) / (new Set(a).size + new Set(b).size || 1);
  return Math.max(score, dice * 0.9);
}

async function loadFoods(db) {
  const [rows] = await db.query('SELECT id, name, category_l1, edible FROM foods');
  return buildCache(rows);
}

// 构造匹配缓存：_n 全名规范化 / _s 去括号后规范化
function buildCache(rows) {
  return rows.map((r) => ({
    ...r,
    _n: normalize(r.name),
    _s: normalize(stripBrackets(r.name))
  }));
}

/**
 * 匹配单个食材名
 * @returns {{status:string, food?:object, score:number, candidates:Array}}
 */
async function matchOne(db, raw, foodsCache) {
  const rawN = normalizeInput(raw);
  const foods = foodsCache || (await loadFoods(db));
  if (!rawN) return { status: 'none', score: 0, candidates: [] };

  // 1. 精确（全名规范化命中）
  const exact = foods.find((f) => f._n === rawN);
  if (exact) return { status: 'exact', food: exact, score: 1, candidates: [exact] };

  // 2. 学习到的映射库
  const [maps] = await db.query('SELECT * FROM ingredient_map WHERE raw_name = ?', [rawN]);
  if (maps.length) {
    const food = foods.find((f) => f.id === maps[0].food_id);
    if (food) {
      await db.query('UPDATE ingredient_map SET use_count = use_count + 1 WHERE id = ?', [maps[0].id]);
      return { status: 'mapped', food, score: 1, candidates: [food] };
    }
  }

  // 3. 内置同义词
  const syn = BUILTIN_SYNONYMS[raw] || BUILTIN_SYNONYMS[rawN];
  if (syn) {
    const sn = normalize(syn);
    const f = foods.find((x) => x._n === sn || x._s === sn)
      || foods.find((x) => x._n.includes(sn) || (x._s && x._s.includes(sn)));
    if (f) return { status: 'synonym', food: f, score: 0.95, candidates: [f] };
  }

  // 4. 去括号短名精确（如“番茄”→“番茄[西红柿]”）；同名多个时取名称最短者（避开品牌条目）
  const shortHit = foods.filter((f) => f._s === rawN).sort((a, b) => a.name.length - b.name.length)[0];
  if (shortHit) return { status: 'exact', food: shortHit, score: 0.98, candidates: [shortHit] };

  // 5. 模糊候选
  const scored = foods
    .map((f) => ({ f, s: similarity(rawN, f._n) }))
    .filter((x) => x.s >= 0.55)
    .sort((a, b) => b.s - a.s)
    .slice(0, 5);
  if (scored.length) {
    const best = scored[0];
    return {
      status: best.s >= 0.95 ? 'auto' : 'fuzzy',
      food: best.s >= 0.95 ? best.f : null,
      score: best.s,
      candidates: scored.map((x) => ({ id: x.f.id, name: x.f.name, category: x.f.category_l1, score: +x.s.toFixed(3) }))
    };
  }
  return { status: 'none', score: 0, candidates: [] };
}

async function learn(db, raw, foodId, userId, source = 'manual') {
  const rawN = normalize(raw);
  await db.query(
    `INSERT INTO ingredient_map (raw_name, display_name, food_id, source, created_by, use_count)
     VALUES (?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE food_id = VALUES(food_id), use_count = use_count + 1, updated_at = NOW()`,
    [rawN, raw, foodId, source, userId || null]
  );
  await db.query('DELETE FROM unmatched_log WHERE raw_name = ?', [rawN]);
}

module.exports = { normalize, normalizeInput, stripBrackets, similarity, matchOne, learn, loadFoods, buildCache, BUILTIN_SYNONYMS };

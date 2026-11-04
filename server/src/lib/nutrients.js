const path = require('path');
const fs = require('fs');

// 营养字段元数据：key 与 foods 表列名一致
const NUTRIENTS = [
  { key: 'energy', label: '能量', unit: 'kcal', group: 'energy' },
  { key: 'protein', label: '蛋白质', unit: 'g', group: 'macro' },
  { key: 'fat', label: '脂肪', unit: 'g', group: 'macro' },
  { key: 'carb', label: '碳水化合物', unit: 'g', group: 'macro' },
  { key: 'fiber', label: '膳食纤维', unit: 'g', group: 'macro' },
  { key: 'cholesterol', label: '胆固醇', unit: 'mg', group: 'other' },
  { key: 'vit_a', label: '维生素A', unit: 'μgRAE', group: 'vitamin' },
  { key: 'vit_b1', label: '硫胺素(B1)', unit: 'mg', group: 'vitamin' },
  { key: 'vit_b2', label: '核黄素(B2)', unit: 'mg', group: 'vitamin' },
  { key: 'vit_b3', label: '烟酸', unit: 'mg', group: 'vitamin' },
  { key: 'vit_c', label: '维生素C', unit: 'mg', group: 'vitamin' },
  { key: 'vit_e', label: '维生素E', unit: 'mg α-TE', group: 'vitamin' },
  { key: 'ca', label: '钙', unit: 'mg', group: 'mineral' },
  { key: 'p', label: '磷', unit: 'mg', group: 'mineral' },
  { key: 'k', label: '钾', unit: 'mg', group: 'mineral' },
  { key: 'na', label: '钠', unit: 'mg', group: 'mineral' },
  { key: 'mg', label: '镁', unit: 'mg', group: 'mineral' },
  { key: 'fe', label: '铁', unit: 'mg', group: 'mineral' },
  { key: 'zn', label: '锌', unit: 'mg', group: 'mineral' },
  { key: 'se', label: '硒', unit: 'μg', group: 'mineral' },
  { key: 'cu', label: '铜', unit: 'mg', group: 'mineral' },
  { key: 'mn', label: '锰', unit: 'mg', group: 'mineral' },
  { key: 'i', label: '碘', unit: 'μg', group: 'mineral' },
  { key: 'sfa', label: '饱和脂肪酸', unit: 'g', group: 'fat' },
  { key: 'mufa', label: '单不饱和脂肪酸', unit: 'g', group: 'fat' },
  { key: 'pufa', label: '多不饱和脂肪酸', unit: 'g', group: 'fat' }
];

const NUTRIENT_MAP = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n]));

// 食物分组（对应 WS/T 554 表2~表4 的食物种类）
const FOOD_GROUPS = [
  { key: 'cereal', label: '谷薯类' },
  { key: 'veg', label: '蔬菜类' },
  { key: 'fruit', label: '水果类' },
  { key: 'meat', label: '畜禽肉类' },
  { key: 'fish', label: '鱼虾类' },
  { key: 'egg', label: '蛋类' },
  { key: 'milk', label: '奶及奶制品' },
  { key: 'soy', label: '大豆及坚果' },
  { key: 'oil', label: '植物油' },
  { key: 'salt', label: '盐' },
  { key: 'other', label: '其他' }
];

const SOY_KEYWORDS = ['黄豆', '大豆', '豆腐', '豆浆', '腐竹', '豆腐皮', '千张', '素鸡'];
const CEREAL_KEYWORDS = ['米', '面', '麦', '馒头', '花卷', '面包', '饼', '粥', '粉条', '玉米', '红薯', '白薯', '马铃薯', '土豆', '山药', '芋', '绿豆', '红豆', '芸豆', '蚕豆', '豌豆', '薏', '燕麦', '小米', '高粱', '荞麦'];

function detectGroup(food) {
  const name = food.name || '';
  const c1 = food.category_l1 || '';
  if (c1 === '油脂类') return 'oil';
  if (name.includes('盐') || name.includes('酱油') || name.includes('酱') && c1 === '调味品类') return 'salt';
  if (SOY_KEYWORDS.some((k) => name.includes(k))) return 'soy';
  if (c1 === '坚果、种子类') return 'soy';
  if (c1 === '蔬菜类及制品' || c1 === '菌藻类') return 'veg';
  if (c1 === '水果类及制品') return 'fruit';
  if (c1 === '畜肉类及制品' || c1 === '禽肉类及制品') return 'meat';
  if (c1 === '鱼虾蟹贝类') return 'fish';
  if (c1 === '蛋类及制品') return 'egg';
  if (c1 === '乳类及制品') return 'milk';
  if (c1 === '谷类及制品' || c1 === '薯类、淀粉及制品') return 'cereal';
  if (c1 === '干豆类及制品') return CEREAL_KEYWORDS.some((k) => name.includes(k)) ? 'cereal' : 'soy';
  if (c1 === '调味品类') return name.includes('油') ? 'oil' : 'salt';
  return 'other';
}

module.exports = { NUTRIENTS, NUTRIENT_MAP, FOOD_GROUPS, detectGroup };

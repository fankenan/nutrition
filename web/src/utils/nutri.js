// 营养相关公共工具：食物分组标签、营养状态展示

export const FOOD_GROUP_LABELS = {
  cereal: '谷薯类',
  veg: '蔬菜类',
  fruit: '水果类',
  meat: '畜禽肉类',
  fish: '鱼虾类',
  egg: '蛋类',
  milk: '奶及奶制品',
  soy: '大豆及坚果',
  oil: '植物油',
  salt: '盐',
  other: '其他'
}

export function grpLabel(k) {
  return FOOD_GROUP_LABELS[k] || k || '—'
}

// 状态 → 展示文案 + TDesign tag 主题
export function statusInfo(s) {
  switch (s) {
    case 'ok': return { text: '达标', theme: 'success' }
    case 'low': return { text: '偏低', theme: 'warning' }
    case 'high': return { text: '偏高', theme: 'danger' }
    case 'verylow': return { text: '严重不足', theme: 'danger' }
    case 'na': return { text: '无数据', theme: 'default' }
    default: return { text: s || '—', theme: 'default' }
  }
}

// 把带小数的营养数值做简洁展示
export function fmt(v, digits = 2) {
  const n = Number(v)
  if (v == null || isNaN(n)) return '—'
  return n.toFixed(digits)
}

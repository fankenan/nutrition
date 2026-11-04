import { pinyin } from 'pinyin-pro'

// 给选项数组预计算拼音索引，挂到 __py(全拼) / __ini(首字母) 字段
export function attachPinyin(options, textKey = 'label') {
  return options.map((o) => {
    const t = (o[textKey] || '').toString()
    const arr = pinyin(t, { toneType: 'none', type: 'array' })
    o.__py = arr.join('').toLowerCase()
    o.__ini = pinyin(t, { pattern: 'first', toneType: 'none', type: 'array' })
      .join('')
      .toLowerCase()
    return o
  })
}

// TDesign t-select 的 filter 函数：原始文本 / 首字母(仅开头) / 全拼(任意位置)
export function pinyinFilter(q, option) {
  if (!q) return true
  const ql = q.toLowerCase().trim()
  const t = (option.label || option.text || '').toString().toLowerCase()
  if (t.includes(ql)) return true
  if (option.__ini && option.__ini.startsWith(ql)) return true
  if (option.__py && option.__py.includes(ql)) return true
  return false
}

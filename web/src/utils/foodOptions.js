import http from '../api/http'
import { attachPinyin } from './pinyin'

let cache = null

// 拉取全量食材候选（带拼音索引），供所有下拉框复用
export async function getFoodOptions() {
  if (cache) return cache
  const { data } = await http.get('/foods/options')
  cache = attachPinyin(
    (data.list || []).map((f) => ({ label: f.name, value: f.id, category: f.category_l1 }))
  )
  return cache
}

// 新增/改名后清缓存，下次调用重新拉取
export function invalidateFoodOptions() {
  cache = null
}

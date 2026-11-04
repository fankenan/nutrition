<template>
  <div class="spark">
    <svg v-if="points.length > 1" :viewBox="`0 0 ${w} ${h}`" preserveAspectRatio="none" class="spark-svg">
      <defs>
        <linearGradient :id="gid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="color" stop-opacity="0.22" />
          <stop offset="100%" :stop-color="color" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path :d="areaPath" :fill="`url(#${gid})`" />
      <path :d="linePath" fill="none" :stroke="color" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" />
      <circle
        v-for="(p, i) in points" :key="i"
        :cx="p.x" :cy="p.y" r="2.8"
        :fill="'#fff'" :stroke="color" stroke-width="2"
      />
    </svg>
    <div v-else class="empty">数据不足</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  values: { type: Array, default: () => [] },
  color: { type: String, default: '#14b8a6' },
  height: { type: Number, default: 100 }
})

const w = 560
const h = computed(() => props.height)
const pad = 10
const gid = `sg-${Math.random().toString(36).slice(2, 8)}`

const points = computed(() => {
  const vals = props.values.filter((v) => v != null && !isNaN(Number(v)))
  if (!vals.length) return []
  const nums = props.values.map((v) => (v == null || isNaN(Number(v)) ? null : Number(v)))
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const step = nums.length > 1 ? (w - pad * 2) / (nums.length - 1) : 0
  const out = []
  nums.forEach((v, i) => {
    if (v == null) return
    const y = h.value - pad - ((v - min) / span) * (h.value - pad * 2)
    out.push({ x: pad + i * step, y })
  })
  return out
})

const linePath = computed(() => {
  const p = points.value
  if (p.length < 2) return ''
  let d = `M ${p[0].x} ${p[0].y}`
  for (let i = 1; i < p.length; i++) {
    const prev = p[i - 1]
    const cur = p[i]
    const cx = (prev.x + cur.x) / 2
    d += ` C ${cx} ${prev.y}, ${cx} ${cur.y}, ${cur.x} ${cur.y}`
  }
  return d
})

const areaPath = computed(() => {
  const p = points.value
  if (p.length < 2) return ''
  return `${linePath.value} L ${p[p.length - 1].x} ${h.value} L ${p[0].x} ${h.value} Z`
})
</script>

<style scoped>
.spark { width: 100%; height: 100%; display: flex; align-items: center; }
.spark-svg { width: 100%; height: 100%; }
.empty { width: 100%; text-align: center; color: var(--muted-2); font-size: 12px; }
</style>
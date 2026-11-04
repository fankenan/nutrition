<template>
  <div class="donut-wrap">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" class="donut">
      <circle
        :cx="c" :cy="c" :r="r"
        fill="none" stroke="#eef4f2" :stroke-width="thick"
      />
      <circle
        v-for="(s, i) in segments" :key="i"
        :cx="c" :cy="c" :r="r"
        fill="none"
        :stroke="s.color"
        :stroke-width="thick"
        :stroke-dasharray="`${s.len} ${circ - s.len}`"
        :stroke-dashoffset="-s.offset"
        stroke-linecap="butt"
        :style="{ transition: 'stroke-dasharray .8s cubic-bezier(.22,.61,.36,1), stroke-dashoffset .8s cubic-bezier(.22,.61,.36,1)' }"
      />
    </svg>
    <div class="donut-center">
      <div class="dc-val">{{ centerValue }}</div>
      <div class="dc-label">{{ centerLabel }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: { type: Array, default: () => [] }, // [{ label, value, color }]
  size: { type: Number, default: 190 },
  thick: { type: Number, default: 22 },
  centerValue: { type: String, default: '' },
  centerLabel: { type: String, default: '' }
})

const c = computed(() => props.size / 2)
const r = computed(() => (props.size - props.thick - 8) / 2)
const circ = computed(() => 2 * Math.PI * r.value)

const segments = computed(() => {
  const total = props.data.reduce((s, d) => s + (Number(d.value) || 0), 0) || 1
  let acc = 0
  return props.data.map((d) => {
    const frac = (Number(d.value) || 0) / total
    const len = frac * circ.value
    const seg = { color: d.color, len, offset: acc }
    acc += len
    return seg
  })
})
</script>

<style scoped>
.donut-wrap { position: relative; display: inline-grid; place-items: center; }
.donut { display: block; transform: rotate(-90deg); }
.donut-center {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  pointer-events: none;
}
.dc-val {
  font-family: var(--font-num);
  font-size: 22px; font-weight: 700;
  color: var(--text); letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}
.dc-label { font-size: 11px; color: var(--muted); margin-top: 1px; }
</style>
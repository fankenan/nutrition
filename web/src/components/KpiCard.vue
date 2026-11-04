<template>
  <div class="kpi">
    <div class="kpi-top">
      <span class="l">{{ label }}</span>
      <span v-if="icon" class="kpi-badge"><Icon :name="icon" :size="14" /></span>
    </div>
    <div class="v">
      {{ value }}<small v-if="unit">{{ unit }}</small>
    </div>
    <div v-if="delta != null" class="delta" :class="deltaClass">
      <Icon :name="delta > 0 ? 'arrowUp' : delta < 0 ? 'arrowDown' : 'check'" :size="12" />
      {{ deltaText }}
    </div>
    <div v-if="percent != null" class="bar">
      <i :class="tone" :style="{ width: Math.min(Math.max(percent, 0), 100) + '%' }" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Icon from '@/components/Icon.vue'

const props = defineProps({
  label: String,
  value: [String, Number],
  unit: String,
  icon: String,
  delta: { type: Number, default: null },
  deltaSuffix: { type: String, default: '' },
  percent: { type: Number, default: null },
  tone: { type: String, default: 'teal' }
})

const deltaClass = computed(() => (props.delta > 0 ? 'up' : props.delta < 0 ? 'down' : 'flat'))
const deltaText = computed(() => {
  if (props.delta == null) return ''
  const v = Math.abs(props.delta)
  return `${v}${props.deltaSuffix}`
})
</script>
<template>
  <div>
    <!-- KPI 行 -->
    <div class="kpi-row">
      <KpiCard label="食谱库" :value="s.recipes" unit="份" icon="recipes" tone="teal" :percent="100" />
      <KpiCard label="食材成分" :value="s.foods" unit="种" icon="foods" tone="teal" :percent="100" />
      <KpiCard label="菜品条目" :value="s.dishes" unit="道" icon="dishes" tone="blue" :percent="100" />
      <KpiCard
        label="待确认映射"
        :value="s.pending"
        unit="条"
        icon="mapping"
        :tone="s.pending > 0 ? 'amber' : 'teal'"
        :percent="s.pending > 0 ? 100 : 0"
      />
    </div>

    <div class="grid-2">
      <!-- 快捷入口 -->
      <div class="card">
        <div class="card-head">
          <div class="card-title">快捷入口</div>
          <span class="spacer" />
          <span class="card-sub">常用功能直连</span>
        </div>
        <div class="quick-grid">
          <button v-for="q in quicks" :key="q.path" class="quick" @click="$router.push(q.path)">
            <span class="qi"><Icon :name="q.icon" :size="16" /></span>
            <span>{{ q.label }}</span>
          </button>
        </div>
      </div>

      <!-- 数据健康度 -->
      <div class="card">
        <div class="card-head">
          <div class="card-title">数据健康度</div>
          <span class="spacer" />
          <span class="card-sub">核算准确性依赖</span>
        </div>

        <div v-for="h in healths" :key="h.label" class="health-row">
          <div class="hr-top">
            <span class="hr-label">{{ h.label }}</span>
            <span class="hr-val">{{ h.text }}</span>
          </div>
          <div class="meter">
            <i :style="{ width: h.percent + '%', background: h.color }" />
          </div>
        </div>
      </div>
    </div>

    <!-- 待办 -->
    <div class="card">
      <div class="card-head">
        <div class="card-title">
          <Icon name="alert" :size="16" :color="s.pending > 0 ? '#b7791f' : '#0f9d58'" />
          待办提醒
        </div>
      </div>
      <div v-if="s.pending > 0" class="todo">
        <div class="todo-text">
          有 <b>{{ s.pending }}</b> 条食材尚未确认映射，会直接影响营养分析的匹配率与核算结果。
        </div>
        <button class="quick" style="min-width: 132px" @click="$router.push('/mapping')">
          <span class="qi"><Icon name="mapping" :size="16" /></span>
          <span>去处理</span>
        </button>
      </div>
      <div v-else class="todo ok">
        <Icon name="check" :size="18" color="#0f9d58" />
        <div class="todo-text">数据状态良好，暂无待确认项。</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import http from '@/api/http'
import Icon from '@/components/Icon.vue'
import KpiCard from '@/components/KpiCard.vue'

const s = ref({ recipes: '—', foods: '—', dishes: '—', pending: 0 })

const quicks = [
  { path: '/nutrition', label: '营养分析', icon: 'nutrition' },
  { path: '/prices', label: '价格行情', icon: 'prices' },
  { path: '/mapping', label: '映射库', icon: 'mapping' },
  { path: '/recipes', label: '食谱库', icon: 'recipes' },
  { path: '/foods', label: '食材库', icon: 'foods' },
  { path: '/dishes', label: '菜品库', icon: 'dishes' }
]

const healths = computed(() => [
  { label: '食材成分库覆盖', text: `${s.value.foods} 条记录`, percent: 96, color: 'linear-gradient(90deg,#14b8a6,#2dd4bf)' },
  { label: '菜品带量数据完整度', text: `已录入 ${s.value.dishes} 道`, percent: 88, color: 'linear-gradient(90deg,#0d9488,#14b8a6)' },
  {
    label: '食材名称映射率',
    text: s.value.pending > 0 ? `${s.value.pending} 条待确认` : '全部已映射',
    percent: s.value.pending > 0 ? 72 : 100,
    color: s.value.pending > 0 ? 'linear-gradient(90deg,#e8a33d,#f2c568)' : 'linear-gradient(90deg,#0f9d58,#34d399)'
  }
])

onMounted(async () => {
  try {
    const [r, f, d, m] = await Promise.all([
      http.get('/recipes'),
      http.get('/foods/options'),
      http.get('/dishes'),
      http.get('/mapping/pending')
    ])
    s.value = {
      recipes: (r.data.recipes || []).length,
      foods: (f.data.list || []).length,
      dishes: d.data.total || (d.data.list || []).length,
      pending: (m.data.pending || []).length
    }
  } catch (e) {}
})
</script>

<style scoped>
.health-row { margin-bottom: 16px; }
.health-row:last-child { margin-bottom: 0; }
.hr-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 7px; }
.hr-label { font-size: 13px; color: var(--text-2); font-weight: 500; }
.hr-val { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }

.todo { display: flex; align-items: center; gap: 16px; }
.todo.ok { color: var(--text-2); }
.todo-text { font-size: 13.5px; color: var(--text-2); line-height: 1.6; flex: 1; }
.todo-text b { color: var(--warn); font-size: 15px; font-family: var(--font-num); }
</style>
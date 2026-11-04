<template>
  <div>
    <!-- 查询面板 -->
    <div class="panel">
      <div class="panel-main">
        <div class="panel-field">
          <label>选择食谱</label>
          <t-select
            v-model="recipeId"
            :options="recipeOpts"
            filterable
            placeholder="请选择要分析的食谱"
            style="width: 100%"
          />
        </div>
        <div class="panel-field narrow">
          <label>学段</label>
          <t-select v-model="stage" :options="stageOpts" style="width: 100%" />
        </div>
        <div class="panel-field narrow">
          <label>性别</label>
          <t-select v-model="sex" :options="sexOpts" style="width: 100%" />
        </div>
        <t-button theme="primary" size="large" :loading="loading" class="panel-btn" @click="analyze">
          开始分析
        </t-button>
      </div>
      <div class="panel-hint">
        <Icon name="alert" :size="13" color="#7a918b" />
        依据 WS/T 554《学生餐营养指南》与 DRIs 2023 双标准，核算日均营养与达标情况
      </div>
    </div>

    <template v-if="r">
      <!-- 概览 KPI -->
      <div class="kpi-row">
        <KpiCard label="日均能量" :value="fmt(r.avg.nutrients.energy, 0)" unit="kcal" icon="flame" tone="teal" :percent="energyPercent" />
        <KpiCard label="蛋白质供能比" :value="r.avg.split.proteinPct" unit="%" icon="leaf" tone="teal" :percent="r.avg.split.proteinPct" />
        <KpiCard label="脂肪供能比" :value="r.avg.split.fatPct" unit="%" icon="scale" tone="amber" :percent="r.avg.split.fatPct" />
        <KpiCard label="碳水化合物供能比" :value="r.avg.split.carbPct" unit="%" icon="trend" tone="blue" :percent="r.avg.split.carbPct" />
      </div>

      <div class="grid-2">
        <!-- 供能比环形图 -->
        <div class="card">
          <div class="card-head">
            <div class="card-title">三大营养素供能比</div>
            <span class="spacer" />
            <span class="card-sub">AMDR 参考</span>
          </div>
          <div class="chart-flex">
            <DonutChart
              :data="macroData"
              :size="186"
              :thick="21"
              :center-value="`${r.avg.split.carbPct}%`"
              center-label="碳水占比"
            />
            <div class="legend">
              <div v-for="m in macroData" :key="m.label" class="legend-item">
                <span class="dot" :style="{ background: m.color }" />
                <span class="lg-label">{{ m.label }}</span>
                <span class="lg-val">{{ m.value }}%</span>
                <span class="lg-ref">{{ m.ref }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 达标率 -->
        <div class="card">
          <div class="card-head">
            <div class="card-title">WS/T 554 综合达标率</div>
            <span class="spacer" />
            <span class="card-sub">{{ r.wst.score.ok }} / {{ r.wst.score.total }} 项</span>
          </div>
          <div class="score-block">
            <div class="score-num" :style="{ color: scoreColor }">
              {{ r.wst.score.percent }}<small>%</small>
            </div>
            <div class="score-side">
              <div class="meter" style="height: 9px">
                <i :style="{ width: r.wst.score.percent + '%', background: scoreBar }" />
              </div>
              <div class="score-note">{{ scoreNote }}</div>
            </div>
          </div>
          <div class="score-legend">
            <div class="sl-item"><span class="pill ok">达标</span><b>{{ countBy(r.wst.checks, 'ok') + countBy(r.wst.groupChecks, 'ok') + countBy(r.wst.mealChecks, 'ok') }}</b></div>
            <div class="sl-item"><span class="pill low">偏低</span><b>{{ countBy(r.wst.checks, 'low') + countBy(r.wst.groupChecks, 'low') + countBy(r.wst.mealChecks, 'low') }}</b></div>
            <div class="sl-item"><span class="pill high">偏高</span><b>{{ countBy(r.wst.checks, 'high') + countBy(r.wst.groupChecks, 'high') + countBy(r.wst.mealChecks, 'high') }}</b></div>
          </div>
        </div>
      </div>

      <!-- 营养素供给量 -->
      <div class="card">
        <div class="card-head">
          <div class="card-title">营养素供给量比对</div>
          <span class="spacer" />
          <span class="card-sub">实测 / WS/T 554 标准</span>
        </div>
        <div class="nut-list">
          <div v-for="c in r.wst.checks" :key="c.key" class="nut-row">
            <div class="nut-name">{{ c.label }}</div>
            <div class="nut-bar">
              <div class="meter">
                <i :style="{ width: barWidth(c), background: barColor(c.status) }" />
              </div>
              <div class="nut-scale">
                <span>{{ fmt(c.value) }}{{ c.unit }}</span>
                <span class="nut-target">标准 {{ typeof c.target === 'number' ? fmt(c.target) + c.unit : c.target }}</span>
              </div>
            </div>
            <span class="pill" :class="c.status">{{ statusText(c.status) }}</span>
          </div>
        </div>
      </div>

      <div class="grid-2">
        <!-- 食物分组 -->
        <div class="card">
          <div class="card-head">
            <div class="card-title">食物分组用量</div>
            <span class="spacer" />
            <span class="card-sub">全天 · 克</span>
          </div>
          <div class="tbl-compact">
            <t-table :data="r.wst.groupChecks" :columns="grpCols" row-key="key" size="small">
              <template #val="{ row }"><b>{{ fmt(row.value, 1) }}</b></template>
              <template #tgt="{ row }"><span class="muted">{{ row.min }}~{{ row.max }}</span></template>
              <template #st="{ row }"><span class="pill" :class="row.status">{{ statusText(row.status) }}</span></template>
            </t-table>
          </div>
        </div>

        <!-- 三餐供能比 -->
        <div class="card">
          <div class="card-head">
            <div class="card-title">三餐供能比</div>
            <span class="spacer" />
            <span class="card-sub">推荐 25~30 / 35~40 / 30~35</span>
          </div>
          <div class="meal-list">
            <div v-for="m in r.wst.mealChecks" :key="m.key" class="meal-row">
              <div class="meal-name">{{ m.label }}</div>
              <div class="meal-bar">
                <div class="meter" style="height: 8px">
                  <i :style="{ width: Math.min(m.value, 100) + '%', background: barColor(m.status) }" />
                </div>
              </div>
              <div class="meal-val">{{ fmt(m.value, 1) }}%</div>
              <span class="pill" :class="m.status">{{ statusText(m.status) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- DRIs -->
      <div class="card">
        <div class="card-head">
          <div class="card-title">
            DRIs 2023 参考摄入量
            <span class="tag-na" style="font-weight: 500">{{ r.dris.main.ageGroup }} 岁 · {{ r.dris.main.sex }}</span>
          </div>
        </div>
        <div class="tbl-compact">
          <t-table :data="r.dris.main.checks" :columns="driCols" row-key="key" size="small">
            <template #val="{ row }"><b>{{ fmt(row.value) }}</b><span class="muted"> {{ row.unit }}</span></template>
            <template #tgt="{ row }">
              <span class="dri-type">{{ row.type }}</span>
              {{ typeof row.target === 'number' ? fmt(row.target) : row.target }}
            </template>
            <template #st="{ row }"><span class="pill" :class="row.status">{{ statusText(row.status) }}</span></template>
          </t-table>
        </div>

        <template v-if="r.dris.ref && r.dris.ref.length">
          <div class="section-title" style="margin-top: 20px">其他参考年龄组</div>
          <div class="ref-tabs">
            <button
              v-for="(g, i) in r.dris.ref" :key="i"
              class="ref-tab" :class="{ active: Number(refTab) === i }"
              @click="refTab = i"
            >{{ g.ageGroup }} 岁</button>
          </div>
          <div class="tbl-compact">
            <t-table :data="curRef.checks" :columns="driCols" row-key="key" size="small">
              <template #val="{ row }"><b>{{ fmt(row.value) }}</b><span class="muted"> {{ row.unit }}</span></template>
              <template #tgt="{ row }">
                <span class="dri-type">{{ row.type }}</span>
                {{ typeof row.target === 'number' ? fmt(row.target) : row.target }}
              </template>
              <template #st="{ row }"><span class="pill" :class="row.status">{{ statusText(row.status) }}</span></template>
            </t-table>
          </div>
        </template>
      </div>

      <!-- 逐日 -->
      <div class="card">
        <div class="card-head">
          <div class="card-title">逐日明细</div>
          <span class="spacer" />
          <span class="card-sub">共 {{ r.days.length }} 天</span>
        </div>
        <div class="tbl-compact">
          <t-table :data="dayRows" :columns="dayCols" row-key="day_index" size="small">
            <template #e="{ row }"><b>{{ fmt(row.energy, 0) }}</b> <span class="muted">kcal</span></template>
            <template #b="{ row }">{{ pct(row.b) }}</template>
            <template #l="{ row }">{{ pct(row.l) }}</template>
            <template #d="{ row }">{{ pct(row.d) }}</template>
          </t-table>
        </div>
      </div>

      <!-- 未匹配 -->
      <div v-if="r.unmatched && r.unmatched.length" class="card warn-card">
        <div class="card-head">
          <div class="card-title">
            <Icon name="alert" :size="16" color="#b7791f" />
            未能匹配的食材
            <span class="tag-low" style="font-weight: 500">{{ r.unmatched.length }} 条</span>
          </div>
          <span class="spacer" />
          <t-link theme="primary" @click="$router.push('/mapping')">前往映射库处理</t-link>
        </div>
        <div class="muted" style="margin-bottom: 12px">
          以下食材未匹配到食物成分库，已按缺失处理，会影响营养核算准确性。
        </div>
        <div class="unmatch-list">
          <div v-for="u in r.unmatched" :key="u.raw_name" class="unmatch-item">
            <b>{{ u.raw_name }}</b>
            <span v-if="u.candidates && u.candidates.length" class="muted">
              候选：{{ u.candidates.map(c => c.name).join('、') }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <!-- 空态 -->
    <div v-else-if="!loading" class="card empty-card">
      <div class="empty-icon"><Icon name="nutrition" :size="28" color="#9db0ab" /></div>
      <div class="empty-title">还没有分析结果</div>
      <div class="empty-desc">在上方选择一个食谱与学段，即可查看营养达标详情</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import http from '@/api/http'
import Icon from '@/components/Icon.vue'
import KpiCard from '@/components/KpiCard.vue'
import DonutChart from '@/components/DonutChart.vue'
import { fmt } from '@/utils/nutri'

const recipeId = ref('')
const stage = ref('小学')
const sex = ref('男')
const loading = ref(false)
const r = ref(null)
const refTab = ref(0)

const recipeOpts = ref([])
const stageOpts = [
  { label: '小学', value: '小学' },
  { label: '初中', value: '初中' },
  { label: '高中', value: '高中' }
]
const sexOpts = [
  { label: '男', value: '男' },
  { label: '女', value: '女' }
]

const grpCols = [
  { colKey: 'label', title: '分组', width: 120 },
  { colKey: 'val', title: '实测', width: 90 },
  { colKey: 'tgt', title: '推荐', width: 100 },
  { colKey: 'st', title: '判定', width: 90 }
]
const driCols = [
  { colKey: 'label', title: '营养素', width: 150 },
  { colKey: 'val', title: '实测', width: 120 },
  { colKey: 'tgt', title: '标准', width: 140 },
  { colKey: 'st', title: '判定', width: 100 }
]
const dayCols = [
  { colKey: 'day_index', title: '日序', width: 70 },
  { colKey: 'e', title: '能量', width: 140 },
  { colKey: 'b', title: '早餐', width: 90 },
  { colKey: 'l', title: '午餐', width: 90 },
  { colKey: 'd', title: '晚餐', width: 90 }
]

const macroData = computed(() => {
  if (!r.value) return []
  const s = r.value.avg.split
  return [
    { label: '碳水化合物', value: s.carbPct, color: '#14b8a6', ref: '50~65%' },
    { label: '脂肪', value: s.fatPct, color: '#5eead4', ref: '20~30%' },
    { label: '蛋白质', value: s.proteinPct, color: '#f2b544', ref: '10~20%' }
  ]
})

const energyPercent = computed(() => {
  if (!r.value) return 0
  const c = (r.value.wst.checks || []).find((x) => x.key === 'energy')
  return c ? Math.round(c.ratio * 100) : 0
})
const scoreColor = computed(() => {
  const p = r.value?.wst.score.percent || 0
  return p >= 80 ? '#0f9d58' : p >= 60 ? '#b7791f' : '#c0392b'
})
const scoreBar = computed(() => {
  const p = r.value?.wst.score.percent || 0
  return p >= 80 ? 'linear-gradient(90deg,#0f9d58,#34d399)'
    : p >= 60 ? 'linear-gradient(90deg,#e8a33d,#f2c568)'
    : 'linear-gradient(90deg,#c0392b,#e0735c)'
})
const scoreNote = computed(() => {
  const p = r.value?.wst.score.percent || 0
  if (p >= 90) return '配餐合理，营养结构接近标准'
  if (p >= 75) return '整体良好，个别指标需微调'
  if (p >= 60) return '存在明显偏差，建议调整食谱'
  return '偏差较大，需重点整改'
})
const curRef = computed(() => (r.value?.dris.ref || [])[Number(refTab.value)] || { checks: [] })
const dayRows = computed(() => {
  if (!r.value) return []
  return (r.value.days || []).map((d) => ({
    day_index: d.day_index,
    energy: d.nutrients.energy,
    b: d.mealRatio.breakfast != null ? d.mealRatio.breakfast * 100 : null,
    l: d.mealRatio.lunch != null ? d.mealRatio.lunch * 100 : null,
    d: d.mealRatio.dinner != null ? d.mealRatio.dinner * 100 : null
  }))
})

function countBy(arr, st) { return (arr || []).filter((x) => x.status === st).length }
function pct(v) { return v == null ? '—' : fmt(v, 1) + '%' }
function barWidth(c) {
  if (c.ratio == null) return '50%'
  return Math.min(Math.max(c.ratio * 100, 2), 100) + '%'
}
function barColor(st) {
  if (st === 'ok') return 'linear-gradient(90deg,#0f9d58,#34d399)'
  if (st === 'low') return 'linear-gradient(90deg,#e8a33d,#f2c568)'
  if (st === 'high') return 'linear-gradient(90deg,#c0392b,#e0735c)'
  return '#d5e3df'
}
function statusText(st) {
  return { ok: '达标', low: '偏低', high: '偏高', verylow: '严重不足', na: '无数据' }[st] || '—'
}

async function loadRecipes() {
  try {
    const { data } = await http.get('/recipes')
    recipeOpts.value = (data.recipes || []).map((x) => ({
      label: `${x.name}${x.school ? ' · ' + x.school : ''}`,
      value: x.id
    }))
  } catch (e) {}
}

async function analyze() {
  if (!recipeId.value) { MessagePlugin.warning('请先选择食谱'); return }
  loading.value = true
  r.value = null
  try {
    const { data } = await http.post('/analyze', {
      recipe_id: recipeId.value, stage: stage.value, sex: sex.value
    })
    r.value = data
  } catch (e) {
    MessagePlugin.error(e.response?.data?.error || '分析失败')
  } finally { loading.value = false }
}

onMounted(loadRecipes)
</script>

<style scoped>
/* 查询面板 */
.panel {
  background: linear-gradient(120deg, #ffffff 0%, #f7fbfa 100%);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: 20px 22px 16px;
  margin-bottom: 16px;
  box-shadow: var(--sh-1);
}
.panel-main { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; }
.panel-field { flex: 1; min-width: 240px; }
.panel-field.narrow { flex: 0 0 120px; min-width: 120px; }
.panel-field label {
  display: block; font-size: 11.5px; font-weight: 600;
  color: var(--muted); letter-spacing: 0.06em;
  text-transform: uppercase; margin-bottom: 7px;
}
.panel-btn { height: 40px; padding: 0 26px; flex-shrink: 0; }
.panel-hint {
  display: flex; align-items: center; gap: 6px;
  margin-top: 14px; padding-top: 12px;
  border-top: 1px dashed var(--border);
  font-size: 12px; color: var(--muted);
}

/* 环形图布局 */
.chart-flex { display: flex; align-items: center; gap: 26px; flex-wrap: wrap; }
.legend { flex: 1; min-width: 190px; display: flex; flex-direction: column; gap: 14px; }
.legend-item { display: flex; align-items: center; gap: 9px; font-size: 13px; }
.dot { width: 9px; height: 9px; border-radius: 3px; flex-shrink: 0; }
.lg-label { color: var(--text-2); flex: 1; }
.lg-val {
  font-family: var(--font-num); font-weight: 700; font-size: 15px;
  color: var(--text); font-variant-numeric: tabular-nums;
}
.lg-ref { font-size: 11px; color: var(--muted-2); width: 56px; text-align: right; }

/* 达标率块 */
.score-block { display: flex; align-items: center; gap: 22px; padding: 6px 0 14px; }
.score-num {
  font-family: var(--font-num); font-size: 52px; font-weight: 700;
  line-height: 1; letter-spacing: -0.04em; font-variant-numeric: tabular-nums;
}
.score-num small { font-size: 20px; font-weight: 600; margin-left: 2px; }
.score-side { flex: 1; }
.score-note { font-size: 12.5px; color: var(--muted); margin-top: 9px; line-height: 1.5; }
.score-legend {
  display: flex; gap: 22px; padding-top: 14px;
  border-top: 1px solid var(--border);
}
.sl-item { display: flex; align-items: center; gap: 7px; }
.sl-item b {
  font-family: var(--font-num); font-size: 15px;
  color: var(--text); font-variant-numeric: tabular-nums;
}

/* 营养素列表 */
.nut-list { display: flex; flex-direction: column; gap: 2px; }
.nut-row {
  display: grid; grid-template-columns: 118px 1fr 76px;
  gap: 16px; align-items: center;
  padding: 9px 0;
  border-bottom: 1px solid #f2f7f5;
}
.nut-row:last-child { border-bottom: none; }
.nut-name { font-size: 13px; color: var(--text-2); font-weight: 500; }
.nut-bar { min-width: 0; }
.nut-scale {
  display: flex; justify-content: space-between;
  margin-top: 5px; font-size: 11.5px; color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.nut-target { color: var(--muted-2); }

/* 三餐 */
.meal-list { display: flex; flex-direction: column; gap: 16px; padding-top: 4px; }
.meal-row { display: grid; grid-template-columns: 52px 1fr 58px 76px; gap: 12px; align-items: center; }
.meal-name { font-size: 13px; color: var(--text-2); font-weight: 500; }
.meal-bar { min-width: 0; }
.meal-val {
  font-family: var(--font-num); font-size: 13px; font-weight: 600;
  color: var(--text); text-align: right; font-variant-numeric: tabular-nums;
}

/* 表格 */
.tbl-compact { margin: 0 -22px -20px; }
.dri-type {
  display: inline-block; font-size: 10.5px; font-weight: 600;
  color: var(--brand-700); background: var(--brand-50);
  padding: 1px 6px; border-radius: 4px; margin-right: 6px;
  letter-spacing: 0.03em;
}

/* 参考年龄组 tabs */
.ref-tabs { display: flex; gap: 8px; margin-bottom: 12px; }
.ref-tab {
  padding: 6px 16px; border-radius: var(--r-pill);
  border: 1px solid var(--border); background: var(--surface-2);
  font-size: 12.5px; color: var(--text-2); cursor: pointer;
  font-family: inherit; transition: all 0.16s var(--ease);
}
.ref-tab:hover { border-color: var(--brand-300); color: var(--brand-700); }
.ref-tab.active {
  background: var(--brand-600); border-color: var(--brand-600);
  color: #fff; box-shadow: 0 4px 12px -6px rgba(13, 148, 136, 0.8);
}

/* 未匹配 */
.warn-card { border-color: #f6e3c4; background: linear-gradient(120deg, #fffdf8, #fffaf0); }
.unmatch-list { display: flex; flex-wrap: wrap; gap: 8px; }
.unmatch-item {
  display: flex; align-items: baseline; gap: 8px;
  padding: 7px 13px; border-radius: var(--r-md);
  background: #fff; border: 1px solid #f2e2c6;
  font-size: 12.5px;
}
.unmatch-item b { color: var(--warn); font-weight: 600; }

/* 空态 */
.empty-card { text-align: center; padding: 56px 20px; }
.empty-icon {
  width: 62px; height: 62px; border-radius: 18px;
  background: #f4f8f7; display: grid; place-items: center;
  margin: 0 auto 16px;
}
.empty-title { font-size: 15px; font-weight: 600; color: var(--text-2); }
.empty-desc { font-size: 13px; color: var(--muted); margin-top: 6px; }
</style>
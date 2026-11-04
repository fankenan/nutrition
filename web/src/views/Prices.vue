<template>
  <div>
    <div class="seg-wrap">
      <button
        v-for="s in sources" :key="s.value"
        class="seg-btn" :class="{ active: source === s.value }"
        @click="source = s.value"
      >{{ s.label }}</button>
    </div>

    <div class="toolbar">
      <t-select v-model="date" :options="dateOpts" placeholder="报价日" style="width: 190px" @change="load" />
      <t-select v-model="cat" :options="catOpts" placeholder="全部分类" style="width: 160px" clearable @change="load" />
      <div class="tool-search">
        <Icon name="search" :size="15" color="#9db0ab" />
        <input v-model="q" placeholder="搜索名称" @input="debouncedLoad" />
      </div>
      <span class="spacer" />
      <span class="count-chip">
        <b>{{ list.length }}</b> 条 · {{ unit }}
      </span>
    </div>

    <div class="card" style="padding: 0; overflow: hidden">
      <t-table
        v-if="source !== 'platform'"
        :data="list" :columns="wbCols" row-key="name" size="small"
        :loading="loading" hover
      >
        <template #name="{ row }"><b class="p-name">{{ row.name }}</b></template>
        <template #price_min="{ row }"><span class="num">{{ fmt(row.price_min, 2) }}</span></template>
        <template #price_max="{ row }"><span class="num">{{ fmt(row.price_max, 2) }}</span></template>
        <template #avg="{ row }"><span class="num avg">{{ fmt(row.price_avg, 2) }}</span></template>
      </t-table>

      <t-table
        v-else
        :data="list" :columns="pfCols" row-key="code" size="small"
        :loading="loading" hover
      >
        <template #name="{ row }"><b class="p-name">{{ row.name }}</b></template>
        <template #price="{ row }"><span class="num avg">{{ fmt(row.price, 2) }}</span></template>
        <template #gram_per_unit="{ row }"><span class="num">{{ fmt(row.gram_per_unit, 0) }}</span></template>
        <template #per_gram="{ row }"><span class="num">{{ fmt(row.per_gram, 4) }}</span></template>
        <template #per_500g="{ row }"><span class="num">{{ fmt(row.per_500g, 2) }}</span></template>
        <template #status="{ row }">
          <span v-if="row.status === 'ok'" class="pill ok">正常</span>
          <span v-else-if="row.status === 'warn'" class="pill low">异常</span>
          <span v-else class="muted">—</span>
        </template>
      </t-table>
    </div>

    <div v-if="!loading && !list.length" class="card empty-card">
      <div class="empty-icon"><Icon name="calendar" :size="24" color="#9db0ab" /></div>
      <div class="empty-title">该报价日暂无数据</div>
      <div class="empty-desc">换一个日期或数据源试试</div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import http from '@/api/http'
import Icon from '@/components/Icon.vue'
import { fmt } from '@/utils/nutri'

const sources = [
  { label: '万邦价格', value: 'wb' },
  { label: '郑州价格', value: 'zz' },
  { label: '平台价格', value: 'platform' }
]
const source = ref('wb')
const date = ref('')
const cat = ref('')
const q = ref('')
const loading = ref(false)
const list = ref([])
const dateOpts = ref([])
const catOpts = ref([])
const unit = ref('元/公斤')

const wbCols = [
  { colKey: 'name', title: '名称', width: 190, fixed: 'left' },
  { colKey: 'category', title: '分类', width: 120 },
  { colKey: 'origin', title: '产地', width: 110 },
  { colKey: 'spec', title: '规格', width: 140 },
  { colKey: 'price_min', title: '最低', width: 90 },
  { colKey: 'price_max', title: '最高', width: 90 },
  { colKey: 'avg', title: '均价', width: 95 }
]
const pfCols = [
  { colKey: 'code', title: '编码', width: 110 },
  { colKey: 'name', title: '名称', width: 190, fixed: 'left' },
  { colKey: 'category', title: '分类', width: 130 },
  { colKey: 'spec', title: '规格', width: 140 },
  { colKey: 'price', title: '单价', width: 95 },
  { colKey: 'gram_per_unit', title: '每单位克', width: 100 },
  { colKey: 'per_gram', title: '元/克', width: 95 },
  { colKey: 'per_500g', title: '元/500g', width: 100 },
  { colKey: 'status', title: '状态', width: 85 }
]

let timer = null
function debouncedLoad() { clearTimeout(timer); timer = setTimeout(load, 300) }

async function loadMeta() {
  if (source.value === 'platform') {
    const { data } = await http.get('/prices/platform/meta')
    dateOpts.value = (data.dates || []).map((d) => ({ label: `${d.date}（${d.count} 条）`, value: d.date }))
    date.value = (data.latest && data.latest.date) || (data.dates[0] && data.dates[0].date) || ''
    unit.value = '元/单位'
  } else {
    const { data } = await http.get('/prices/meta')
    const m = data[source.value] || {}
    dateOpts.value = (m.dates || []).map((d) => ({ label: d, value: d }))
    date.value = (m.dates && m.dates[0]) || ''
    unit.value = '元/公斤'
  }
}

async function load() {
  if (!date.value) return
  loading.value = true
  try {
    if (source.value === 'platform') {
      const { data } = await http.get('/prices/platform/list', {
        params: { date: date.value, q: q.value, category: cat.value }
      })
      list.value = data.list || []
      catOpts.value = (data.categories || []).map((c) => ({ label: c.value, value: c.value }))
    } else {
      const { data } = await http.get('/prices/list', {
        params: { source: source.value, date: date.value, q: q.value, category: cat.value }
      })
      list.value = data.list || []
      catOpts.value = (data.categories || []).map((c) => ({ label: c.value, value: c.value }))
    }
  } catch (e) {}
  finally { loading.value = false }
}

watch(source, async () => {
  cat.value = ''
  q.value = ''
  await loadMeta()
  await load()
})

onMounted(async () => { await loadMeta(); await load() })
</script>

<style scoped>
.seg-wrap {
  display: inline-flex; gap: 2px; padding: 3px;
  background: #eef4f2; border-radius: 10px; margin-bottom: 16px;
}
.seg-btn {
  border: none; background: none; cursor: pointer;
  font-family: inherit; font-size: 13px; font-weight: 500;
  color: var(--text-2); padding: 7px 20px; border-radius: 8px;
  transition: all 0.16s var(--ease);
}
.seg-btn:hover { color: var(--brand-700); }
.seg-btn.active {
  background: var(--surface); color: var(--brand-700);
  font-weight: 600; box-shadow: var(--sh-1);
}

.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.tool-search {
  display: flex; align-items: center; gap: 8px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 9px; padding: 0 12px; height: 36px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.tool-search:focus-within {
  border-color: var(--brand-400);
  box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.1);
}
.tool-search input {
  border: none; outline: none; background: none;
  font-family: inherit; font-size: 13px; color: var(--text); width: 180px;
}
.tool-search input::placeholder { color: var(--muted-2); }
.spacer { flex: 1; }
.count-chip {
  font-size: 12.5px; color: var(--muted);
  background: var(--surface); border: 1px solid var(--border);
  padding: 5px 13px; border-radius: var(--r-pill);
}
.count-chip b { color: var(--brand-700); font-family: var(--font-num); }

.p-name { color: var(--text); font-weight: 500; }
.num { font-family: var(--font-num); font-variant-numeric: tabular-nums; color: var(--text-2); }
.num.avg { color: var(--brand-700); font-weight: 700; font-size: 13.5px; }

.empty-card { text-align: center; padding: 50px 20px; }
.empty-icon {
  width: 56px; height: 56px; border-radius: 16px;
  background: #f4f8f7; display: grid; place-items: center;
  margin: 0 auto 14px;
}
.empty-title { font-size: 15px; font-weight: 600; color: var(--text-2); }
.empty-desc { font-size: 13px; color: var(--muted); margin-top: 5px; }
</style>
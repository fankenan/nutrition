<template>
  <div>
    <div class="toolbar">
      <div class="tool-search">
        <Icon name="search" :size="15" color="#9db0ab" />
        <input v-model="q" placeholder="搜索菜品名称" @input="debouncedLoad" />
      </div>
      <t-select v-model="cat" :options="catOpts" placeholder="全部分类" style="width: 160px" clearable @change="reload" />
      <span class="spacer" />
      <span class="count-chip">共 <b>{{ total }}</b> 道菜品</span>
    </div>

    <div class="card" style="padding: 0; overflow: hidden">
      <t-table
        :data="rows" :columns="cols" row-key="id" size="small"
        :loading="loading" hover expand-on-row-click
      >
        <template #name="{ row }"><b class="d-name">{{ row.name }}</b></template>
        <template #category="{ row }">
          <span v-if="row.category" class="cat-tag">{{ row.category }}</span>
          <span v-else class="muted">未分类</span>
        </template>
        <template #use_count="{ row }"><span class="num">{{ row.use_count || 0 }}</span></template>
        <template #total_g="{ row }"><span class="num">{{ fmt(row.total_g, 0) }}</span></template>
        <template #itemCount="{ row }"><span class="num">{{ (row.items || []).length }}</span></template>

        <template #expandedRow="{ row }">
          <div class="dish-items">
            <div class="di-title">
              <Icon name="foods" :size="14" color="#0d9488" />
              食材明细 · 生重（g）
            </div>
            <t-table
              v-if="row.items && row.items.length"
              :data="row.items" :columns="itemCols"
              row-key="raw_name" size="small" bordered
            >
              <template #raw_name="{ row: it }"><span class="it-name">{{ it.raw_name }}</span></template>
              <template #amount_g="{ row: it }"><b class="num">{{ it.amount_g || '—' }}</b></template>
            </t-table>
            <span v-else class="muted">暂无食材明细</span>
          </div>
        </template>
      </t-table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import http from '@/api/http'
import Icon from '@/components/Icon.vue'
import { fmt } from '@/utils/nutri'

const q = ref('')
const cat = ref('')
const loading = ref(false)
const rows = ref([])
const total = ref(0)
const catOpts = ref([])

const cols = [
  { colKey: 'name', title: '菜品名称', width: 220, fixed: 'left' },
  { colKey: 'category', title: '分类', width: 140 },
  { colKey: 'use_count', title: '使用次数', width: 100 },
  { colKey: 'total_g', title: '总带量 g', width: 110 },
  { colKey: 'itemCount', title: '食材数', width: 90 }
]
const itemCols = [
  { colKey: 'raw_name', title: '食材', width: 220 },
  { colKey: 'amount_g', title: '克数 g', width: 110 }
]

let timer = null
function debouncedLoad() { clearTimeout(timer); timer = setTimeout(reload, 300) }

async function loadCats() {
  try {
    const { data } = await http.get('/dishes/categories')
    catOpts.value = (data.categories || []).map((c) => ({ label: c.value, value: c.value }))
  } catch (e) {}
}

async function load() {
  loading.value = true
  try {
    const params = {}
    if (q.value) params.q = q.value
    if (cat.value) params.category = cat.value
    const { data } = await http.get('/dishes', { params })
    rows.value = data.list || []
    total.value = data.total || rows.value.length
  } catch (e) {}
  finally { loading.value = false }
}

function reload() { load() }

onMounted(() => { loadCats(); load() })
</script>

<style scoped>
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
  font-family: inherit; font-size: 13px; color: var(--text); width: 200px;
}
.tool-search input::placeholder { color: var(--muted-2); }
.spacer { flex: 1; }
.count-chip {
  font-size: 12.5px; color: var(--muted);
  background: var(--surface); border: 1px solid var(--border);
  padding: 5px 13px; border-radius: var(--r-pill);
}
.count-chip b { color: var(--brand-700); font-family: var(--font-num); }

.d-name { color: var(--text); font-weight: 500; }
.num { font-family: var(--font-num); font-variant-numeric: tabular-nums; color: var(--text-2); }
.cat-tag {
  display: inline-block; font-size: 11.5px; color: var(--text-2);
  background: #f2f7f5; padding: 2px 9px; border-radius: 5px;
}

.dish-items { padding: 14px 8px 10px; }
.di-title {
  display: flex; align-items: center; gap: 6px;
  font-size: 12.5px; font-weight: 600; color: var(--brand-700);
  margin-bottom: 12px;
}
.it-name { color: var(--text-2); }
</style>
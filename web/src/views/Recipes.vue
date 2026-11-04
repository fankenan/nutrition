<template>
  <div>
    <div class="toolbar">
      <div class="tool-search">
        <Icon name="search" :size="15" color="#9db0ab" />
        <input v-model="kw" placeholder="搜索食谱名或学校" @input="apply" />
      </div>
      <div class="seg">
        <button
          v-for="s in stageOpts" :key="s.value"
          class="seg-btn" :class="{ active: stage === s.value }"
          @click="stage = s.value; apply()"
        >{{ s.label }}</button>
      </div>
      <span class="spacer" />
      <span class="count-chip">共 <b>{{ rows.length }}</b> 份</span>
    </div>

    <div class="card" style="padding: 0; overflow: hidden">
      <t-table :data="rows" :columns="cols" row-key="id" :loading="loading" hover>
        <template #name="{ row }">
          <div class="name-cell">
            <span class="name-main">{{ row.name }}</span>
            <span v-if="row.owner_name" class="name-sub">{{ row.owner_name }}</span>
          </div>
        </template>
        <template #stage="{ row }">
          <span class="stage-tag">{{ row.stage || '—' }}</span>
        </template>
        <template #type="{ row }">
          <span class="pill" :class="row.is_library ? 'info' : 'na'">
            {{ row.is_library ? '食谱库' : '我的' }}
          </span>
        </template>
        <template #empty>
          <div class="empty-inline">没有符合条件的食谱</div>
        </template>
      </t-table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import http from '@/api/http'
import Icon from '@/components/Icon.vue'

const kw = ref('')
const stage = ref('')
const loading = ref(false)
const rows = ref([])
const stageOpts = [
  { label: '全部', value: '' },
  { label: '小学', value: '小学' },
  { label: '初中', value: '初中' },
  { label: '高中', value: '高中' }
]

const cols = [
  { colKey: 'name', title: '食谱名称', width: 280 },
  { colKey: 'school', title: '学校', width: 200 },
  { colKey: 'stage', title: '学段', width: 90 },
  { colKey: 'week_start', title: '起始日期', width: 130 },
  { colKey: 'type', title: '类型', width: 110 }
]

async function load() {
  loading.value = true
  try {
    const { data } = await http.get('/recipes')
    let list = data.recipes || []
    if (stage.value) list = list.filter((r) => r.stage === stage.value)
    if (kw.value) {
      const q = kw.value.toLowerCase()
      list = list.filter(
        (r) => (r.name || '').toLowerCase().includes(q) || (r.school || '').toLowerCase().includes(q)
      )
    }
    rows.value = list
  } catch (e) {}
  finally { loading.value = false }
}
function apply() { load() }
onMounted(load)
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
  font-family: inherit; font-size: 13px; color: var(--text); width: 210px;
}
.tool-search input::placeholder { color: var(--muted-2); }

.seg { display: flex; gap: 2px; padding: 3px; background: #eef4f2; border-radius: 9px; }
.seg-btn {
  border: none; background: none; cursor: pointer;
  font-family: inherit; font-size: 12.5px; font-weight: 500;
  color: var(--text-2); padding: 5px 14px; border-radius: 7px;
  transition: all 0.16s var(--ease);
}
.seg-btn:hover { color: var(--brand-700); }
.seg-btn.active {
  background: var(--surface); color: var(--brand-700);
  font-weight: 600; box-shadow: var(--sh-1);
}

.spacer { flex: 1; }
.count-chip {
  font-size: 12.5px; color: var(--muted);
  background: var(--surface); border: 1px solid var(--border);
  padding: 5px 13px; border-radius: var(--r-pill);
}
.count-chip b { color: var(--brand-700); font-family: var(--font-num); }

.name-cell { display: flex; flex-direction: column; gap: 1px; }
.name-main { font-weight: 500; color: var(--text); }
.name-sub { font-size: 11.5px; color: var(--muted-2); }

.stage-tag {
  display: inline-block; font-size: 12px; color: var(--text-2);
  background: #f2f7f5; padding: 2px 9px; border-radius: 6px;
}
.empty-inline { padding: 40px; text-align: center; color: var(--muted); font-size: 13px; }
</style>
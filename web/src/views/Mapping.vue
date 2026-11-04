<template>
  <div>
    <div class="seg-wrap">
      <button class="seg-btn" :class="{ active: tab === 'pending' }" @click="tab = 'pending'">
        待确认
        <span v-if="pending.length" class="seg-badge">{{ pending.length }}</span>
      </button>
      <button class="seg-btn" :class="{ active: tab === 'mapped' }" @click="tab = 'mapped'; loadMapped()">
        已映射库
      </button>
    </div>

    <!-- 待确认 -->
    <template v-if="tab === 'pending'">
      <div v-if="!pending.length" class="card empty-card">
        <div class="empty-icon ok"><Icon name="check" :size="26" color="#0f9d58" /></div>
        <div class="empty-title">全部食材已完成映射</div>
        <div class="empty-desc">营养核算的食材匹配率处于良好状态</div>
      </div>

      <div v-for="p in pending" :key="p.id" class="card map-card">
        <div class="map-head">
          <div class="map-raw">
            <span class="raw-name">{{ p.raw_name }}</span>
            <span class="pill low">命中 {{ p.hit_count }} 次</span>
          </div>
          <span class="muted">请选择对应的食物成分</span>
        </div>
        <div class="map-body">
          <t-select
            v-model="p._fid"
            :options="foodOpts"
            filterable
            placeholder="输入名称或拼音首字母搜索"
            :filter="pinyinFilter"
            style="flex: 1; min-width: 280px"
          />
          <t-button theme="primary" :disabled="!p._fid" @click="confirm(p)">确认映射</t-button>
          <t-button variant="outline" @click="ignore(p)">忽略</t-button>
        </div>
      </div>
    </template>

    <!-- 已映射 -->
    <template v-else>
      <div class="toolbar">
        <div class="tool-search">
          <Icon name="search" :size="15" color="#9db0ab" />
          <input v-model="mq" placeholder="搜索食材名或食物名" @input="loadMapped" />
        </div>
        <span class="spacer" />
        <span class="count-chip">共 <b>{{ maps.length }}</b> 条映射</span>
      </div>

      <div class="card" style="padding: 0; overflow: hidden">
        <t-table :data="maps" :columns="mapCols" row-key="id" size="small" :loading="loadingM" hover>
          <template #raw_name="{ row }"><b class="map-name">{{ row.raw_name }}</b></template>
          <template #food_name="{ row }"><span class="food-name">{{ row.food_name }}</span></template>
          <template #cat="{ row }"><span class="muted">{{ row.category_l1 || '—' }}</span></template>
          <template #use_count="{ row }"><span class="num">{{ row.use_count || 0 }}</span></template>
          <template #op="{ row }">
            <t-link theme="danger" @click="delMap(row)">删除</t-link>
          </template>
        </t-table>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import http from '@/api/http'
import Icon from '@/components/Icon.vue'
import { getFoodOptions } from '@/utils/foodOptions'
import { pinyinFilter } from '@/utils/pinyin'

const tab = ref('pending')
const pending = ref([])
const maps = ref([])
const foodOpts = ref([])
const mq = ref('')
const loadingM = ref(false)

const mapCols = [
  { colKey: 'raw_name', title: '食材名（原始）', width: 220 },
  { colKey: 'food_name', title: '对应食物成分', width: 220 },
  { colKey: 'cat', title: '分类', width: 150 },
  { colKey: 'use_count', title: '使用次数', width: 100 },
  { colKey: 'op', title: '操作', width: 80 }
]

async function loadFoodOpts() { foodOpts.value = await getFoodOptions() }

async function loadPending() {
  try {
    const { data } = await http.get('/mapping/pending')
    pending.value = (data.pending || []).map((p) => ({ ...p, _fid: '' }))
  } catch (e) {}
}

async function loadMapped() {
  loadingM.value = true
  try {
    const { data } = await http.get('/mapping/list', { params: mq.value ? { q: mq.value } : {} })
    maps.value = data.maps || []
  } catch (e) {}
  finally { loadingM.value = false }
}

async function confirm(p) {
  if (!p._fid) return
  try {
    await http.post('/mapping/confirm', { raw: p.raw_name, food_id: p._fid })
    MessagePlugin.success(`「${p.raw_name}」已映射`)
    pending.value = pending.value.filter((x) => x.id !== p.id)
  } catch (e) {
    MessagePlugin.error(e.response?.data?.error || '确认失败')
  }
}

async function ignore(p) {
  try {
    await http.delete(`/mapping/pending/${p.id}`)
    pending.value = pending.value.filter((x) => x.id !== p.id)
  } catch (e) {}
}

async function delMap(row) {
  try {
    await http.delete(`/mapping/${row.id}`)
    MessagePlugin.success('已删除映射')
    loadMapped()
  } catch (e) {
    MessagePlugin.error(e.response?.data?.error || '删除失败')
  }
}

onMounted(() => { loadFoodOpts(); loadPending(); loadMapped() })
</script>

<style scoped>
.seg-wrap {
  display: inline-flex; gap: 2px; padding: 3px;
  background: #eef4f2; border-radius: 10px; margin-bottom: 16px;
}
.seg-btn {
  border: none; background: none; cursor: pointer;
  font-family: inherit; font-size: 13px; font-weight: 500;
  color: var(--text-2); padding: 7px 18px; border-radius: 8px;
  display: inline-flex; align-items: center; gap: 7px;
  transition: all 0.16s var(--ease);
}
.seg-btn:hover { color: var(--brand-700); }
.seg-btn.active {
  background: var(--surface); color: var(--brand-700);
  font-weight: 600; box-shadow: var(--sh-1);
}
.seg-badge {
  background: var(--warn-bg); color: var(--warn);
  font-size: 11px; font-weight: 700; padding: 0 6px;
  border-radius: 99px; min-width: 18px; text-align: center;
  font-family: var(--font-num);
  line-height: 17px;
}

.map-card { padding: 18px 20px; }
.map-head {
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 14px; flex-wrap: wrap;
}
.map-raw { display: flex; align-items: center; gap: 9px; }
.raw-name { font-size: 15px; font-weight: 600; color: var(--text); }
.map-body { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }

.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
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
.spacer { flex: 1; }
.count-chip {
  font-size: 12.5px; color: var(--muted);
  background: var(--surface); border: 1px solid var(--border);
  padding: 5px 13px; border-radius: var(--r-pill);
}
.count-chip b { color: var(--brand-700); font-family: var(--font-num); }

.map-name { color: var(--text); font-weight: 500; }
.food-name { color: var(--brand-700); }
.num { font-family: var(--font-num); color: var(--text-2); }

.empty-card { text-align: center; padding: 54px 20px; }
.empty-icon {
  width: 58px; height: 58px; border-radius: 17px;
  background: #f4f8f7; display: grid; place-items: center;
  margin: 0 auto 14px;
}
.empty-icon.ok { background: var(--ok-bg); }
.empty-title { font-size: 15px; font-weight: 600; color: var(--text-2); }
.empty-desc { font-size: 13px; color: var(--muted); margin-top: 5px; }
</style>
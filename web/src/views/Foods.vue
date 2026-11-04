<template>
  <div>
    <!-- 顶部分段 + 主操作 -->
    <div class="lib-head">
      <div class="seg-wrap">
        <button class="seg-btn" :class="{ active: source === '' }" @click="switchSource('')">全部食材</button>
        <button class="seg-btn" :class="{ active: source === 'std' }" @click="switchSource('std')">标准成分表</button>
        <button class="seg-btn" :class="{ active: source === 'manual' }" @click="switchSource('manual')">
          手工录入
          <span v-if="counts.manual" class="seg-badge">{{ counts.manual }}</span>
        </button>
      </div>
      <span class="spacer" />
      <button class="btn-primary" @click="openCreate()">
        <Icon name="plus" :size="15" color="#fff" />
        新增食材
      </button>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="tool-search">
        <Icon name="search" :size="15" color="#9db0ab" />
        <input v-model="q" placeholder="搜索食材名称（支持中文）" @input="debouncedLoad" />
      </div>
      <t-select
        v-model="cat" :options="catOpts" placeholder="全部分类"
        style="width: 190px" clearable filterable @change="reload"
      />
      <span class="spacer" />
      <span class="count-chip">共 <b>{{ total }}</b> 种食材</span>
    </div>

    <!-- 表格 -->
    <div class="card table-card">
      <t-table
        :data="rows" :columns="cols" row-key="id" size="small"
        :loading="loading" hover :pagination="pageOpt" @page-change="onPage"
      >
        <template #name="{ row }">
          <span class="f-name">{{ row.name }}</span>
          <span v-if="row.source === 'manual'" class="mini-tag">手工</span>
        </template>
        <template #edible="{ row }"><span class="muted">{{ row.edible != null ? Number(row.edible) + '%' : '—' }}</span></template>
        <template #energy="{ row }">
          <b class="num energy">{{ kcal(row.energy_kj) }}</b>
        </template>
        <template #protein="{ row }"><span class="num">{{ fmt(row.protein, 1) }}</span></template>
        <template #fat="{ row }"><span class="num">{{ fmt(row.fat, 1) }}</span></template>
        <template #carb="{ row }"><span class="num">{{ fmt(row.carb, 1) }}</span></template>
        <template #ca="{ row }"><span class="num">{{ fmt(row.ca, 0) }}</span></template>
        <template #fe="{ row }"><span class="num">{{ fmt(row.fe, 1) }}</span></template>
        <template #vit_c="{ row }"><span class="num">{{ fmt(row.vit_c, 1) }}</span></template>
        <template #grp="{ row }">
          <span v-if="row.group_key" class="grp-tag">{{ grpLabel(row.group_key) }}</span>
          <span v-else class="muted">—</span>
        </template>
        <template #source="{ row }">
          <span class="src-tag" :class="row.source === 'manual' ? 'manual' : 'std'">
            {{ row.source === 'manual' ? '手工' : '标准' }}
          </span>
        </template>
        <template #op="{ row }">
          <div class="row-ops">
            <button class="op-btn" title="查看营养详情" @click="openDetail(row)">
              <Icon name="eye" :size="15" color="#7a918b" />
            </button>
            <button v-if="row.source === 'manual'" class="op-btn" title="编辑" @click="openEdit(row)">
              <Icon name="edit" :size="15" color="#0f766e" />
            </button>
            <button v-if="row.source === 'manual'" class="op-btn danger" title="删除" @click="askDelete(row)">
              <Icon name="trash" :size="15" color="#c0392b" />
            </button>
          </div>
        </template>

        <template #empty>
          <div class="empty-inner">
            <div class="empty-icon"><Icon name="flask" :size="26" color="#0d9488" /></div>
            <div class="empty-title">
              {{ q ? `库里没有「${q}」` : '这个分类下还没有食材' }}
            </div>
            <div class="empty-desc">
              可以手工录入它的营养成分（每 100g 可食部），保存后即可参与食谱营养核算
            </div>
            <div class="empty-actions">
              <button class="btn-primary" @click="openCreate(q)">
                <Icon name="plus" :size="15" color="#fff" />
                新增这个食材
              </button>
            </div>
          </div>
        </template>
      </t-table>
    </div>

    <!-- 新增 / 编辑抽屉 -->
    <t-drawer
      v-model:visible="drawer" size="800px" :footer="false"
      :header="editingId ? '编辑食材' : '新增食材'"
      @close="resetForm"
    >
      <div class="drawer-body">
        <div class="drawer-tip">
          <Icon name="info" :size="15" color="#0d9488" />
          <span>营养数据按 <b>每 100g 可食部</b> 填写；留空的项按“未检出 / 无数据”处理，不参与达标判定。</span>
        </div>

        <!-- 基本信息 -->
        <section class="form-sec">
          <div class="sec-head">
            <h4>基本信息</h4>
            <span class="sec-hint">名称必填，分类可直接输入库里没有的新分类</span>
          </div>
          <div class="fgrid">
            <label class="field span2">
              <span class="lb">食材名称 <i>*</i></span>
              <t-input v-model="form.name" placeholder="如：紫薯粉、魔芋豆腐、本地酸菜" :maxlength="128" />
            </label>

            <label class="field">
              <span class="lb">食物分类（一级）</span>
              <t-input v-model="form.category_l1" placeholder="如：薯类、淀粉及制品" />
            </label>
            <label class="field">
              <span class="lb">二级分类</span>
              <t-input v-model="form.category_l2" placeholder="选填" />
            </label>

            <div class="field span2 cat-chips">
              <span class="chips-label">常用分类</span>
              <button
                v-for="c in topCats" :key="c.category_l1"
                class="chip" :class="{ on: form.category_l1 === c.category_l1 }"
                @click="form.category_l1 = c.category_l1"
              >{{ c.category_l1 }}</button>
            </div>

            <label class="field">
              <span class="lb">食部（可食部分比例）</span>
              <t-input v-model="form.edible" placeholder="默认 100">
                <template #suffix>%</template>
              </t-input>
            </label>
            <label class="field">
              <span class="lb">食物分组（WS/T 554 用）</span>
              <t-select v-model="form.group_key" :options="groupOpts" placeholder="自动判定" />
            </label>

            <label class="field span2 check-line">
              <t-checkbox v-model="form.alias" />
              <span>同时在名称映射中登记（食谱里出现的同名食材可直接匹配到这条）</span>
            </label>
          </div>
        </section>

        <!-- 能量与三大营养素 -->
        <section class="form-sec">
          <div class="sec-head">
            <h4>能量与三大营养素</h4>
            <button class="link-btn" @click="estimateEnergy">
              <Icon name="spark" :size="13" color="#0d9488" />
              按蛋白 / 脂肪 / 碳水自动估算能量
            </button>
          </div>
          <div class="energy-row">
            <label class="field">
              <span class="lb">能量</span>
              <t-input v-model="form.energy_kcal" placeholder="0" @change="onKcalChange">
                <template #suffix>kcal</template>
              </t-input>
            </label>
            <span class="eq">≈</span>
            <label class="field">
              <span class="lb">&nbsp;</span>
              <t-input v-model="form.energy_kj" placeholder="0" @change="onKjChange">
                <template #suffix>kJ</template>
              </t-input>
            </label>
            <p class="energy-hint">两项自动换算（1 kcal = 4.184 kJ）</p>
          </div>
          <div class="fgrid">
            <label class="field">
              <span class="lb">蛋白质</span>
              <t-input v-model="form.protein" placeholder="0"><template #suffix>g</template></t-input>
            </label>
            <label class="field">
              <span class="lb">脂肪</span>
              <t-input v-model="form.fat" placeholder="0"><template #suffix>g</template></t-input>
            </label>
            <label class="field">
              <span class="lb">碳水化合物</span>
              <t-input v-model="form.carb" placeholder="0"><template #suffix>g</template></t-input>
            </label>
            <label class="field">
              <span class="lb">膳食纤维</span>
              <t-input v-model="form.fiber" placeholder="0"><template #suffix>g</template></t-input>
            </label>
          </div>
        </section>

        <!-- 维生素 / 矿物质 / 脂肪酸 -->
        <section v-for="g in NUTRI_GROUPS" :key="g.title" class="form-sec">
          <div class="sec-head">
            <h4>{{ g.title }}</h4>
            <span class="sec-hint">{{ g.hint }}</span>
          </div>
          <div class="fgrid three">
            <label v-for="it in g.items" :key="it.k" class="field">
              <span class="lb">{{ it.label }}</span>
              <t-input v-model="form[it.k]" placeholder="—">
                <template #suffix>{{ it.unit }}</template>
              </t-input>
            </label>
          </div>
        </section>
      </div>

      <div class="drawer-foot">
        <div class="foot-left">
          <span v-if="editingId" class="muted">修改后立即参与后续营养核算</span>
        </div>
        <t-button variant="outline" @click="drawer = false">取消</t-button>
        <t-button theme="primary" :loading="saving" @click="save">
          {{ editingId ? '保存修改' : '保存并加入食材库' }}
        </t-button>
      </div>
    </t-drawer>

    <!-- 详情抽屉 -->
    <t-drawer v-model:visible="detailVisible" size="620px" :footer="false" header="食材营养详情">
      <div v-if="detail" class="detail">
        <div class="detail-head">
          <div>
            <div class="detail-name">{{ detail.name }}</div>
            <div class="detail-meta">
              <span class="src-tag" :class="detail.source === 'manual' ? 'manual' : 'std'">
                {{ detail.source === 'manual' ? '手工录入' : '标准成分表' }}
              </span>
              <span class="muted">{{ detail.category_l1 || '未分类' }}<template v-if="detail.category_l2"> · {{ detail.category_l2 }}</template></span>
              <span class="muted">食部 {{ detail.edible != null ? Number(detail.edible) + '%' : '—' }}</span>
            </div>
          </div>
          <span class="grp-tag">{{ grpLabel(detail.group_key) }}</span>
        </div>

        <div class="detail-energy">
          <div class="de-item">
            <span class="de-l">能量</span>
            <span class="de-v">{{ kcal(detail.energy_kj) }} <small>kcal</small></span>
            <span class="de-sub">{{ detail.energy_kj != null ? Math.round(Number(detail.energy_kj) * 100) / 100 : '—' }} kJ</span>
          </div>
          <div class="de-item">
            <span class="de-l">蛋白质</span>
            <span class="de-v">{{ fmt(detail.protein, 1) }} <small>g</small></span>
          </div>
          <div class="de-item">
            <span class="de-l">脂肪</span>
            <span class="de-v">{{ fmt(detail.fat, 1) }} <small>g</small></span>
          </div>
          <div class="de-item">
            <span class="de-l">碳水</span>
            <span class="de-v">{{ fmt(detail.carb, 1) }} <small>g</small></span>
          </div>
        </div>

        <div v-for="g in DETAIL_GROUPS" :key="g.title" class="detail-sec">
          <div class="section-title">{{ g.title }}</div>
          <div class="detail-grid">
            <div v-for="it in g.items" :key="it.k" class="dg-item">
              <span class="dg-l">{{ it.label }}</span>
              <span class="dg-v" :class="{ nil: detail[it.k] == null }">
                {{ detail[it.k] == null ? '—' : fmt(detail[it.k], dec(it.unit)) }}
                <small v-if="detail[it.k] != null">{{ it.unit }}</small>
              </span>
            </div>
          </div>
        </div>

        <div class="detail-foot">
          <span class="muted">
            {{ detail.source === 'manual'
              ? `由 ${detail.created_by_name || '—'} 于 ${fmtDate(detail.created_at)} 录入`
              : '来源：中国食物成分表（标准版）' }}
          </span>
          <span class="spacer" />
          <t-button v-if="detail.source === 'manual'" variant="outline" size="small" @click="openEdit(detail)">
            编辑这条
          </t-button>
        </div>
      </div>
    </t-drawer>

    <!-- 删除确认 -->
    <t-dialog
      v-model:visible="delVisible" header="删除食材" :footer="false" width="420px"
    >
      <p class="del-text">
        确认删除手工食材 <b>「{{ delRow?.name }}」</b>？<br />
        <span class="muted">若已被菜品或名称映射引用，系统会阻止删除。</span>
      </p>
      <div class="del-actions">
        <t-button variant="outline" @click="delVisible = false">取消</t-button>
        <t-button theme="danger" :loading="deleting" @click="doDelete">确认删除</t-button>
      </div>
    </t-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import http from '@/api/http'
import Icon from '@/components/Icon.vue'
import { grpLabel, fmt } from '@/utils/nutri'
import { invalidateFoodOptions } from '@/utils/foodOptions'

const KCAL = 4.184

const q = ref('')
const cat = ref('')
const source = ref('')
const loading = ref(false)
const rows = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const catOpts = ref([])
const groupOpts = ref([])
const topCats = ref([])
const counts = ref({ total: 0, manual: 0 })

const cols = [
  { colKey: 'name', title: '食材名称', width: 190, fixed: 'left' },
  { colKey: 'category_l1', title: '分类', width: 150 },
  { colKey: 'edible', title: '食部', width: 70 },
  { colKey: 'energy', title: '能量 kcal', width: 105 },
  { colKey: 'protein', title: '蛋白 g', width: 85 },
  { colKey: 'fat', title: '脂肪 g', width: 85 },
  { colKey: 'carb', title: '碳水 g', width: 85 },
  { colKey: 'ca', title: '钙 mg', width: 80 },
  { colKey: 'fe', title: '铁 mg', width: 80 },
  { colKey: 'vit_c', title: 'VC mg', width: 80 },
  { colKey: 'grp', title: '分组', width: 105 },
  { colKey: 'source', title: '来源', width: 80 },
  { colKey: 'op', title: '操作', width: 108, fixed: 'right' }
]

const pageOpt = ref({ current: 1, pageSize, total: 0, showJumper: true })

/* ---------- 常量 ---------- */
const NUTRI_GROUPS = [
  {
    title: '维生素',
    hint: '每 100g 可食部',
    items: [
      { k: 'vit_a', label: '维生素 A', unit: 'μgRAE' },
      { k: 'carotene', label: '胡萝卜素', unit: 'μg' },
      { k: 'alpha_te', label: '维生素 E', unit: 'mg α-TE' },
      { k: 'vit_b1', label: '硫胺素 B1', unit: 'mg' },
      { k: 'vit_b2', label: '核黄素 B2', unit: 'mg' },
      { k: 'vit_b3', label: '烟酸 B3', unit: 'mg' },
      { k: 'vit_c', label: '维生素 C', unit: 'mg' }
    ]
  },
  {
    title: '矿物质',
    hint: '每 100g 可食部',
    items: [
      { k: 'ca', label: '钙', unit: 'mg' },
      { k: 'p', label: '磷', unit: 'mg' },
      { k: 'k', label: '钾', unit: 'mg' },
      { k: 'na', label: '钠', unit: 'mg' },
      { k: 'mg', label: '镁', unit: 'mg' },
      { k: 'fe', label: '铁', unit: 'mg' },
      { k: 'zn', label: '锌', unit: 'mg' },
      { k: 'se', label: '硒', unit: 'μg' },
      { k: 'cu', label: '铜', unit: 'mg' },
      { k: 'mn', label: '锰', unit: 'mg' },
      { k: 'i', label: '碘', unit: 'μg' }
    ]
  },
  {
    title: '脂肪酸与其他',
    hint: '每 100g 可食部',
    items: [
      { k: 'cholesterol', label: '胆固醇', unit: 'mg' },
      { k: 'sfa', label: '饱和脂肪酸', unit: 'g' },
      { k: 'mufa', label: '单不饱和脂肪酸', unit: 'g' },
      { k: 'pufa', label: '多不饱和脂肪酸', unit: 'g' },
      { k: 'total_fa', label: '总脂肪酸', unit: 'g' },
      { k: 'water', label: '水分', unit: 'g' },
      { k: 'ash', label: '灰分', unit: 'g' }
    ]
  }
]

const DETAIL_GROUPS = [
  { title: '维生素', items: NUTRI_GROUPS[0].items },
  { title: '矿物质', items: NUTRI_GROUPS[1].items },
  {
    title: '脂肪酸与其他',
    items: [...NUTRI_GROUPS[2].items, { k: 'fiber', label: '膳食纤维', unit: 'g' }]
  }
]

const ALL_KEYS = NUTRI_GROUPS.flatMap((g) => g.items.map((i) => i.k))

/* ---------- 表单 ---------- */
const drawer = ref(false)
const detailVisible = ref(false)
const detail = ref(null)
const editingId = ref(null)
const saving = ref(false)

function blankForm() {
  const f = {
    name: '', category_l1: '', category_l2: '', edible: '100', group_key: '',
    energy_kcal: '', energy_kj: '',
    protein: '', fat: '', carb: '', fiber: '',
    alias: true
  }
  ALL_KEYS.forEach((k) => { if (f[k] === undefined) f[k] = '' })
  return f
}
const form = ref(blankForm())

function resetForm() {
  editingId.value = null
  form.value = blankForm()
}

function openCreate(name) {
  resetForm()
  if (name) form.value.name = String(name).trim()
  drawer.value = true
}

async function openEdit(row) {
  detailVisible.value = false
  resetForm()
  try {
    const { data } = await http.get(`/foods/${row.id}`)
    const fd = data.food || {}
    const f = blankForm()
    f.name = fd.name || ''
    f.category_l1 = fd.category_l1 || ''
    f.category_l2 = fd.category_l2 || ''
    f.edible = fd.edible != null ? String(Number(fd.edible)) : '100'
    f.group_key = fd.group_key || ''
    f.alias = false
    f.energy_kj = fd.energy_kj != null ? String(Number(fd.energy_kj)) : ''
    f.energy_kcal = fd.energy_kj != null ? String(Math.round((Number(fd.energy_kj) / KCAL) * 100) / 100) : ''
    ;['protein', 'fat', 'carb', 'fiber', ...ALL_KEYS].forEach((k) => {
      f[k] = fd[k] != null ? String(Number(fd[k])) : ''
    })
    form.value = f
    editingId.value = row.id
    drawer.value = true
  } catch (e) {
    MessagePlugin.error(e.response?.data?.error || '读取食材失败')
  }
}

async function openDetail(row) {
  try {
    const { data } = await http.get(`/foods/${row.id}`)
    detail.value = data.food
    detailVisible.value = true
  } catch (e) {
    MessagePlugin.error(e.response?.data?.error || '读取详情失败')
  }
}

function numOrNull(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function round2(n) { return Math.round(n * 100) / 100 }

function onKcalChange(v) {
  const n = Number(v)
  form.value.energy_kj = v === '' || !Number.isFinite(n) ? '' : String(round2(n * KCAL))
}
function onKjChange(v) {
  const n = Number(v)
  form.value.energy_kcal = v === '' || !Number.isFinite(n) ? '' : String(round2(n / KCAL))
}

function estimateEnergy() {
  const p = Number(form.value.protein) || 0
  const f = Number(form.value.fat) || 0
  const c = Number(form.value.carb) || 0
  const fi = Number(form.value.fiber) || 0
  const kj = p * 17 + f * 37 + c * 17 + fi * 8
  if (kj <= 0) {
    MessagePlugin.warning('请先填写蛋白质、脂肪或碳水化合物')
    return
  }
  form.value.energy_kj = String(round2(kj))
  form.value.energy_kcal = String(round2(kj / KCAL))
  MessagePlugin.success(`已按 Atwater 系数估算：${round2(kj)} kJ`)
}

async function save() {
  const name = String(form.value.name || '').trim()
  if (!name) {
    MessagePlugin.warning('请填写食材名称')
    return
  }
  const payload = {
    name,
    category_l1: form.value.category_l1 || '',
    category_l2: form.value.category_l2 || '',
    edible: numOrNull(form.value.edible),
    group_key: form.value.group_key || ''
  }
  ;['protein', 'fat', 'carb', 'fiber', ...ALL_KEYS].forEach((k) => {
    payload[k] = numOrNull(form.value[k])
  })
  // 两项都空 → 交给后端按营养素估算
  const kj = numOrNull(form.value.energy_kj)
  if (kj != null) payload.energy_kj = kj
  else if (numOrNull(form.value.energy_kcal) != null) payload.energy_kcal = numOrNull(form.value.energy_kcal)

  saving.value = true
  try {
    if (editingId.value) {
      await http.put(`/foods/${editingId.value}`, payload)
      MessagePlugin.success('已保存修改')
    } else {
      payload.alias = form.value.alias
      const { data } = await http.post('/foods', payload)
      const tip = data.estimated
        ? `已加入食材库，能量按营养素估算为 ${data.energy_kcal} kcal`
        : '已加入食材库'
      MessagePlugin.success(tip)
      source.value = 'manual'
    }
    drawer.value = false
    resetForm()
    invalidateFoodOptions()
    page.value = 1
    load()
    loadMeta()
  } catch (e) {
    const d = e.response?.data
    MessagePlugin.error(d?.error || '保存失败')
    if (e.response?.status === 409 && d?.exist?.id) {
      // 重名：直接切到编辑该条
      openEdit({ id: d.exist.id })
    }
  } finally {
    saving.value = false
  }
}

/* ---------- 删除 ---------- */
const delVisible = ref(false)
const delRow = ref(null)
const deleting = ref(false)

function askDelete(row) {
  delRow.value = row
  delVisible.value = true
}

async function doDelete() {
  if (!delRow.value) return
  deleting.value = true
  try {
    await http.delete(`/foods/${delRow.value.id}`)
    MessagePlugin.success(`已删除「${delRow.value.name}」`)
    delVisible.value = false
    invalidateFoodOptions()
    load()
    loadMeta()
  } catch (e) {
    MessagePlugin.error(e.response?.data?.error || '删除失败')
  } finally {
    deleting.value = false
  }
}

/* ---------- 数据加载 ---------- */
let timer = null
function debouncedLoad() {
  clearTimeout(timer)
  timer = setTimeout(reload, 300)
}

async function loadCats() {
  try {
    const { data } = await http.get('/foods/categories')
    catOpts.value = (data.categories || []).map((c) => ({ label: `${c.category_l1}（${c.c}）`, value: c.category_l1 }))
  } catch (e) {}
}

async function loadMeta() {
  try {
    const { data } = await http.get('/foods/meta')
    counts.value = { total: data.total || 0, manual: data.manual_count || 0 }
    topCats.value = (data.categories || []).slice(0, 12)
    groupOpts.value = [
      { label: '自动判定（按名称与分类）', value: '' },
      ...(data.groups || []).map((g) => ({ label: g.label, value: g.key }))
    ]
  } catch (e) {}
}

async function load() {
  loading.value = true
  try {
    const params = { page: page.value, size: pageSize }
    if (q.value) params.q = q.value
    if (cat.value) params.category = cat.value
    if (source.value) params.source = source.value
    if (source.value === 'manual') params.sort = 'recent'
    const { data } = await http.get('/foods', { params })
    rows.value = data.foods || []
    total.value = data.total || 0
    pageOpt.value = { ...pageOpt.value, total: total.value, current: page.value }
  } catch (e) {
    MessagePlugin.error(e.response?.data?.error || '加载食材失败')
  } finally {
    loading.value = false
  }
}

function reload() { page.value = 1; load() }
function switchSource(s) { source.value = s; reload() }
function onPage(p) { page.value = p.current; load() }

function kcal(kj) {
  if (kj == null) return '—'
  return Math.round((Number(kj) / KCAL) * 10) / 10
}
function dec(unit) {
  return unit && unit.startsWith('μg') ? 1 : 2
}
function fmtDate(s) {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d)) return '—'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

onMounted(() => { loadCats(); loadMeta(); load() })
</script>

<style scoped>
/* 顶部 */
.lib-head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.spacer { flex: 1; }
.seg-wrap {
  display: inline-flex; gap: 2px; padding: 3px;
  background: #eef4f2; border-radius: 10px;
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
  background: var(--brand-100); color: var(--brand-800);
  font-size: 11px; font-weight: 700; padding: 0 6px;
  border-radius: 99px; min-width: 18px; text-align: center;
  font-family: var(--font-num); line-height: 17px;
}
.btn-primary {
  display: inline-flex; align-items: center; gap: 7px;
  border: none; cursor: pointer; font-family: inherit;
  font-size: 13px; font-weight: 600; color: #fff;
  background: linear-gradient(135deg, var(--brand-600), var(--brand-700));
  padding: 9px 18px; border-radius: 9px;
  box-shadow: 0 1px 2px rgba(13, 148, 136, 0.24), 0 8px 18px -10px rgba(13, 148, 136, 0.55);
  transition: transform 0.15s var(--ease), box-shadow 0.15s var(--ease);
}
.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 5px rgba(13, 148, 136, 0.26), 0 12px 22px -10px rgba(13, 148, 136, 0.6);
}

/* 工具栏 */
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
  font-family: inherit; font-size: 13px; color: var(--text); width: 250px;
}
.tool-search input::placeholder { color: var(--muted-2); }
.count-chip {
  font-size: 12.5px; color: var(--muted);
  background: var(--surface); border: 1px solid var(--border);
  padding: 5px 13px; border-radius: var(--r-pill);
}
.count-chip b { color: var(--brand-700); font-family: var(--font-num); }

/* 表格 */
.table-card { padding: 0; overflow-x: auto; }
.f-name { font-weight: 500; color: var(--text); }
.mini-tag {
  display: inline-block; margin-left: 7px; font-size: 10.5px; font-weight: 600;
  color: var(--brand-700); background: var(--brand-50);
  border: 1px solid var(--brand-100); padding: 0 6px; border-radius: 5px;
  vertical-align: 1px;
}
.num { font-family: var(--font-num); font-variant-numeric: tabular-nums; color: var(--text-2); }
.num.energy { color: var(--text); font-weight: 600; }
.grp-tag {
  display: inline-block; font-size: 11.5px; color: var(--brand-700);
  background: var(--brand-50); padding: 2px 8px; border-radius: 5px; font-weight: 500;
}
.src-tag {
  display: inline-block; font-size: 11px; padding: 2px 7px; border-radius: 4px;
  font-weight: 500;
}
.src-tag.manual { color: #8a5a12; background: #fdf5e3; }
.src-tag.std { color: var(--muted); background: #f1f5f4; }
.row-ops { display: flex; gap: 2px; }
.op-btn {
  border: none; background: none; cursor: pointer; padding: 5px;
  border-radius: 6px; display: grid; place-items: center;
  transition: background 0.14s;
}
.op-btn:hover { background: #eef4f2; }
.op-btn.danger:hover { background: var(--danger-bg); }

/* 空态 */
.empty-inner { padding: 46px 20px 52px; text-align: center; }
.empty-icon {
  width: 58px; height: 58px; border-radius: 17px;
  background: var(--brand-50); display: grid; place-items: center;
  margin: 0 auto 14px;
}
.empty-title { font-size: 15px; font-weight: 600; color: var(--text-2); }
.empty-desc { font-size: 13px; color: var(--muted); margin-top: 6px; }
.empty-actions { margin-top: 16px; display: flex; justify-content: center; }

/* 抽屉 */
.drawer-body { padding-bottom: 8px; }
.drawer-tip {
  display: flex; align-items: flex-start; gap: 8px;
  background: var(--brand-50); border: 1px solid var(--brand-100);
  border-radius: 9px; padding: 10px 13px; margin-bottom: 18px;
  font-size: 12.5px; color: var(--brand-800); line-height: 1.6;
}
.form-sec {
  padding: 18px 0 4px;
  border-top: 1px solid var(--border);
}
.form-sec:first-of-type { border-top: none; padding-top: 0; }
.sec-head {
  display: flex; align-items: center; gap: 10px; margin-bottom: 12px;
}
.sec-head h4 {
  font-size: 13.5px; font-weight: 600; color: var(--text);
  padding-left: 9px; position: relative;
}
.sec-head h4::before {
  content: ''; position: absolute; left: 0; top: 3px; bottom: 3px;
  width: 3px; border-radius: 2px; background: var(--brand-400);
}
.sec-hint { font-size: 11.5px; color: var(--muted-2); }
.sec-head .link-btn { margin-left: auto; }

.fgrid {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
}
.fgrid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.field.span2 { grid-column: span 2; }
.lb { font-size: 12px; color: var(--text-2); font-weight: 500; }
.lb i { color: var(--danger); font-style: normal; }
.check-line {
  flex-direction: row; align-items: center; gap: 9px;
  font-size: 12.5px; color: var(--text-2);
}
.cat-chips {
  flex-direction: row; align-items: center; gap: 7px; flex-wrap: wrap;
}
.chips-label { font-size: 11.5px; color: var(--muted-2); }
.chip {
  border: 1px solid var(--border); background: var(--surface);
  color: var(--text-2); font-family: inherit; font-size: 12px;
  padding: 4px 11px; border-radius: var(--r-pill); cursor: pointer;
  transition: all 0.14s;
}
.chip:hover { border-color: var(--brand-300); color: var(--brand-700); }
.chip.on { background: var(--brand-50); border-color: var(--brand-300); color: var(--brand-700); font-weight: 500; }

.energy-row { display: flex; align-items: flex-end; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
.energy-row .field { width: 190px; }
.eq { font-size: 14px; color: var(--muted-2); padding-bottom: 9px; }
.energy-hint { font-size: 11.5px; color: var(--muted-2); padding-bottom: 10px; margin: 0; }
.link-btn {
  display: inline-flex; align-items: center; gap: 5px;
  border: none; background: none; cursor: pointer; font-family: inherit;
  font-size: 12px; color: var(--brand-700); font-weight: 500;
  padding: 3px 0;
}
.link-btn:hover { color: var(--brand-600); text-decoration: underline; }

.drawer-foot {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 0 4px; margin-top: 8px;
  border-top: 1px solid var(--border);
}
.foot-left { flex: 1; }

/* 详情 */
.detail-head { display: flex; align-items: flex-start; gap: 12px; justify-content: space-between; }
.detail-name { font-size: 19px; font-weight: 600; letter-spacing: -0.02em; color: var(--text); }
.detail-meta { display: flex; align-items: center; gap: 10px; margin-top: 8px; flex-wrap: wrap; }
.detail-energy {
  display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr; gap: 1px;
  background: var(--border); border: 1px solid var(--border);
  border-radius: var(--r-md); overflow: hidden; margin: 18px 0 22px;
}
.de-item { background: var(--surface); padding: 13px 14px; display: flex; flex-direction: column; gap: 3px; }
.de-l { font-size: 11.5px; color: var(--muted); }
.de-v { font-family: var(--font-num); font-size: 19px; font-weight: 600; color: var(--text); }
.de-v small { font-size: 11px; font-weight: 500; color: var(--muted); margin-left: 2px; }
.de-sub { font-size: 11px; color: var(--muted-2); }
.detail-sec { margin-bottom: 20px; }
.detail-grid {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px; background: var(--border);
  border: 1px solid var(--border); border-radius: var(--r-sm); overflow: hidden;
}
.dg-item { background: var(--surface); padding: 9px 11px; display: flex; flex-direction: column; gap: 2px; }
.dg-l { font-size: 11px; color: var(--muted); }
.dg-v { font-family: var(--font-num); font-size: 13.5px; color: var(--text-2); font-weight: 500; }
.dg-v small { font-size: 10px; color: var(--muted-2); margin-left: 2px; font-weight: 400; }
.dg-v.nil { color: #c3d2ce; }
.detail-foot {
  display: flex; align-items: center;
  border-top: 1px solid var(--border); padding-top: 12px;
}

/* 删除 */
.del-text { font-size: 13.5px; color: var(--text-2); line-height: 1.8; margin: 4px 0 18px; }
.del-actions { display: flex; justify-content: flex-end; gap: 10px; }
</style>

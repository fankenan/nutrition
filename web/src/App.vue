<template>
  <div class="app-layout">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">
          <Icon name="leaf" :size="20" color="#ffffff" :stroke-width="1.9" />
        </div>
        <div class="brand-text">
          <b>食材价格与营养分析</b>
          <span>Nutrition Suite</span>
        </div>
      </div>

      <div class="nav-label">工作区</div>
      <nav class="nav">
        <router-link v-for="m in navs" :key="m.path" :to="m.path">
          <Icon :name="m.icon" :size="17" />
          <span>{{ m.label }}</span>
        </router-link>
      </nav>

      <div class="foot">
        <div class="avatar">{{ initial }}</div>
        <div class="foot-info">
          <b>{{ user || '未登录' }}</b>
          <span>登封市教育局 · 体卫艺科</span>
        </div>
        <button title="退出登录" @click="logout">
          <Icon name="logout" :size="15" />
        </button>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <h1>{{ title }}</h1>
        <span class="crumb">/ {{ title }}</span>
        <span class="spacer" />
        <span class="date-chip">{{ today }}</span>
      </header>
      <main class="content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '@/components/Icon.vue'

const route = useRoute()
const router = useRouter()

const navs = [
  { path: '/workbench', label: '工作台', icon: 'workbench' },
  { path: '/nutrition', label: '营养分析', icon: 'nutrition' },
  { path: '/recipes', label: '食谱库', icon: 'recipes' },
  { path: '/foods', label: '食材库', icon: 'foods' },
  { path: '/mapping', label: '映射库', icon: 'mapping' },
  { path: '/prices', label: '价格行情', icon: 'prices' },
  { path: '/dishes', label: '菜品库', icon: 'dishes' }
]

const title = computed(() => route.meta.title || '工作台')
const user = localStorage.getItem('username') || ''
const initial = computed(() => (user ? user.slice(0, 1).toUpperCase() : 'U'))
const today = new Date().toLocaleDateString('zh-CN', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
})

function logout() {
  localStorage.clear()
  router.push('/login')
}
</script>
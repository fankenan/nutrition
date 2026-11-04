import { createRouter, createWebHistory } from 'vue-router'
import Login from '@/views/Login.vue'
import Workbench from '@/views/Workbench.vue'
import Recipes from '@/views/Recipes.vue'
import Foods from '@/views/Foods.vue'
import Mapping from '@/views/Mapping.vue'
import Prices from '@/views/Prices.vue'
import Dishes from '@/views/Dishes.vue'
import NutritionAnalysis from '@/views/NutritionAnalysis.vue'

const routes = [
  { path: '/login', name: 'login', component: Login, meta: { public: true } },
  { path: '/', redirect: '/workbench' },
  { path: '/workbench', name: 'workbench', component: Workbench, meta: { title: '工作台' } },
  { path: '/recipes', name: 'recipes', component: Recipes, meta: { title: '食谱库' } },
  { path: '/foods', name: 'foods', component: Foods, meta: { title: '食材库' } },
  { path: '/mapping', name: 'mapping', component: Mapping, meta: { title: '映射库' } },
  { path: '/prices', name: 'prices', component: Prices, meta: { title: '价格行情' } },
  { path: '/dishes', name: 'dishes', component: Dishes, meta: { title: '菜品库' } },
  { path: '/nutrition', name: 'nutrition', component: NutritionAnalysis, meta: { title: '营养分析' } }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const token = localStorage.getItem('token')
  if (!to.meta.public && !token) return '/login'
  if (to.path === '/login' && token) return '/workbench'
})

export default router

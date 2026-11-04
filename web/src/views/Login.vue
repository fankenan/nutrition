<template>
  <div class="login-page">
    <div class="login-glow a" />
    <div class="login-glow b" />

    <div class="login-card">
      <div class="login-brand">
        <div class="login-mark"><Icon name="leaf" :size="22" color="#fff" :stroke-width="1.9" /></div>
        <div class="login-title">
          <b>食材价格与营养分析系统</b>
          <span>登封市教育局 · 体卫艺科</span>
        </div>
      </div>

      <div class="login-form">
        <div class="lf-field">
          <label>用户名</label>
          <t-input v-model="form.username" placeholder="请输入用户名" size="large" clearable>
            <template #prefix-icon><Icon name="users" :size="16" color="#9db0ab" /></template>
          </t-input>
        </div>
        <div class="lf-field">
          <label>密码</label>
          <t-input v-model="form.password" type="password" placeholder="请输入密码" size="large" @enter="onLogin">
            <template #prefix-icon><Icon name="target" :size="16" color="#9db0ab" /></template>
          </t-input>
        </div>
        <t-button theme="primary" size="large" block :loading="loading" class="login-btn" @click="onLogin">
          登录系统
        </t-button>
      </div>

      <div class="login-foot">WS/T 554 · DRIs 2023 双标准营养核算</div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import http from '@/api/http'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import Icon from '@/components/Icon.vue'

const router = useRouter()
const form = reactive({ username: '', password: '' })
const loading = ref(false)

async function onLogin() {
  if (!form.username || !form.password) {
    MessagePlugin.warning('请输入用户名和密码')
    return
  }
  loading.value = true
  try {
    const { data } = await http.post('/auth/login', form)
    if (data.token) {
      localStorage.setItem('token', data.token)
      localStorage.setItem('username', data.user?.display_name || data.user?.username || form.username)
      MessagePlugin.success('登录成功')
      router.push('/workbench')
    } else {
      MessagePlugin.error(data.error || '登录失败')
    }
  } catch (e) {
    MessagePlugin.error(e.response?.data?.error || '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  position: relative; min-height: 100vh;
  display: grid; place-items: center;
  background: #0b2822;
  overflow: hidden;
}
.login-glow {
  position: absolute; border-radius: 50%;
  filter: blur(90px); pointer-events: none;
}
.login-glow.a {
  width: 560px; height: 560px;
  background: rgba(20, 184, 166, 0.30);
  top: -180px; left: -120px;
}
.login-glow.b {
  width: 480px; height: 480px;
  background: rgba(45, 212, 191, 0.16);
  bottom: -200px; right: -100px;
}

.login-card {
  position: relative; z-index: 1;
  width: 400px; max-width: calc(100vw - 48px);
  background: rgba(255, 255, 255, 0.98);
  border-radius: 20px;
  padding: 36px 34px 26px;
  box-shadow: 0 30px 70px -30px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(20px);
}

.login-brand { display: flex; align-items: center; gap: 13px; margin-bottom: 30px; }
.login-mark {
  width: 46px; height: 46px; border-radius: 14px; flex-shrink: 0;
  background: linear-gradient(135deg, #2dd4bf, #0d9488 60%, #0f766e);
  display: grid; place-items: center;
  box-shadow: 0 10px 22px -10px rgba(13, 148, 136, 0.85), inset 0 1px 0 rgba(255,255,255,.3);
}
.login-title b {
  display: block; font-size: 15.5px; font-weight: 600;
  color: var(--text); letter-spacing: -0.01em;
}
.login-title span { display: block; font-size: 11.5px; color: var(--muted); margin-top: 3px; }

.login-form { display: flex; flex-direction: column; gap: 17px; }
.lf-field label {
  display: block; font-size: 11.5px; font-weight: 600;
  color: var(--muted); letter-spacing: 0.06em;
  text-transform: uppercase; margin-bottom: 7px;
}
.login-btn { margin-top: 8px; height: 44px; font-size: 14.5px; }

.login-foot {
  text-align: center; font-size: 11.5px; color: var(--muted-2);
  margin-top: 24px; padding-top: 18px;
  border-top: 1px solid var(--border);
  letter-spacing: 0.02em;
}
</style>
<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, setToken } from '../api';

const token = ref('');
const error = ref('');
const loading = ref(false);
const router = useRouter();

async function login() {
  error.value = '';
  loading.value = true;
  setToken(token.value.trim());
  try {
    await api('/settings');
    router.replace('/');
  } catch (e) {
    setToken('');
    error.value = (e as Error).message === '登录已失效' ? '口令不正确' : (e as Error).message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="card" style="max-width: 420px; margin: 12vh auto 0">
    <h1>Novel AI <span style="color: var(--accent)">Global</span></h1>
    <p class="muted small">海外网文 AI 工作台 · Stary Writing / Webnovel / Royal Road / Wattpad</p>
    <div v-if="error" class="error-box">{{ error }}</div>
    <form @submit.prevent="login">
      <label>管理口令（ADMIN_TOKEN）<input v-model="token" type="password" autocomplete="current-password" required /></label>
      <button class="primary" style="width: 100%" :disabled="loading">{{ loading ? '验证中…' : '进入' }}</button>
    </form>
  </div>
</template>

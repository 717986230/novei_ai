<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, setToken } from '../api';
import { toast } from '../toast';

const MODELS = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash（推荐，官方新项目首选）' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash（上一代）' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite（最便宜）' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview（预览版，较慢较贵）' },
];

const model = ref('');
const custom = ref('');
const temperature = ref(0.9);
const fallback = ref('gemini-3.5-flash-lite');
const test = ref<{ ok?: boolean; reply?: string; ms?: number; model?: string; fellBack?: boolean; error?: string } | null>(null);
const testing = ref(false);
const error = ref('');
const report = ref<any[] | null>(null);
const running = ref(false);
const router = useRouter();

onMounted(async () => {
  try {
    const s = await api<{ model: string; fallbackModel: string; temperature: number }>('/settings');
    temperature.value = s.temperature;
    fallback.value = s.fallbackModel;
    if (MODELS.some((m) => m.id === s.model)) model.value = s.model;
    else { model.value = 'custom'; custom.value = s.model; }
  } catch (e) {
    error.value = (e as Error).message;
  }
});

async function save() {
  error.value = '';
  try {
    await api('/settings', { method: 'PUT', body: { model: model.value === 'custom' ? custom.value.trim() : model.value, fallbackModel: fallback.value, temperature: temperature.value } });
    toast('已保存');
  } catch (e) {
    error.value = (e as Error).message;
  }
}

async function runTest() {
  testing.value = true;
  test.value = null;
  try {
    await save();
    test.value = await api('/settings/test', { method: 'POST' });
  } catch (e) {
    test.value = { error: (e as Error).message };
  } finally {
    testing.value = false;
  }
}

async function runCron() {
  if (!confirm('立即为所有开启了“每日自动更新”的书生成章节？可能需要几分钟。')) return;
  running.value = true;
  try {
    report.value = (await api<{ report: any[] }>('/cron/run', { method: 'POST' })).report;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    running.value = false;
  }
}

function logout() {
  setToken('');
  router.replace('/login');
}
</script>

<template>
  <h1>设置</h1>
  <div v-if="error" class="error-box">{{ error }}</div>
  <div class="card">
    <h2>Gemini 模型</h2>
    <label>模型
      <select v-model="model">
        <option v-for="m in MODELS" :key="m.id" :value="m.id">{{ m.label }}</option>
        <option value="custom">自定义模型 ID…</option>
      </select>
    </label>
    <label v-if="model === 'custom'">模型 ID<input v-model="custom" placeholder="gemini-…" /></label>
    <label>备用模型（主模型过载/超时 75 秒时自动切换）
      <select v-model="fallback">
        <option value="">不使用备用</option>
        <option v-for="m in MODELS" :key="m.id" :value="m.id">{{ m.label }}</option>
      </select>
    </label>
    <label>创造性（temperature）：{{ temperature.toFixed(2) }}
      <input v-model.number="temperature" type="range" min="0" max="1.5" step="0.05" />
    </label>
    <p class="small muted">API Key 存放在 Cloudflare 机密变量 <code>GEMINI_API_KEY</code> 中，不经过浏览器。</p>
    <div class="row">
      <button class="primary" @click="save">保存</button>
      <button :disabled="testing" @click="runTest">{{ testing ? '测试中…' : '保存并测试连接' }}</button>
    </div>
    <p v-if="test?.ok" class="ok small">✓ {{ test.model }} 回复 “{{ test.reply }}”，耗时 {{ ((test.ms ?? 0) / 1000).toFixed(1) }} 秒</p>
    <p v-if="test?.fellBack" class="warn small">主模型过载，本次已自动切换到备用模型。</p>
    <p v-if="test?.error" class="err small">✗ {{ test.error }}</p>
  </div>

  <div class="card">
    <h2>每日自动更新</h2>
    <p class="small muted">定时任务每天 UTC 06:17 运行（可在 wrangler.jsonc 的 triggers.crons 修改），也可以在这里手动触发一次。</p>
    <button :disabled="running" @click="runCron">{{ running ? '运行中…' : '立即运行一次' }}</button>
    <ul v-if="report" class="list small" style="margin-top: 10px">
      <li v-for="r in report" :key="r.bookId">{{ r.title }}：生成 {{ r.generated }} 章 <span v-if="r.error" class="err">· {{ r.error }}</span></li>
      <li v-if="!report.length" class="muted">没有开启自动更新的书</li>
    </ul>
  </div>

  <button @click="logout">退出登录</button>
</template>

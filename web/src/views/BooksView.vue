<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, loadPlatforms, type Book, type Platform } from '../api';

const books = ref<Book[]>([]);
const platforms = ref<Platform[]>([]);
const languages = ref<Record<string, string>>({});
const loading = ref(true);
const error = ref('');
const showForm = ref(false);
const saving = ref(false);
const router = useRouter();

const form = reactive({
  title: '', platform: 'stary', language: 'en', genre: '', tropes: '', premise: '',
  pov: 'first', tense: 'present', heatLevel: 'sweet', wordsPerChapter: 2000, targetChapters: 100, styleNotes: '',
});
const current = computed(() => platforms.value.find((p) => p.id === form.platform));
const platformName = (id: string) => platforms.value.find((p) => p.id === id)?.name ?? id;

watch(() => form.platform, () => {
  const p = current.value;
  if (!p) return;
  form.genre = p.genres[0];
  form.wordsPerChapter = p.defaultWords;
  form.pov = p.defaultPov;
  form.tense = p.defaultTense;
  if (!p.languages.includes(form.language)) form.language = 'en';
});

onMounted(async () => {
  try {
    const [b, p] = await Promise.all([api<{ books: Book[] }>('/books'), loadPlatforms()]);
    books.value = b.books;
    platforms.value = p.platforms;
    languages.value = p.languages;
    form.genre = p.platforms[0].genres[0];
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
});

async function create() {
  saving.value = true;
  error.value = '';
  try {
    const { book } = await api<{ book: Book }>('/books', {
      body: { ...form, tropes: form.tropes.split(/[,，\n]/).map((t) => t.trim()).filter(Boolean) },
    });
    router.push(`/books/${book.id}`);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="row between" style="margin-bottom: 12px">
    <h1 style="margin: 0">我的作品</h1>
    <button class="primary" @click="showForm = !showForm">{{ showForm ? '收起' : '＋ 新书' }}</button>
  </div>
  <div v-if="error" class="error-box">{{ error }}</div>

  <form v-if="showForm" class="card" @submit.prevent="create">
    <h2>新建作品</h2>
    <div class="grid">
      <label>平台
        <select v-model="form.platform"><option v-for="p in platforms" :key="p.id" :value="p.id">{{ p.name }}</option></select>
      </label>
      <label>语言
        <select v-model="form.language"><option v-for="l in current?.languages" :key="l" :value="l">{{ languages[l] ?? l }}</option></select>
      </label>
      <label>题材
        <input v-model="form.genre" list="genres" />
        <datalist id="genres"><option v-for="g in current?.genres" :key="g" :value="g" /></datalist>
      </label>
    </div>
    <p v-if="current" class="muted small" style="margin-top: 0">读者：{{ current.audience }}</p>
    <label>书名（英文/目标语言）<input v-model="form.title" required maxlength="200" placeholder="e.g. The Alpha's Rejected Mate" /></label>
    <label>梗 / Tropes（逗号分隔）<input v-model="form.tropes" placeholder="rejected mate, secret baby, enemies to lovers" /></label>
    <label>故事前提（可用中文写，AI 会用目标语言创作；留空则由 AI 构思）<textarea v-model="form.premise" maxlength="4000" /></label>
    <div class="grid">
      <label>人称<select v-model="form.pov"><option value="first">第一人称</option><option value="third">第三人称</option></select></label>
      <label>时态<select v-model="form.tense"><option value="present">现在时</option><option value="past">过去时</option></select></label>
      <label>尺度<select v-model="form.heatLevel"><option value="clean">清水</option><option value="sweet">甜宠（拉灯）</option><option value="steamy">火热（不露骨）</option></select></label>
      <label>每章字数（词）<input v-model.number="form.wordsPerChapter" type="number" min="500" max="8000" step="100" /></label>
      <label>计划章数<input v-model.number="form.targetChapters" type="number" min="1" max="3000" /></label>
    </div>
    <label>个人文风要求（可选）<textarea v-model="form.styleNotes" maxlength="4000" placeholder="e.g. Snarky heroine, short punchy sentences, no head-hopping." /></label>
    <p v-if="current" class="notice">{{ current.policyNote }}</p>
    <button class="primary" :disabled="saving">{{ saving ? '创建中…' : '创建' }}</button>
  </form>

  <p v-if="loading" class="muted">加载中…</p>
  <p v-else-if="!books.length && !showForm" class="muted">还没有作品，点右上角“新书”开始。</p>
  <RouterLink v-for="b in books" :key="b.id" :to="`/books/${b.id}`" class="card" style="display: block; color: inherit">
    <div class="row between">
      <strong>{{ b.title }}</strong>
      <span class="badge">{{ platformName(b.platform) }}</span>
    </div>
    <div class="muted small" style="margin-top: 4px">
      {{ b.genre }} · {{ (languages[b.language] ?? b.language).split(' ')[0] }} ·
      {{ b.chapterCount }}/{{ b.targetChapters }} 章 · {{ (b.totalWords ?? 0).toLocaleString() }} 词 · 已发布 {{ b.publishedCount }}
      <span v-if="b.autoDaily" class="ok"> · 每日自动 {{ b.autoDaily }} 章</span>
      <span v-if="!b.hasBible" class="warn"> · 未生成设定</span>
    </div>
  </RouterLink>
</template>

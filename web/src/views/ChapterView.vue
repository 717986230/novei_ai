<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router';
import { countWords } from '../../../worker/src/format';
import { api, loadPlatforms, STATUS_LABEL, type Book, type Chapter, type Platform } from '../api';
import { copyChapter } from '../clipboard';
import { toast } from '../toast';

const props = defineProps<{ id: string }>();
const router = useRouter();

const chapter = ref<Chapter | null>(null);
const siblings = ref<Chapter[]>([]);
const book = ref<Book | null>(null);
const platform = ref<Platform | null>(null);
const title = ref('');
const content = ref('');
const status = ref<Chapter['status']>('draft');
const publishedUrl = ref('');
const instruction = ref('');
const busy = ref('');
const error = ref('');

const dirty = computed(
  () =>
    !!chapter.value &&
    (title.value !== chapter.value.title || content.value !== chapter.value.content || status.value !== chapter.value.status || publishedUrl.value !== chapter.value.publishedUrl),
);
const words = computed(() => countWords(content.value));
const idx = computed(() => siblings.value.findIndex((c) => c.id === props.id));
const prev = computed(() => siblings.value[idx.value - 1]);
const next = computed(() => siblings.value[idx.value + 1]);

function apply(c: Chapter) {
  chapter.value = c;
  title.value = c.title;
  content.value = c.content;
  status.value = c.status;
  publishedUrl.value = c.publishedUrl;
}

async function load(id = props.id) {
  error.value = '';
  const { chapter: c } = await api<{ chapter: Chapter }>(`/chapters/${id}`);
  apply(c);
  const r = await api<{ book: Book; chapters: Chapter[] }>(`/books/${c.bookId}`);
  book.value = r.book;
  siblings.value = r.chapters;
  platform.value = (await loadPlatforms()).platforms.find((p) => p.id === r.book.platform) ?? null;
}

onMounted(() => load().catch((e) => (error.value = e.message)));
watch(() => props.id, (id) => load(id).catch((e) => (error.value = e.message)));

const confirmLeave = () => !dirty.value || confirm('有未保存的修改，确定离开？');
onBeforeRouteLeave(confirmLeave);
onBeforeRouteUpdate(confirmLeave);
const beforeUnload = (e: BeforeUnloadEvent) => { if (dirty.value) e.preventDefault(); };
window.addEventListener('beforeunload', beforeUnload);
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));

async function save(extra: Partial<Chapter> = {}) {
  error.value = '';
  try {
    const { chapter: c } = await api<{ chapter: Chapter }>(`/chapters/${props.id}`, {
      method: 'PATCH',
      body: { title: title.value, content: content.value, status: status.value, publishedUrl: publishedUrl.value, ...extra },
    });
    apply(c);
    toast('已保存');
  } catch (e) {
    error.value = (e as Error).message;
  }
}

async function markPublished() {
  status.value = 'published';
  await save();
}

async function copy(mode: 'plain' | 'html') {
  await copyChapter(content.value, mode);
  toast(mode === 'html' ? '已复制（富文本）' : '已复制（纯文本）');
}

async function aiAction(label: string, fn: () => Promise<{ chapter: Chapter }>) {
  if (dirty.value && !confirm('AI 会覆盖当前未保存的修改，继续？')) return;
  busy.value = label;
  error.value = '';
  try {
    apply((await fn()).chapter);
    toast('完成');
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = '';
  }
}

const rewrite = () =>
  aiAction('AI 改写中', () => api(`/chapters/${props.id}/rewrite`, { body: { instruction: instruction.value } }));
const regenerate = () =>
  aiAction('重新生成本章', () =>
    api(`/books/${chapter.value!.bookId}/chapters/generate`, { body: { number: chapter.value!.number, instruction: instruction.value || undefined } }),
  );
const resummarize = () => aiAction('更新摘要', () => api(`/chapters/${props.id}/summary`, { method: 'POST' }));

async function remove() {
  if (!confirm(`删除第 ${chapter.value?.number} 章？`)) return;
  await api(`/chapters/${props.id}`, { method: 'DELETE' });
  content.value = chapter.value!.content; // clear dirty
  router.replace(`/books/${chapter.value!.bookId}`);
}
</script>

<template>
  <div v-if="error" class="error-box">{{ error }}</div>
  <template v-if="chapter && book">
    <div class="row between" style="margin-bottom: 10px">
      <RouterLink :to="`/books/${book.id}`" class="small">← {{ book.title }}</RouterLink>
      <div class="row">
        <RouterLink v-if="prev" :to="`/chapters/${prev.id}`" class="btn small">‹ {{ prev.number }}</RouterLink>
        <RouterLink v-if="next" :to="`/chapters/${next.id}`" class="btn small">{{ next.number }} ›</RouterLink>
      </div>
    </div>

    <div class="card">
      <div class="row" style="flex-wrap: nowrap">
        <strong style="white-space: nowrap">第 {{ chapter.number }} 章</strong>
        <input v-model="title" placeholder="章节标题" />
      </div>
      <div class="row small muted" style="margin-top: 8px">
        <span>{{ words.toLocaleString() }} 词</span>
        <span>目标 {{ book.wordsPerChapter }}</span>
        <span :class="['badge', chapter.status]">{{ STATUS_LABEL[chapter.status] }}</span>
        <span v-if="dirty" class="warn">● 未保存</span>
      </div>
    </div>

    <div v-if="busy" class="card row"><span class="spinner"></span>{{ busy }}…（30–120 秒）</div>

    <textarea v-model="content" class="editor" spellcheck="true" :lang="book.language" />

    <div class="sticky-actions row">
      <button class="primary" :disabled="!dirty" @click="save()">保存</button>
      <button @click="copy(platform?.pasteFormat ?? 'plain')">复制正文</button>
      <button v-if="platform?.pasteFormat === 'html'" class="small" @click="copy('plain')">复制纯文本</button>
      <button v-else class="small" @click="copy('html')">复制富文本</button>
    </div>

    <div class="card">
      <h2>发布状态</h2>
      <div class="grid">
        <label>状态<select v-model="status"><option value="draft">草稿</option><option value="ready">待发布</option><option value="published">已发布</option></select></label>
        <label>平台章节链接<input v-model="publishedUrl" type="url" placeholder="https://…" /></label>
      </div>
      <div class="row">
        <button :disabled="!dirty" @click="save()">保存状态</button>
        <button v-if="chapter.status !== 'published'" class="primary" @click="markPublished">标记为已发布</button>
        <a v-if="platform" :href="platform.url" target="_blank" rel="noopener" class="btn">打开 {{ platform.name }} ↗</a>
      </div>
      <p v-if="platform?.disclosureNote" class="notice" style="margin-top: 10px">发布时请在作者注中加入：<br /><em>{{ platform.disclosureNote }}</em></p>
    </div>

    <div class="card">
      <h2>AI 修改</h2>
      <label>修改要求（中英文均可）<input v-model="instruction" maxlength="2000" placeholder="e.g. 节奏再快一点，多一些对话，结尾加强悬念" /></label>
      <div class="row">
        <button class="primary" :disabled="!!busy || !instruction.trim()" @click="rewrite">按要求改写</button>
        <button :disabled="!!busy" @click="regenerate">整章重新生成</button>
      </div>
    </div>

    <details class="card">
      <summary>本章摘要（用于保持后续章节连贯）</summary>
      <pre class="wrap small">{{ chapter.summary || '（无）' }}</pre>
      <button class="small" :disabled="!!busy" @click="resummarize">根据正文重新生成摘要</button>
    </details>

    <button class="danger" @click="remove">删除本章</button>
  </template>
  <p v-else-if="!error" class="muted">加载中…</p>
</template>

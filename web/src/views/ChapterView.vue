<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router';
import { countWords } from '../../../worker/src/format';
import { api, loadPlatforms, STATUS_LABEL, type Book, type Chapter, type ChapterIssue, type ChapterVersion, type Issue, type Platform } from '../api';
import StateView from '../components/StateView.vue';
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
const issues = ref<(Issue & { pick: boolean; fixed?: boolean })[] | null>(null);
const SEV: Record<string, string> = { high: '严重', medium: '中等', low: '轻微' };

const dirty = computed(
  () =>
    !!chapter.value &&
    (title.value !== chapter.value.title || content.value !== chapter.value.content || status.value !== chapter.value.status || publishedUrl.value !== chapter.value.publishedUrl),
);
const words = computed(() => countWords(content.value));
const idx = computed(() => siblings.value.findIndex((c) => c.id === props.id));
const prev = computed(() => siblings.value[idx.value - 1]);
const next = computed(() => siblings.value[idx.value + 1]);

// ---- version history ----
const versions = ref<ChapterVersion[] | null>(null);
const showVersions = ref(false);
const REASON_LABEL: Record<string, string> = { generate: '生成', rewrite: '改写', edit: '手动编辑', 'restore-backup': '恢复前备份' };

// ---- paragraph-level rewrite (selected text) ----
const editorRef = ref<HTMLTextAreaElement | null>(null);
const selText = ref('');
const selStart = ref(0);
const selEnd = ref(0);
const selBusy = ref('');
const selInstruction = ref('');
const selResult = ref<string | null>(null);
const selCandidates = ref<string[] | null>(null);

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
  // Persisted issues survive leaving the page; a missing table (DB not yet
  // migrated) must not break the chapter page.
  try {
    const ir = await api<{ issues: ChapterIssue[] }>(`/chapters/${id}/issues`);
    issues.value = ir.issues.map((i) => ({ ...i, pick: i.severity !== 'low' && !i.fixed }));
  } catch {
    /* ignore */
  }
  versions.value = null;
  showVersions.value = false;
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
const regenerate = async () => {
  await aiAction('重新生成本章', () =>
    api(`/books/${chapter.value!.bookId}/chapters/generate`, { body: { number: chapter.value!.number, instruction: instruction.value || undefined } }),
  );
  // Generation auto-checks and persists issues; show them without another click.
  try {
    const ir = await api<{ issues: ChapterIssue[] }>(`/chapters/${props.id}/issues`);
    issues.value = ir.issues.map((i) => ({ ...i, pick: i.severity !== 'low' && !i.fixed }));
  } catch {
    /* ignore */
  }
};
const refreshLedger = () => aiAction('更新摘要与账本', () => api(`/chapters/${props.id}/ledger`, { method: 'POST' }));

async function check() {
  if (dirty.value) await save();
  busy.value = '一致性检查中';
  error.value = '';
  issues.value = null;
  try {
    const r = await api<{ issues: Issue[] }>(`/chapters/${props.id}/check`, { method: 'POST' });
    issues.value = r.issues.map((i) => ({ ...i, pick: i.severity !== 'low' }));
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = '';
  }
}

async function fixIssues() {
  const picked = (issues.value ?? []).filter((i) => i.pick).map(({ pick, ...i }) => i);
  if (!picked.length) return;
  if (dirty.value && !confirm('AI 会覆盖当前未保存的修改，继续？')) return;
  busy.value = `修正 ${picked.length} 处问题`;
  error.value = '';
  try {
    // The fix endpoint re-checks and returns the fresh persisted list, so the
    // author sees whether the fix actually worked.
    const r = await api<{ chapter: Chapter; issues: ChapterIssue[] }>(`/chapters/${props.id}/fix`, { body: { issues: picked } });
    apply(r.chapter);
    issues.value = r.issues.map((i) => ({ ...i, pick: i.severity !== 'low' && !i.fixed }));
    toast('完成');
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = '';
  }
}

async function toggleVersions() {
  showVersions.value = !showVersions.value;
  if (showVersions.value && !versions.value) {
    try {
      versions.value = (await api<{ versions: ChapterVersion[] }>(`/chapters/${props.id}/versions`)).versions;
    } catch (e) {
      error.value = (e as Error).message;
    }
  }
}

async function restoreVersion(v: ChapterVersion) {
  if (!confirm(`恢复到 ${new Date(v.createdAt).toLocaleString()} 的版本？当前正文会先存为一个版本，可以再恢复回来。`)) return;
  busy.value = '恢复版本中';
  error.value = '';
  try {
    const { chapter: c } = await api<{ chapter: Chapter }>(`/chapters/${props.id}/restore`, { body: { versionId: v.id } });
    apply(c);
    versions.value = null; // reload the list next time it is opened
    toast('已恢复到历史版本');
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = '';
  }
}

function trackSelection() {
  const el = editorRef.value;
  if (!el) return;
  const s = el.selectionStart ?? 0;
  const e = el.selectionEnd ?? 0;
  if (e > s && e - s <= 8000) {
    selText.value = content.value.slice(s, e);
    selStart.value = s;
    selEnd.value = e;
  } else {
    selText.value = '';
  }
  selResult.value = null;
  selCandidates.value = null;
}

async function selectionAction(mode: 'rewrite' | 'expand' | 'shorten' | 'style' | 'variants') {
  if (!selText.value) return;
  selBusy.value = mode;
  selResult.value = null;
  selCandidates.value = null;
  error.value = '';
  try {
    const r = await api<{ result?: string; candidates?: string[] }>(`/chapters/${props.id}/selection`, {
      body: { selection: selText.value, mode, instruction: selInstruction.value || undefined },
    });
    if (r.candidates) selCandidates.value = r.candidates;
    else selResult.value = r.result ?? '';
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    selBusy.value = '';
  }
}

function applySelection(text: string) {
  content.value = content.value.slice(0, selStart.value) + text + content.value.slice(selEnd.value);
  selText.value = '';
  selResult.value = null;
  selCandidates.value = null;
  toast('已替换选中段落，记得保存');
}

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

    <textarea
      ref="editorRef"
      v-model="content"
      class="editor"
      spellcheck="true"
      :lang="book.language"
      @select="trackSelection"
      @mouseup="trackSelection"
      @keyup="trackSelection"
    />

    <div v-if="selText" class="card">
      <h2>选中段落改写</h2>
      <p class="small muted">已选 {{ selText.length }} 字：<em>“{{ selText.slice(0, 60) }}{{ selText.length > 60 ? '…' : '' }}”</em></p>
      <label>风格 / 额外要求（换风格、改写时用）<input v-model="selInstruction" maxlength="2000" placeholder="e.g. 更冷峻、更口语化" /></label>
      <div class="row">
        <button :disabled="!!selBusy" @click="selectionAction('rewrite')">改写</button>
        <button :disabled="!!selBusy" @click="selectionAction('expand')">扩写</button>
        <button :disabled="!!selBusy" @click="selectionAction('shorten')">缩写</button>
        <button :disabled="!!selBusy" @click="selectionAction('style')">换风格</button>
        <button :disabled="!!selBusy" @click="selectionAction('variants')">出 3 个候选</button>
      </div>
      <p v-if="selBusy" class="small muted">AI 处理中…（30–120 秒）</p>
      <div v-if="selResult" style="margin-top: 10px">
        <pre class="wrap small">{{ selResult }}</pre>
        <button class="primary small" @click="applySelection(selResult)">采用这段</button>
      </div>
      <div v-if="selCandidates?.length" style="margin-top: 10px">
        <div v-for="(cand, n) in selCandidates" :key="n" class="card">
          <p class="small muted">候选 {{ n + 1 }}</p>
          <pre class="wrap small">{{ cand }}</pre>
          <button class="primary small" @click="applySelection(cand)">采用候选 {{ n + 1 }}</button>
        </div>
      </div>
    </div>

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

    <div class="card">
      <div class="row between">
        <h2 style="margin: 0">历史版本</h2>
        <button class="small" @click="toggleVersions">{{ showVersions ? '收起' : '查看历史版本' }}</button>
      </div>
      <p class="small muted">每次生成、改写或手动保存覆盖正文前，都会先存一个版本。恢复后当前正文也会先备份，可以再恢复回来。</p>
      <ul v-if="showVersions && versions?.length" class="list small">
        <li v-for="v in versions" :key="v.id">
          <div class="row between">
            <span>{{ new Date(v.createdAt).toLocaleString() }} · {{ REASON_LABEL[v.reason] ?? v.reason }} · {{ v.wordCount }} 词</span>
            <button class="small" @click="restoreVersion(v)">恢复此版</button>
          </div>
          <p class="muted" style="margin: 4px 0 0">{{ v.content.slice(0, 80) }}{{ v.content.length > 80 ? '…' : '' }}</p>
        </li>
      </ul>
      <p v-if="showVersions && versions && !versions.length" class="small muted">暂无历史版本（本章还没有被覆盖过）。</p>
    </div>

    <div class="card">
      <div class="row between">
        <h2 style="margin: 0">一致性检查</h2>
        <button class="primary" :disabled="!!busy" @click="check">检查本章</button>
      </div>
      <p class="small muted">对照人物卡、世界规则、前情和连续性账本，找出人名/外貌/口吻/谁知道什么/时间地点/伤势道具/伏笔等矛盾。检查结果会存下来，离开页面也不用重查。</p>
      <p v-if="issues && !issues.length" class="ok small">✓ 没发现矛盾</p>
      <ul v-if="issues?.length" class="list small">
        <li v-for="(i, n) in issues" :key="n">
          <label class="row" style="margin: 0; color: var(--text); flex-wrap: nowrap; align-items: flex-start">
            <input v-model="i.pick" type="checkbox" style="width: auto; margin-top: 4px" :disabled="i.fixed" />
            <span>
              <span :class="i.severity === 'high' ? 'err' : i.severity === 'medium' ? 'warn' : 'muted'">[{{ SEV[i.severity] ?? i.severity }} · {{ i.category }}]</span>
              <span v-if="i.fixed" class="ok"> ✓ 已修复</span>
              {{ i.problem }}<br />
              <span class="muted">原文：“{{ i.quote }}” → {{ i.fix }}</span>
            </span>
          </label>
        </li>
      </ul>
      <button v-if="issues?.length" :disabled="!!busy || !issues.some((i) => i.pick)" @click="fixIssues">AI 修正选中问题</button>
    </div>

    <details class="card">
      <summary>本章摘要与连续性账本（写下一章时使用）</summary>
      <pre class="wrap small">{{ chapter.summary || '（无）' }}</pre>
      <StateView v-if="chapter.state" :state="chapter.state" style="margin-top: 10px" />
      <p class="small muted">手动改过正文后，点下面按钮让账本跟上，否则后续章节会按旧内容续写。</p>
      <button class="small" :disabled="!!busy" @click="refreshLedger">根据正文更新摘要与账本</button>
    </details>

    <button class="danger" @click="remove">删除本章</button>
  </template>
  <p v-else-if="!error" class="muted">加载中…</p>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, download, HEAT_LABEL, loadPlatforms, STATUS_LABEL, type Book, type Chapter, type Job, type Platform, type StoryState } from '../api';
import StateView from '../components/StateView.vue';
import { copyChapter } from '../clipboard';
import { toast } from '../toast';

const props = defineProps<{ id: string }>();
const router = useRouter();

const book = ref<Book | null>(null);
const chapters = ref<Chapter[]>([]);
const jobs = ref<Job[]>([]);
const ledger = ref<StoryState | null>(null);
const platform = ref<Platform | null>(null);
const languages = ref<Record<string, string>>({});
const tab = ref<'chapters' | 'bible' | 'info' | 'export'>('chapters');
const error = ref('');
const busy = ref('');
const elapsed = ref(0);
const instruction = ref('');
const edit = ref<Partial<Book> & { tropesText?: string }>({});
const bibleText = ref('');
const exportOpts = ref({ format: 'txt', from: 1, to: 0, unpublished: false, note: true });
let timer: ReturnType<typeof setInterval> | undefined;

const running = computed(() => jobs.value.find((j) => j.status === 'running'));
const nextNumber = computed(() => (chapters.value.at(-1)?.number ?? 0) + 1);
const totalWords = computed(() => chapters.value.reduce((s, c) => s + c.wordCount, 0));
const nextOutline = computed(() => book.value?.bible?.outline.find((o) => o.number === nextNumber.value));

async function load() {
  const r = await api<{ book: Book; chapters: Chapter[]; jobs: Job[]; state: StoryState | null }>(`/books/${props.id}`);
  book.value = r.book;
  ledger.value = r.state;
  chapters.value = r.chapters;
  jobs.value = r.jobs;
  bibleText.value = r.book.bible ? JSON.stringify(r.book.bible, null, 2) : '';
  edit.value = { ...r.book, tropesText: r.book.tropes.join(', ') };
  const p = await loadPlatforms();
  platform.value = p.platforms.find((x) => x.id === r.book.platform) ?? null;
  languages.value = p.languages;
}

onMounted(() => load().catch((e) => (error.value = e.message)));
onUnmounted(() => clearInterval(timer));

/** Long AI call with an elapsed timer. If the connection drops, poll until the server-side job finishes. */
async function run(label: string, fn: () => Promise<unknown>) {
  error.value = '';
  busy.value = label;
  elapsed.value = 0;
  timer = setInterval(() => elapsed.value++, 1000);
  try {
    await fn();
    await load();
  } catch (e) {
    const msg = (e as Error).message;
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) {
      busy.value = `${label}（连接中断，等待服务器完成…）`;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        try {
          await load();
          if (!running.value) break;
        } catch { /* keep polling */ }
      }
    } else {
      error.value = msg;
      await load().catch(() => {});
    }
  } finally {
    clearInterval(timer);
    busy.value = '';
  }
}

const genBible = () => run('生成故事设定与大纲', () => api(`/books/${props.id}/bible`, { method: 'POST' }));
const extendOutline = () => run('续写大纲', () => api(`/books/${props.id}/outline`, { method: 'POST' }));
const genNext = () =>
  run(`生成第 ${nextNumber.value} 章`, async () => {
    await api(`/books/${props.id}/chapters/generate`, { body: { instruction: instruction.value || undefined } });
    instruction.value = '';
    toast('章节已生成');
  });

async function saveInfo() {
  error.value = '';
  try {
    const { tropesText, bible, id, createdAt, updatedAt, hasBible, chapterCount, totalWords: _tw, publishedCount, ...rest } = edit.value as any;
    await api(`/books/${props.id}`, { method: 'PATCH', body: { ...rest, tropes: String(tropesText ?? '').split(/[,，\n]/).map((t) => t.trim()).filter(Boolean) } });
    await load();
    toast('已保存');
  } catch (e) {
    error.value = (e as Error).message;
  }
}

async function saveBible() {
  error.value = '';
  try {
    const bible = JSON.parse(bibleText.value);
    await api(`/books/${props.id}`, { method: 'PATCH', body: { bible } });
    await load();
    toast('设定已保存');
  } catch (e) {
    error.value = e instanceof SyntaxError ? `JSON 格式错误：${e.message}` : (e as Error).message;
  }
}

async function setAuto(n: number) {
  await api(`/books/${props.id}`, { method: 'PATCH', body: { autoDaily: n } });
  await load();
  toast(n ? `已开启：每天自动 ${n} 章` : '已关闭每日自动更新');
}

async function quickCopy(c: Chapter) {
  const { chapter } = await api<{ chapter: Chapter }>(`/chapters/${c.id}`);
  await copyChapter(chapter.content, platform.value?.pasteFormat ?? 'plain');
  toast(`已复制第 ${c.number} 章正文`);
}

async function doExport() {
  const o = exportOpts.value;
  const q = new URLSearchParams({ format: o.format, from: String(o.from || 1), note: o.note ? '1' : '0' });
  if (o.to) q.set('to', String(o.to));
  if (o.unpublished) q.set('unpublished', '1');
  try {
    await download(`/books/${props.id}/export?${q}`, `book.${o.format}`);
  } catch (e) {
    error.value = (e as Error).message;
  }
}

async function remove() {
  if (!confirm(`确定删除《${book.value?.title}》及全部章节？此操作不可恢复。`)) return;
  await api(`/books/${props.id}`, { method: 'DELETE' });
  router.replace('/');
}

const fmtTime = (s: string) => new Date(s).toLocaleString();
</script>

<template>
  <div v-if="error" class="error-box">{{ error }}</div>
  <p v-if="!book && !error" class="muted">加载中…</p>

  <template v-if="book">
    <div class="card">
      <div class="row between">
        <h1 style="margin: 0">{{ book.title }}</h1>
        <a v-if="platform" class="badge" :href="platform.url" target="_blank" rel="noopener">{{ platform.name }} ↗</a>
      </div>
      <p class="muted small" style="margin: 6px 0 0">
        {{ book.genre }} · {{ languages[book.language] ?? book.language }} · {{ book.pov === 'first' ? '第一人称' : '第三人称' }} ·
        {{ HEAT_LABEL[book.heatLevel] }} · {{ chapters.length }}/{{ book.targetChapters }} 章 · {{ totalWords.toLocaleString() }} 词
      </p>
      <p v-if="book.bible" style="margin: 8px 0 0"><em>{{ book.bible.logline }}</em></p>
    </div>

    <div v-if="busy || running" class="card row">
      <span class="spinner"></span>
      <span>{{ busy || `服务器正在执行：${running?.type} ${running?.detail}` }}</span>
      <span v-if="busy" class="muted small">{{ elapsed }}s（通常 30–120 秒，请勿关闭页面）</span>
    </div>

    <div class="tabs">
      <button :class="{ active: tab === 'chapters' }" @click="tab = 'chapters'">章节</button>
      <button :class="{ active: tab === 'bible' }" @click="tab = 'bible'">设定/大纲</button>
      <button :class="{ active: tab === 'export' }" @click="tab = 'export'">导出发布</button>
      <button :class="{ active: tab === 'info' }" @click="tab = 'info'">作品设置</button>
    </div>

    <!-- 章节 -->
    <template v-if="tab === 'chapters'">
      <div v-if="!book.bible" class="card">
        <h2>第一步：生成故事设定</h2>
        <p class="muted small">AI 会根据平台风格生成：一句话卖点、作品简介（可直接贴到平台）、标签、人物、世界观和前 20 章大纲。</p>
        <button class="primary" :disabled="!!busy || !!running" @click="genBible">生成设定与大纲</button>
      </div>
      <div class="card">
        <div class="row between">
          <h2 style="margin: 0">写第 {{ nextNumber }} 章</h2>
          <span v-if="nextNumber > book.targetChapters" class="warn small">已超过计划章数</span>
        </div>
        <p v-if="nextOutline" class="small" style="margin: 8px 0"><strong>{{ nextOutline.title }}</strong> — <span class="muted">{{ nextOutline.beats }}</span></p>
        <label style="margin-top: 8px">本章额外要求（可选，中英文均可）<input v-model="instruction" maxlength="2000" placeholder="e.g. 让男主吃醋；结尾留悬念" /></label>
        <button class="primary" :disabled="!!busy || !!running" @click="genNext">✦ 生成下一章</button>
      </div>
      <div class="card">
        <ul class="list">
          <li v-if="!chapters.length" class="muted">暂无章节</li>
          <li v-for="c in chapters" :key="c.id" class="row between">
            <RouterLink :to="`/chapters/${c.id}`" style="flex: 1; min-width: 0; color: inherit">
              <div><strong>{{ c.number }}.</strong> {{ c.title || '(无标题)' }}</div>
              <div class="muted small">{{ c.wordCount.toLocaleString() }} 词 · <span :class="['badge', c.status]">{{ STATUS_LABEL[c.status] }}</span></div>
            </RouterLink>
            <button class="small" @click="quickCopy(c)">复制</button>
          </li>
        </ul>
      </div>
    </template>

    <!-- 设定 -->
    <template v-if="tab === 'bible'">
      <div v-if="!book.bible" class="card"><button class="primary" :disabled="!!busy" @click="genBible">生成设定与大纲</button></div>
      <template v-else>
        <div class="card">
          <h2>作品简介（贴到平台作品页）</h2>
          <pre class="wrap">{{ book.bible.blurb }}</pre>
          <p class="small"><span v-for="t in book.bible.tags" :key="t" class="badge" style="margin: 0 4px 4px 0">{{ t }}</span></p>
          <button class="small" @click="copyChapter(book.bible.blurb, 'plain').then(() => toast('简介已复制'))">复制简介</button>
        </div>
        <div class="card">
          <h2>人物</h2>
          <ul class="list">
            <li v-for="ch in book.bible.characters" :key="ch.name">
              <strong>{{ ch.name }}</strong> <span class="muted">· {{ ch.role }}</span>
              <div class="small">{{ ch.description }}</div>
              <div v-if="ch.appearance" class="small"><span class="muted">外貌（固定）：</span>{{ ch.appearance }}</div>
              <div v-if="ch.voice" class="small"><span class="muted">说话方式：</span>{{ ch.voice }}</div>
              <div v-if="ch.relationships" class="small"><span class="muted">初始关系：</span>{{ ch.relationships }}</div>
            </li>
          </ul>
          <h2 style="margin-top: 14px">世界观</h2>
          <pre class="wrap small">{{ book.bible.setting }}</pre>
          <template v-if="book.bible.worldRules?.length">
            <h3 style="margin-top: 10px">世界/力量体系规则</h3>
            <ul class="small" style="margin: 0; padding-left: 18px"><li v-for="r in book.bible.worldRules" :key="r">{{ r }}</li></ul>
          </template>
        </div>
        <div class="card">
          <h2>连续性账本（最新章节结束时）</h2>
          <p class="small muted">每章写完 AI 自动记录：人物状态、谁知道什么、未收伏笔、已确立事实。写下一章时作为硬性约束。</p>
          <StateView v-if="ledger" :state="ledger" />
          <p v-else class="muted small">还没有章节。</p>
        </div>
        <div class="card">
          <div class="row between"><h2 style="margin: 0">大纲（{{ book.bible.outline.length }} 章）</h2><button :disabled="!!busy || !!running" @click="extendOutline">续写 20 章大纲</button></div>
          <ul class="list"><li v-for="o in book.bible.outline" :key="o.number"><strong>{{ o.number }}. {{ o.title }}</strong><div class="small muted">{{ o.beats }}</div></li></ul>
        </div>
        <details class="card">
          <summary>高级：直接编辑设定 JSON</summary>
          <textarea v-model="bibleText" style="min-height: 50vh; font-family: ui-monospace, monospace; font-size: 13px" />
          <div class="row" style="margin-top: 8px"><button class="primary" @click="saveBible">保存设定</button><button :disabled="!!busy" @click="genBible">重新生成（覆盖）</button></div>
        </details>
      </template>
    </template>

    <!-- 导出 -->
    <template v-if="tab === 'export'">
      <div class="card">
        <h2>发布到 {{ platform?.name }}</h2>
        <p class="small muted">这些平台没有公开的发布 API。流程：在章节页点“复制正文” → 打开平台作者后台粘贴 → 发布后回来把章节标记为“已发布”并填链接。</p>
        <p class="small">本平台建议粘贴格式：<strong>{{ platform?.pasteFormat === 'html' ? '富文本（保留斜体）' : '纯文本' }}</strong></p>
        <p v-if="platform" class="notice">{{ platform.policyNote }}</p>
      </div>
      <div class="card">
        <h2>整本 / 批量导出</h2>
        <div class="grid">
          <label>格式<select v-model="exportOpts.format"><option value="txt">TXT 纯文本</option><option value="md">Markdown</option><option value="html">HTML</option></select></label>
          <label>从第几章<input v-model.number="exportOpts.from" type="number" min="1" /></label>
          <label>到第几章（0=最后）<input v-model.number="exportOpts.to" type="number" min="0" /></label>
        </div>
        <label class="row"><input v-model="exportOpts.unpublished" type="checkbox" style="width: auto" /> 只导出未发布章节</label>
        <label v-if="platform?.disclosureNote" class="row"><input v-model="exportOpts.note" type="checkbox" style="width: auto" /> 每章末尾附 AI 声明作者注</label>
        <button class="primary" @click="doExport">下载</button>
      </div>
    </template>

    <!-- 作品设置 -->
    <template v-if="tab === 'info'">
      <form class="card" @submit.prevent="saveInfo">
        <label>书名<input v-model="edit.title" maxlength="200" /></label>
        <div class="grid">
          <label>题材<input v-model="edit.genre" /></label>
          <label>语言<select v-model="edit.language"><option v-for="l in platform?.languages" :key="l" :value="l">{{ languages[l] ?? l }}</option></select></label>
          <label>人称<select v-model="edit.pov"><option value="first">第一人称</option><option value="third">第三人称</option></select></label>
          <label>时态<select v-model="edit.tense"><option value="present">现在时</option><option value="past">过去时</option></select></label>
          <label>尺度<select v-model="edit.heatLevel"><option value="clean">清水</option><option value="sweet">甜宠（拉灯）</option><option value="steamy">火热（不露骨）</option></select></label>
          <label>每章字数<input v-model.number="edit.wordsPerChapter" type="number" min="500" max="8000" step="100" /></label>
          <label>计划章数<input v-model.number="edit.targetChapters" type="number" min="1" max="3000" /></label>
        </div>
        <label>Tropes<input v-model="edit.tropesText" /></label>
        <label>故事前提<textarea v-model="edit.premise" maxlength="4000" /></label>
        <label>文风要求<textarea v-model="edit.styleNotes" maxlength="4000" /></label>
        <button class="primary">保存</button>
      </form>
      <div class="card">
        <h2>每日自动更新</h2>
        <p class="small muted">Cloudflare 定时任务每天（UTC 06:17，维也纳时间 07:17/08:17）自动续写，生成后为草稿，需你审核发布。</p>
        <div class="row">
          <button v-for="n in [0, 1, 2, 3, 5]" :key="n" :class="{ primary: book.autoDaily === n }" @click="setAuto(n)">{{ n ? `${n} 章/天` : '关闭' }}</button>
        </div>
      </div>
      <div class="card">
        <h2>最近任务</h2>
        <ul class="list small">
          <li v-for="j in jobs" :key="j.id"><span :class="j.status === 'failed' ? 'err' : j.status === 'done' ? 'ok' : 'warn'">{{ j.status }}</span> {{ j.type }} {{ j.detail }} · <span class="muted">{{ fmtTime(j.created_at) }}</span><div v-if="j.error" class="err">{{ j.error }}</div></li>
          <li v-if="!jobs.length" class="muted">暂无</li>
        </ul>
      </div>
      <button class="danger" @click="remove">删除这本书</button>
    </template>
  </template>
</template>

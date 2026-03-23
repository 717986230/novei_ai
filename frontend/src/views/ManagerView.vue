<template>
  <div class="page-frame ops-page">
    <section class="ops-header">
      <div>
        <div class="eyebrow">Operations</div>
        <h2>小说运营控制台</h2>
        <p>主屏只负责看状态、做调度、处理异常。书籍设置、章节编辑、批量生成全部下沉到弹窗。</p>
      </div>

      <div class="header-status">
        <el-tag :type="healthTagType" size="large">{{ healthSummary }}</el-tag>
        <span>{{ currentBookTitle }}</span>
      </div>
    </section>

    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
    />

    <section class="kpi-grid">
      <article class="kpi-card">
        <span>当前书籍</span>
        <strong>{{ currentBookTitle }}</strong>
        <small>{{ booksStore.currentBookKey || '未选择书籍' }}</small>
      </article>
      <article class="kpi-card">
        <span>总章节</span>
        <strong>{{ novelStats.total || 0 }}</strong>
        <small>目标 {{ novelTarget }}</small>
      </article>
      <article class="kpi-card">
        <span>待发布</span>
        <strong>{{ unpublishedCount }}</strong>
        <small>已发布 {{ novelStats.published || 0 }}</small>
      </article>
      <article class="kpi-card">
        <span>工作流</span>
        <strong>{{ activeWorkflowStatusText }}</strong>
        <small>{{ activeWorkflowShortMessage }}</small>
      </article>
      <article class="kpi-card">
        <span>总字数</span>
        <strong>{{ formatNumber(novelStats.totalWords) }}</strong>
        <small>平均 {{ formatNumber(novelStats.averageWords) }} / 章</small>
      </article>
    </section>

    <section class="glass-card command-card">
      <div class="command-grid">
        <div class="book-selector">
          <el-select
            :model-value="booksStore.currentBookKey"
            filterable
            placeholder="选择书籍"
            class="full-width"
            @update:model-value="switchBook"
          >
            <el-option
              v-for="book in booksStore.books"
              :key="book.key"
              :label="formatBookLabel(book)"
              :value="book.key"
            />
          </el-select>
        </div>

        <div class="command-actions">
          <el-button type="primary" :disabled="!booksStore.currentBookKey" :loading="workflowStarting" @click="startNextChapterWorkflow">
            生成下一章
          </el-button>
          <el-button :disabled="!booksStore.currentBookKey" @click="batchDialogVisible = true">
            批量生成
          </el-button>
          <el-button :disabled="!booksStore.currentBookKey" @click="publishChapters">
            发布待发布章节
          </el-button>
          <el-button :loading="refreshing" @click="refreshWorkspace">
            刷新
          </el-button>
          <el-dropdown trigger="click">
            <el-button plain>
              更多操作
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="bookDialogVisible = true">新建书籍</el-dropdown-item>
                <el-dropdown-item :disabled="!booksStore.currentBookKey" @click="openBookSettings">书籍设置</el-dropdown-item>
                <el-dropdown-item :disabled="!booksStore.currentBookKey" @click="repairData">修复数据</el-dropdown-item>
                <el-dropdown-item :disabled="!booksStore.currentBookKey" @click="resetCurrentBook">重置当前书</el-dropdown-item>
                <el-dropdown-item :disabled="!booksStore.currentBook" @click="removeCurrentBook">删除当前书</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </section>

    <div class="main-grid">
      <section class="glass-card chapter-card">
        <div class="card-head card-head-inline">
          <div>
            <h3>章节运营表</h3>
            <p>只看章节状态和处理动作。编辑章节通过弹窗完成。</p>
          </div>
          <div class="table-meta">
            <span>共 {{ chaptersStore.chapters.length }} 章</span>
          </div>
        </div>

        <div class="card-body">
          <el-table
            :data="chaptersStore.chapters"
            size="small"
            empty-text="当前书还没有章节"
            :row-class-name="chapterRowClassName"
          >
            <el-table-column label="章节" width="88">
              <template #default="{ row }">
                第 {{ row.number }} 章
              </template>
            </el-table-column>
            <el-table-column label="标题" min-width="260" show-overflow-tooltip>
              <template #default="{ row }">
                {{ row.title || `第 ${row.number} 章` }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-tag size="small" :type="chapterStatusType(row)">
                  {{ chapterStatusText(row) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="更新时间" width="140">
              <template #default="{ row }">
                {{ formatDate(row.updatedAt || row.createdAt) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="180" align="right">
              <template #default="{ row }">
                <div class="row-actions">
                  <el-button link type="primary" @click.stop="openChapterEditor(row.number)">编辑</el-button>
                  <el-button link @click.stop="previewChapter(row.number)">预览</el-button>
                  <el-button link type="danger" @click.stop="removeChapter(row.number)">删除</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </section>

      <section class="glass-card workflow-card">
        <div class="card-head card-head-inline">
          <div>
            <h3>工作流监控</h3>
            <p>看当前进度、最近记录和失败原因。</p>
          </div>
          <div class="toolbar compact-toolbar">
            <el-button @click="refreshWorkflows">刷新工作流</el-button>
          </div>
        </div>

        <div class="card-body workflow-stack">
          <article class="status-banner" :class="`is-${activeWorkflowStatusClass}`">
            <strong>{{ activeWorkflowHeadline }}</strong>
            <span>{{ activeWorkflowMessage }}</span>
          </article>

          <el-table :data="recentWorkflows" size="small" empty-text="还没有工作流记录">
            <el-table-column label="任务" min-width="150" show-overflow-tooltip>
              <template #default="{ row }">
                <strong>{{ row.title || row.type || '未命名工作流' }}</strong>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="workflowTagType(row.status)">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="创建时间" width="132">
              <template #default="{ row }">
                {{ formatDate(row.createdAt) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="88" align="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="loadWorkflowDetail(row.id)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>

          <el-descriptions v-if="workflowDetail" :column="1" border size="small">
            <el-descriptions-item label="工作流 ID">{{ workflowDetail.id }}</el-descriptions-item>
            <el-descriptions-item label="类型">{{ workflowDetail.type }}</el-descriptions-item>
            <el-descriptions-item label="状态">{{ workflowDetail.status }}</el-descriptions-item>
            <el-descriptions-item label="信息">
              {{ workflowDetail.error || workflowDetail.progress?.message || '无' }}
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </section>
    </div>

    <el-dialog v-model="chapterDialogVisible" title="章节编辑" width="920px">
      <template v-if="editor.number">
        <div class="dialog-meta">
          <strong>第 {{ editor.number }} 章</strong>
          <span>{{ currentBookTitle }}</span>
        </div>

        <el-form label-position="top" class="dialog-form">
          <el-form-item label="章节标题">
            <el-input v-model="editor.title" placeholder="章节标题" />
          </el-form-item>
          <el-form-item label="章节正文">
            <el-input v-model="editor.content" type="textarea" :rows="24" resize="vertical" />
          </el-form-item>
        </el-form>
      </template>

      <template #footer>
        <div class="toolbar dialog-toolbar">
          <el-button @click="chapterDialogVisible = false">关闭</el-button>
          <el-button :disabled="!editor.number" @click="reloadEditor">重新读取</el-button>
          <el-button type="primary" :loading="savingChapter" :disabled="!editor.number" @click="saveChapter">
            保存章节
          </el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="previewDialogVisible" title="章节预览" width="880px">
      <template v-if="editor.number">
        <div class="dialog-meta">
          <strong>第 {{ editor.number }} 章</strong>
          <span>{{ editor.title }}</span>
        </div>
        <div class="preview-body">{{ editor.content }}</div>
      </template>
    </el-dialog>

    <el-dialog v-model="bookDialogVisible" title="新建书籍" width="560px">
      <el-form label-position="top" class="dialog-form">
        <el-form-item label="书名">
          <el-input v-model="bookDraft.title" placeholder="输入书名" />
        </el-form-item>
        <el-form-item label="类型">
          <el-input v-model="bookDraft.genre" placeholder="都市 / 科幻 / 玄幻" />
        </el-form-item>
        <el-form-item label="简介">
          <el-input v-model="bookDraft.description" type="textarea" :rows="4" placeholder="一句话说明题材和卖点" />
        </el-form-item>
        <div class="two-col">
          <el-form-item label="目标章节数">
            <el-input-number v-model="bookDraft.chapterCount" :min="1" :max="9999" class="full-width" />
          </el-form-item>
          <el-form-item label="每章字数">
            <el-select v-model="bookDraft.wordsPerChapter" class="full-width">
              <el-option v-for="size in chapterWordOptions" :key="size" :label="`${size} 字`" :value="size" />
            </el-select>
          </el-form-item>
        </div>
      </el-form>

      <template #footer>
        <div class="toolbar dialog-toolbar">
          <el-button @click="bookDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="bookCreating" @click="createBook">创建书籍</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="settingsDialogVisible" title="书籍设置" width="620px">
      <el-form label-position="top" class="dialog-form">
        <el-form-item label="书名">
          <el-input v-model="novelDraft.title" placeholder="当前书名" />
        </el-form-item>
        <el-form-item label="类型">
          <el-input v-model="novelDraft.genre" placeholder="都市 / 科幻 / 玄幻" />
        </el-form-item>
        <el-form-item label="简介">
          <el-input v-model="novelDraft.description" type="textarea" :rows="4" placeholder="一句话说清楚故事核心冲突" />
        </el-form-item>
        <div class="two-col">
          <el-form-item label="目标章节数">
            <el-input-number v-model="novelDraft.chapterCount" :min="1" :max="9999" class="full-width" />
          </el-form-item>
          <el-form-item label="每章字数">
            <el-select v-model="novelDraft.wordsPerChapter" class="full-width">
              <el-option v-for="size in chapterWordOptions" :key="size" :label="`${size} 字`" :value="size" />
            </el-select>
          </el-form-item>
        </div>
      </el-form>

      <template #footer>
        <div class="toolbar dialog-toolbar">
          <el-button @click="settingsDialogVisible = false">关闭</el-button>
          <el-button type="primary" :loading="savingNovel" @click="saveCurrentNovel">保存设置</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="batchDialogVisible" title="批量生成" width="420px">
      <div class="batch-dialog">
        <p>输入本次要连续生成的章节数。</p>
        <el-input-number v-model="workflowCount" :min="1" :max="20" class="full-width" />
      </div>

      <template #footer>
        <div class="toolbar dialog-toolbar">
          <el-button @click="batchDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="workflowStarting" @click="confirmBatchWorkflow">开始生成</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useBooksStore } from '../stores/books';
import { useChaptersStore } from '../stores/chapters';
import { useConfigStore } from '../stores/config';
import { useWorkflowStore } from '../stores/workflows';

const booksStore = useBooksStore();
const chaptersStore = useChaptersStore();
const configStore = useConfigStore();
const workflowStore = useWorkflowStore();

const chapterWordOptions = [2000, 3000, 4000, 5000, 6000];

const errorMessage = ref('');
const refreshing = ref(false);
const workflowStarting = ref(false);
const bookCreating = ref(false);
const savingNovel = ref(false);
const savingChapter = ref(false);
const workflowCount = ref(3);
const workflowDetail = ref(null);
const bookDialogVisible = ref(false);
const settingsDialogVisible = ref(false);
const batchDialogVisible = ref(false);
const chapterDialogVisible = ref(false);
const previewDialogVisible = ref(false);

const bookDraft = reactive({
  title: '',
  genre: '',
  description: '',
  chapterCount: 100,
  wordsPerChapter: 2000
});

const novelDraft = reactive({
  title: '',
  genre: '',
  description: '',
  chapterCount: 100,
  wordsPerChapter: 2000
});

const editor = reactive({
  number: null,
  title: '',
  content: ''
});

const novelStats = computed(() => booksStore.novelInfo?.stats || {});
const novelTarget = computed(() => booksStore.novelInfo?.targetChapters || novelDraft.chapterCount || 0);
const currentBookTitle = computed(() => booksStore.currentBook?.title || booksStore.novelInfo?.title || booksStore.currentBookKey || '未选择');
const recentWorkflows = computed(() => workflowStore.workflows.slice(0, 8));
const activeWorkflow = computed(() => workflowStore.activeWorkflow || recentWorkflows.value[0] || null);
const unpublishedCount = computed(() => Math.max(0, (novelStats.value.total || 0) - (novelStats.value.published || 0)));

const healthSummary = computed(() => {
  if (!configStore.health) return '待检查';
  if (configStore.health.mysqlAvailable && configStore.health.aiConfigured) return '服务正常';
  if (configStore.health.mysqlAvailable) return 'AI 待配置';
  return '需要检查';
});

const healthTagType = computed(() => {
  if (!configStore.health) return 'info';
  if (configStore.health.mysqlAvailable && configStore.health.aiConfigured) return 'success';
  return 'warning';
});

const activeWorkflowStatusText = computed(() => {
  if (!activeWorkflow.value) return '空闲';
  return activeWorkflow.value.status || '运行中';
});

const activeWorkflowHeadline = computed(() => {
  if (!activeWorkflow.value) return '当前没有正在跟踪的工作流';
  return activeWorkflow.value.title || '工作流运行中';
});

const activeWorkflowMessage = computed(() => {
  if (!activeWorkflow.value) return '可以直接启动下一章或批量生成。';
  return activeWorkflow.value.error || activeWorkflow.value.progress?.message || '工作流已创建';
});

const activeWorkflowShortMessage = computed(() => {
  if (!activeWorkflow.value) return '当前没有活动工作流';
  return activeWorkflow.value.title || activeWorkflow.value.type || '处理中';
});

const activeWorkflowStatusClass = computed(() => activeWorkflow.value?.status || 'idle');

function formatBookLabel(book) {
  return `${book.title || book.key} · ${book.type || '未分类'}`;
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('zh-CN');
}

function chapterStatusText(row) {
  return row.published ? '已发布' : '待处理';
}

function chapterStatusType(row) {
  return row.published ? 'success' : 'warning';
}

function chapterRowClassName({ row }) {
  return row.number === editor.number ? 'is-current-row' : '';
}

function workflowTagType(status) {
  if (status === 'succeeded') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'running' || status === 'pending') return 'warning';
  return 'info';
}

function syncNovelDraft() {
  const info = booksStore.novelInfo || {};
  novelDraft.title = info.title || booksStore.currentBook?.title || '';
  novelDraft.genre = info.type || '';
  novelDraft.description = info.description || '';
  novelDraft.chapterCount = info.targetChapters || 100;
  novelDraft.wordsPerChapter = info.wordsPerChapter || 2000;
}

function resetBookDraft() {
  bookDraft.title = '';
  bookDraft.genre = '';
  bookDraft.description = '';
  bookDraft.chapterCount = 100;
  bookDraft.wordsPerChapter = 2000;
}

function openBookSettings() {
  syncNovelDraft();
  settingsDialogVisible.value = true;
}

async function refreshBooks() {
  await booksStore.fetchBooks();
  if (!booksStore.currentBookKey && booksStore.books.length > 0) {
    booksStore.persistCurrentBook(booksStore.books[0].key);
  }
}

async function refreshWorkflows() {
  await workflowStore.fetchWorkflows(booksStore.currentBookKey);
}

async function refreshChapters() {
  await chaptersStore.fetchChapters(booksStore.currentBookKey);
}

async function refreshWorkspace() {
  refreshing.value = true;
  try {
    errorMessage.value = '';
    await configStore.fetchConfig();
    await configStore.fetchHealth();
    await refreshBooks();
    await booksStore.fetchNovelInfo(booksStore.currentBookKey);
    syncNovelDraft();
    chaptersStore.loadActiveChapterFromStorage(booksStore.currentBookKey);
    workflowStore.loadActiveWorkflowFromStorage(booksStore.currentBookKey);
    await refreshWorkflows();
    await refreshChapters();
  } catch (error) {
    errorMessage.value = error.message || '刷新工作台失败';
  } finally {
    refreshing.value = false;
  }
}

async function switchBook(bookKey) {
  if (!bookKey) return;

  try {
    errorMessage.value = '';
    await booksStore.selectBook(bookKey);
    booksStore.persistCurrentBook(bookKey);
    workflowDetail.value = null;
    editor.number = null;
    editor.title = '';
    editor.content = '';
    chaptersStore.loadActiveChapterFromStorage(bookKey);
    workflowStore.loadActiveWorkflowFromStorage(bookKey);
    await booksStore.fetchNovelInfo(bookKey);
    syncNovelDraft();
    await refreshWorkflows();
    await refreshChapters();
  } catch (error) {
    errorMessage.value = error.message || '切换书籍失败';
    ElMessage.error(errorMessage.value);
  }
}

async function createBook() {
  if (!bookDraft.title) {
    ElMessage.warning('请先填写书名');
    return;
  }

  bookCreating.value = true;
  try {
    const response = await booksStore.createBook({
      title: bookDraft.title,
      genre: bookDraft.genre,
      novelType: bookDraft.genre,
      description: bookDraft.description,
      chapterCount: bookDraft.chapterCount,
      wordsPerChapter: bookDraft.wordsPerChapter
    });
    const createdBookKey = response?.book?.key;
    if (createdBookKey) {
      await booksStore.selectBook(createdBookKey);
      booksStore.persistCurrentBook(createdBookKey);
    }
    ElMessage.success('书籍创建成功');
    bookDialogVisible.value = false;
    resetBookDraft();
    await refreshWorkspace();
  } catch (error) {
    errorMessage.value = error.message || '创建书籍失败';
    ElMessage.error(errorMessage.value);
  } finally {
    bookCreating.value = false;
  }
}

async function saveCurrentNovel() {
  if (!booksStore.currentBookKey) {
    ElMessage.warning('请先选择书籍');
    return;
  }

  savingNovel.value = true;
  try {
    await booksStore.saveNovelInfo({
      title: novelDraft.title,
      type: novelDraft.genre,
      novelType: novelDraft.genre,
      genre: novelDraft.genre,
      description: novelDraft.description,
      chapterCount: novelDraft.chapterCount,
      wordsPerChapter: novelDraft.wordsPerChapter
    });
    await booksStore.fetchNovelInfo(booksStore.currentBookKey);
    syncNovelDraft();
    settingsDialogVisible.value = false;
    ElMessage.success('书籍设置已保存');
  } catch (error) {
    errorMessage.value = error.message || '保存书籍设置失败';
    ElMessage.error(errorMessage.value);
  } finally {
    savingNovel.value = false;
  }
}

async function removeCurrentBook() {
  if (!booksStore.currentBook) return;
  await removeBook(booksStore.currentBook);
}

async function removeBook(book) {
  try {
    await ElMessageBox.confirm(`确认删除《${book.title || book.key}》吗？`, '删除书籍', { type: 'warning' });
    await booksStore.deleteBook(book.key);
    ElMessage.success('书籍已删除');
    await refreshWorkspace();
  } catch (error) {
    if (error !== 'cancel') {
      errorMessage.value = error.message || '删除书籍失败';
      ElMessage.error(errorMessage.value);
    }
  }
}

async function loadWorkflowDetail(id) {
  workflowDetail.value = await workflowStore.fetchWorkflow(id);
}

async function startNextChapterWorkflow() {
  await startGeneration(1);
}

async function confirmBatchWorkflow() {
  batchDialogVisible.value = false;
  await startGeneration(workflowCount.value);
}

async function startGeneration(count) {
  if (!booksStore.currentBookKey) {
    ElMessage.warning('请先选择书籍');
    return;
  }

  workflowStarting.value = true;
  try {
    const workflow = await workflowStore.startGeneration(booksStore.currentBookKey, count);
    workflowDetail.value = workflow;
    ElMessage.success('工作流已启动');
    workflowStore.startPolling(booksStore.currentBookKey, handleWorkflowTick);
    await refreshWorkflows();
  } catch (error) {
    errorMessage.value = error.message || '启动工作流失败';
    ElMessage.error(errorMessage.value);
  } finally {
    workflowStarting.value = false;
  }
}

async function handleWorkflowTick(workflow, error) {
  if (error) {
    errorMessage.value = error.message || '轮询工作流失败';
    return;
  }

  if (!workflow) return;

  workflowDetail.value = workflow;
  if (!['succeeded', 'failed'].includes(workflow.status)) return;

  workflowStore.setActiveWorkflowId(booksStore.currentBookKey, '');
  await refreshChapters();
  await refreshWorkflows();
}

async function openChapter(number) {
  try {
    const chapter = await chaptersStore.fetchChapter(number, booksStore.currentBookKey);
    editor.number = chapter.number ?? number;
    editor.title = chapter.title || '';
    editor.content = chapter.content || '';
    chaptersStore.persistActiveChapter(booksStore.currentBookKey);
  } catch (error) {
    errorMessage.value = error.message || '读取章节失败';
    ElMessage.error(errorMessage.value);
  }
}

async function openChapterEditor(number) {
  await openChapter(number);
  chapterDialogVisible.value = true;
}

async function previewChapter(number) {
  await openChapter(number);
  previewDialogVisible.value = true;
}

async function reloadEditor() {
  if (editor.number) {
    await openChapter(editor.number);
  }
}

async function saveChapter() {
  if (!editor.number) return;

  savingChapter.value = true;
  try {
    await chaptersStore.saveChapter(editor.number, {
      title: editor.title,
      content: editor.content,
      outline: ''
    }, booksStore.currentBookKey);
    ElMessage.success('章节已保存');
    chapterDialogVisible.value = false;
    await refreshChapters();
  } catch (error) {
    errorMessage.value = error.message || '保存章节失败';
    ElMessage.error(errorMessage.value);
  } finally {
    savingChapter.value = false;
  }
}

async function removeChapter(number) {
  if (!number) return;

  try {
    await ElMessageBox.confirm(`确认删除第 ${number} 章吗？`, '删除章节', { type: 'warning' });
    await chaptersStore.deleteChapter(number, booksStore.currentBookKey);
    if (editor.number === number) {
      editor.number = null;
      editor.title = '';
      editor.content = '';
    }
    ElMessage.success('章节已删除');
    await refreshChapters();
  } catch (error) {
    if (error !== 'cancel') {
      errorMessage.value = error.message || '删除章节失败';
      ElMessage.error(errorMessage.value);
    }
  }
}

async function resetCurrentBook() {
  try {
    await ElMessageBox.confirm('确认清空当前书的章节和大纲吗？', '重置当前书', { type: 'warning' });
    await chaptersStore.resetBook(booksStore.currentBookKey);
    editor.number = null;
    editor.title = '';
    editor.content = '';
    ElMessage.success('当前书已重置');
    await refreshChapters();
  } catch (error) {
    if (error !== 'cancel') {
      errorMessage.value = error.message || '重置当前书失败';
      ElMessage.error(errorMessage.value);
    }
  }
}

async function repairData() {
  try {
    const data = await chaptersStore.repairData(booksStore.currentBookKey);
    ElMessage.success(`修复完成，共处理 ${data.repaired || 0} 章`);
    await refreshChapters();
  } catch (error) {
    errorMessage.value = error.message || '修复数据失败';
    ElMessage.error(errorMessage.value);
  }
}

async function publishChapters() {
  try {
    const data = await chaptersStore.publishChapters(booksStore.currentBookKey);
    ElMessage.success(`发布完成：成功 ${data.count || 0} 章，失败 ${data.failed || 0} 章`);
    await refreshChapters();
  } catch (error) {
    errorMessage.value = error.message || '发布失败';
    ElMessage.error(errorMessage.value);
  }
}

onMounted(() => {
  resetBookDraft();
  refreshWorkspace();
});

onBeforeUnmount(() => workflowStore.stopPolling());
</script>

<style scoped>
.ops-page {
  display: grid;
  gap: 18px;
}

.ops-header {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 22px 24px;
  border-radius: 24px;
  background: linear-gradient(145deg, rgba(17, 24, 39, 0.95), rgba(14, 116, 144, 0.88));
  color: #fff;
  box-shadow: 0 24px 52px rgba(15, 23, 42, 0.22);
}

.eyebrow {
  display: inline-block;
  margin-bottom: 10px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ops-header h2 {
  margin: 0 0 10px;
  font-size: clamp(28px, 4vw, 38px);
  line-height: 1.08;
}

.ops-header p {
  margin: 0;
  max-width: 720px;
  line-height: 1.7;
  opacity: 0.94;
}

.header-status {
  display: grid;
  justify-items: end;
  align-content: start;
  gap: 10px;
}

.header-status span {
  opacity: 0.84;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
}

.kpi-card {
  padding: 16px 18px;
  border-radius: 20px;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  box-shadow: var(--panel-shadow);
}

.kpi-card span {
  display: block;
  font-size: 12px;
  color: var(--text-sub);
}

.kpi-card strong {
  display: block;
  margin-top: 8px;
  font-size: 22px;
  line-height: 1.2;
}

.kpi-card small {
  display: block;
  margin-top: 6px;
  color: var(--text-sub);
}

.glass-card {
  border-radius: 22px;
  border: 1px solid var(--panel-border);
  background: var(--panel);
  box-shadow: var(--panel-shadow);
  backdrop-filter: blur(18px);
}

.command-card {
  padding: 18px 20px;
}

.command-grid {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}

.book-selector {
  width: min(360px, 100%);
}

.command-actions,
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.main-grid,
.bottom-grid {
  display: grid;
  gap: 18px;
}

.main-grid {
  grid-template-columns: minmax(0, 1.2fr) minmax(360px, 0.8fr);
  align-items: start;
}

.bottom-grid {
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
  align-items: start;
}

.card-head {
  padding: 18px 20px 0;
}

.card-head h3 {
  margin: 0;
  font-size: 18px;
}

.card-head p {
  margin: 8px 0 0;
  color: var(--text-sub);
  font-size: 13px;
  line-height: 1.6;
}

.card-head-inline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.card-body {
  padding: 18px 20px 20px;
}

.table-meta {
  color: var(--text-sub);
  font-size: 13px;
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.workflow-stack,
.dialog-form {
  display: grid;
  gap: 16px;
}

.status-banner {
  display: grid;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.04);
}

.status-banner strong {
  font-size: 16px;
}

.status-banner span {
  color: var(--text-sub);
  font-size: 13px;
}

.status-banner.is-succeeded {
  background: rgba(22, 163, 74, 0.1);
}

.status-banner.is-warning,
.status-banner.is-failed {
  background: rgba(217, 119, 6, 0.12);
}

.tool-list {
  display: grid;
  gap: 12px;
}

.tool-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.04);
}

.tool-item strong {
  display: block;
  margin-bottom: 4px;
}

.tool-item p {
  margin: 0;
  color: var(--text-sub);
  font-size: 13px;
  line-height: 1.5;
}

.danger-item {
  background: rgba(220, 38, 38, 0.06);
}

.dialog-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.dialog-meta span {
  color: var(--text-sub);
}

.preview-body {
  max-height: 60vh;
  overflow: auto;
  padding: 16px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.04);
  white-space: pre-wrap;
  line-height: 1.8;
}

.two-col {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.full-width {
  width: 100%;
}

.dialog-toolbar {
  justify-content: flex-end;
}

.batch-dialog p {
  margin: 0 0 16px;
  color: var(--text-sub);
}

@media (max-width: 1360px) {
  .kpi-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .main-grid,
  .bottom-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1100px) {
  .ops-header,
  .command-grid,
  .card-head-inline,
  .tool-item {
    flex-direction: column;
    align-items: stretch;
  }

  .book-selector {
    width: 100%;
  }

  .header-status,
  .dialog-toolbar {
    justify-items: start;
  }
}

@media (max-width: 900px) {
  .kpi-grid,
  .two-col {
    grid-template-columns: 1fr;
  }
}
</style>

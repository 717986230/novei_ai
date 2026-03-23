<template>
  <div class="page-frame config-page">
    <section class="config-header">
      <div>
        <div class="eyebrow">Config</div>
        <h2>配置先收紧，入口再放开</h2>
        <p>主页面只看摘要和表格。具体平台配置放到弹窗里处理，避免一页塞满七套表单。</p>
      </div>

      <div class="header-stats">
        <div class="stat-chip">
          <span>后端</span>
          <strong>{{ backendStatusText }}</strong>
        </div>
        <div class="stat-chip">
          <span>AI</span>
          <strong>{{ aiStatusText }}</strong>
        </div>
        <div class="stat-chip">
          <span>平台</span>
          <strong>{{ platformSummary }}</strong>
        </div>
      </div>
    </section>

    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
    />

    <div v-if="isBootstrapping" class="loading-grid">
      <section class="glass-card">
        <div class="card-head">
          <h3>正在读取配置</h3>
          <p>稍等，正在同步后端配置和健康状态。</p>
        </div>
        <div class="card-body">
          <el-skeleton :rows="6" animated />
        </div>
      </section>

      <section class="glass-card">
        <div class="card-head">
          <h3>正在读取平台接入</h3>
          <p>完成后会显示各平台的登录方式和凭证状态。</p>
        </div>
        <div class="card-body">
          <el-skeleton :rows="6" animated />
        </div>
      </section>
    </div>

    <template v-else>
      <div class="top-grid">
        <section class="glass-card">
          <div class="card-head">
            <h3>AI 连接</h3>
            <p>只保留会影响生成链路的字段。</p>
          </div>

          <div class="card-body">
            <el-form :model="draft" label-position="top" class="form-grid">
              <div class="two-col">
                <el-form-item label="Provider">
                  <el-input v-model="draft.provider" placeholder="custom / openai-compatible / nvidia" />
                </el-form-item>
                <el-form-item label="Model">
                  <el-input v-model="draft.model" placeholder="minimaxai/minimax-m2.5" />
                </el-form-item>
              </div>

              <el-form-item label="API URL">
                <el-input
                  v-model="draft.apiUrl"
                  placeholder="https://integrate.api.nvidia.com/v1/chat/completions"
                />
              </el-form-item>

              <div class="two-col">
                <el-form-item label="API Key">
                  <el-input
                    v-model="draft.apiKey"
                    type="password"
                    show-password
                    placeholder="输入 API Key"
                  />
                </el-form-item>
                <el-form-item label="Proxy URL">
                  <el-input v-model="draft.proxyUrl" placeholder="没有代理就留空" />
                </el-form-item>
              </div>

              <div class="two-col compact-two-col">
                <el-form-item label="Timeout (ms)">
                  <el-input-number v-model="draft.timeoutMs" :min="1000" :step="1000" class="full-width" />
                </el-form-item>
                <el-form-item label="Retry Count">
                  <el-input-number v-model="draft.retryCount" :min="0" :max="10" class="full-width" />
                </el-form-item>
              </div>

              <div class="toolbar">
                <el-button type="primary" :loading="configStore.saving" @click="saveConfig">
                  保存配置
                </el-button>
                <el-button :loading="configStore.testing" @click="testConnection">测试连接</el-button>
                <el-button plain :loading="configStore.loading" @click="loadAll">重新加载</el-button>
                <el-button text @click="resetDraft">恢复当前值</el-button>
              </div>
            </el-form>
          </div>
        </section>

        <section class="glass-card">
          <div class="card-head">
            <h3>运行快照</h3>
            <p>只看当前是否可用。</p>
          </div>

          <div class="card-body summary-stack">
            <article class="status-banner" :class="`is-${healthPanelState}`">
              <strong>{{ backendStatusText }}</strong>
              <span>{{ healthHint }}</span>
            </article>

            <div class="summary-list">
              <div class="summary-item">
                <span>MySQL</span>
                <strong>{{ mysqlStatusText }}</strong>
              </div>
              <div class="summary-item">
                <span>模型</span>
                <strong>{{ modelSummary }}</strong>
              </div>
              <div class="summary-item">
                <span>当前书籍</span>
                <strong>{{ currentBookSummary }}</strong>
              </div>
              <div class="summary-item">
                <span>章节设置</span>
                <strong>{{ chapterSummary }}</strong>
              </div>
            </div>

            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="健康检查">
                <el-tag :type="healthAvailabilityTag">{{ healthAvailabilityText }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="AI 已配置">
                {{ healthText(configStore.health?.aiConfigured) }}
              </el-descriptions-item>
              <el-descriptions-item label="MySQL 已启用">
                {{ healthText(configStore.health?.mysqlEnabled) }}
              </el-descriptions-item>
              <el-descriptions-item label="MySQL 可用">
                {{ healthText(configStore.health?.mysqlAvailable) }}
              </el-descriptions-item>
              <el-descriptions-item label="服务时间">
                {{ formatDateTime(configStore.health?.serverTime) }}
              </el-descriptions-item>
            </el-descriptions>
          </div>
        </section>
      </div>

      <section class="glass-card">
        <div class="card-head card-head-inline">
          <div>
            <h3>平台接入</h3>
            <p>表格只展示状态。点“配置”再弹窗编辑详情。</p>
          </div>
          <div class="toolbar compact-toolbar">
            <el-button type="primary" :loading="configStore.saving" @click="saveConfig">
              保存全部
            </el-button>
            <el-button plain @click="resetDraft">重置平台配置</el-button>
          </div>
        </div>

        <div class="card-body platform-body">
          <el-alert
            title="接入原则"
            description="支持官方授权登录的平台优先走官网授权。Cookie 和账号密码只作为兼容录入方式，不在这里承诺私有 API 逆向。"
            type="info"
            show-icon
            :closable="false"
          />

          <el-table :data="platformRows" stripe class="platform-table">
            <el-table-column prop="label" label="平台" min-width="140" />
            <el-table-column label="启用" width="90">
              <template #default="{ row }">
                <el-tag :type="row.enabled ? 'success' : 'info'">
                  {{ row.enabled ? '已启用' : '未启用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="登录方式" min-width="120">
              <template #default="{ row }">
                <el-tag :type="loginModeTag(row.loginMode)">
                  {{ loginModeLabel(row.loginMode) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="凭证状态" min-width="150">
              <template #default="{ row }">
                <span>{{ row.credentialStatus }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="description" label="说明" min-width="220" show-overflow-tooltip />
            <el-table-column label="操作" width="220" fixed="right">
              <template #default="{ row }">
                <div class="row-actions">
                  <el-button size="small" type="primary" plain @click="openPlatformDialog(row.key)">
                    配置
                  </el-button>
                  <el-button
                    v-if="row.officialUrl"
                    size="small"
                    plain
                    @click="openOfficialSite(row)"
                  >
                    打开官网
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </section>

      <el-dialog
        v-model="platformDialogVisible"
        :title="dialogTitle"
        width="720px"
        destroy-on-close
      >
        <template v-if="currentPlatformMeta">
          <div class="dialog-intro">
            <p>{{ currentPlatformMeta.description }}</p>
            <el-tag :type="loginModeTag(currentPlatform.loginMode)">
              {{ loginModeLabel(currentPlatform.loginMode) }}
            </el-tag>
          </div>

          <el-alert
            v-if="currentPlatformMeta?.officialUrl"
            title="官方登录和浏览器导入是两步"
            description="点击“打开官网登录页并自动回填”后，系统会自动等待你完成登录并在浏览器关闭后回填 Cookie。手动“导入本机浏览器登录态”仍然保留作兜底。"
            type="info"
            show-icon
            :closable="false"
          />

          <el-alert
            v-if="officialAuthPolling"
            title="正在等待官网登录完成"
            description="官网登录页已打开。完成登录后请关闭 Chrome 或 Edge，系统会自动导入登录态并写入当前平台配置。"
            type="success"
            show-icon
            :closable="false"
          />

          <el-form label-position="top" class="form-grid">
            <div class="dialog-switch-row">
              <span>启用这个平台</span>
              <el-switch v-model="currentPlatform.enabled" />
            </div>

            <el-form-item label="登录方式">
              <el-select v-model="currentPlatform.loginMode" class="full-width">
                <el-option
                  v-for="option in LOGIN_MODE_OPTIONS"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
            </el-form-item>

            <div v-if="currentPlatform.loginMode === 'account'" class="two-col">
              <el-form-item label="账号">
                <el-input
                  v-model="currentPlatform.username"
                  autocomplete="off"
                  placeholder="手机号 / 邮箱 / 平台账号"
                />
              </el-form-item>

              <el-form-item label="密码">
                <el-input
                  v-model="currentPlatform.password"
                  type="password"
                  show-password
                  autocomplete="new-password"
                  placeholder="留空表示保持不变"
                />
              </el-form-item>
            </div>

            <el-form-item v-if="currentPlatform.loginMode === 'cookies'" label="Cookie">
              <el-input
                v-model="currentPlatform.cookies"
                type="textarea"
                :rows="5"
                placeholder="粘贴完整 Cookie；如果已经保存过，留空表示保持不变"
              />
            </el-form-item>

            <el-alert
              v-if="currentPlatform.loginMode === 'oauth'"
              title="当前是官网授权模式"
              description="不需要手填账号密码或 Cookie。直接走官网登录，或者导入本机浏览器登录态。"
              type="success"
              show-icon
              :closable="false"
            />

            <el-form-item label="备注">
              <el-input
                v-model="currentPlatform.notes"
                type="textarea"
                :rows="3"
                placeholder="记录授权入口、后台地址或人工操作注意事项"
              />
            </el-form-item>

            <div class="dialog-note-row">
              <span>{{ loginModeHint(currentPlatform.loginMode) }}</span>
              <span>{{ currentPlatformSecretHint }}</span>
            </div>
          </el-form>
        </template>

        <template #footer>
          <div class="toolbar dialog-toolbar">
            <el-button
              :loading="importingBrowserSession"
              :disabled="!currentPlatformMeta"
              @click="importFromBrowser"
            >
              导入本机浏览器登录态
            </el-button>
            <el-button
              type="primary"
              :loading="configStore.saving"
              :disabled="!currentPlatformMeta"
              @click="savePlatformConfig"
            >
              保存平台配置
            </el-button>
            <el-button
              v-if="currentPlatformMeta?.officialUrl"
              :loading="officialAuthStarting || officialAuthPolling"
              plain
              @click="openOfficialSite(currentPlatformMeta)"
            >
              打开官网登录页并自动回填
            </el-button>
            <el-button @click="platformDialogVisible = false">关闭</el-button>
          </div>
        </template>
      </el-dialog>
    </template>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useConfigStore } from '../stores/config';
import { request } from '../api/http';

const MASK = '********';

const PLATFORM_META = [
  { key: 'fanqie', label: '番茄小说', officialUrl: 'https://fanqienovel.com', description: '字节系平台，优先用官网授权或浏览器登录。' },
  { key: 'qidian', label: '起点中文网', officialUrl: 'https://www.qidian.com', description: '优先官网登录，不在前端承诺私有接口接入。' },
  { key: 'qimao', label: '七猫小说', officialUrl: 'https://www.qimao.com', description: '优先官方入口，Cookie 仅作兼容录入。' },
  { key: 'douyin', label: '抖音小说', officialUrl: 'https://www.douyin.com', description: '优先平台官方账号体系，必要时再补 Cookie。' },
  { key: 'zongheng', label: '纵横中文网', officialUrl: 'https://www.zongheng.com', description: '先完成官网登录，再回到这里保存配置。' },
  { key: '17k', label: '17K 小说网', officialUrl: 'https://www.17k.com', description: '可录入账号密码或 Cookie，仍优先官网入口。' },
  { key: 'custom', label: '其他平台', officialUrl: '', description: '保留给没有内置配置的平台。' }
];

const LOGIN_MODE_OPTIONS = [
  { label: '官方授权', value: 'oauth' },
  { label: 'Cookie', value: 'cookies' },
  { label: '账号密码', value: 'account' }
];

const LOGIN_MODE_LABELS = {
  oauth: '官方授权',
  cookies: 'Cookie',
  account: '账号密码'
};

const LOGIN_MODE_TIPS = {
  oauth: '先走官网授权，后续接浏览器授权流。',
  cookies: '适合已经登录的平台后台，直接录入 Cookie。',
  account: '适合只能账号密码登录的平台。'
};

const configStore = useConfigStore();
const errorMessage = ref('');
const isBootstrapping = ref(true);
const platformDialogVisible = ref(false);
const activePlatformKey = ref('');
const importingBrowserSession = ref(false);
const officialAuthStarting = ref(false);
const officialAuthPolling = ref(false);
const officialAuthTaskId = ref('');
let officialAuthPollTimer = null;

const draft = reactive({
  provider: '',
  apiUrl: '',
  apiKey: '',
  model: '',
  proxyUrl: '',
  timeoutMs: 120000,
  retryCount: 1
});

const platformDrafts = reactive(
  Object.fromEntries(PLATFORM_META.map((meta) => [meta.key, createPlatformDraft()]))
);

function createPlatformDraft() {
  return {
    enabled: false,
    loginMode: 'oauth',
    username: '',
    password: '',
    cookies: '',
    notes: '',
    hasPassword: false,
    hasCookies: false
  };
}

function normalizeLoginMode(value, source) {
  if (['oauth', 'cookies', 'account'].includes(value)) {
    return value;
  }
  if (source?.cookies && String(source.cookies).trim()) {
    return 'cookies';
  }
  if ((source?.username && String(source.username).trim()) || (source?.password && String(source.password).trim())) {
    return 'account';
  }
  return 'oauth';
}

function applyPlatformConfig(meta, raw) {
  const target = platformDrafts[meta.key];
  const source = raw && typeof raw === 'object' ? raw : {};
  const maskedPassword = source.password === MASK;
  const maskedCookies = source.cookies === MASK;

  target.enabled = Boolean(source.enabled);
  target.loginMode = normalizeLoginMode(source.loginMode || source.authMode || source.mode, source);
  target.username = source.username || '';
  target.password = maskedPassword ? '' : source.password || '';
  target.cookies = maskedCookies ? '' : source.cookies || '';
  target.notes = source.notes || '';
  target.hasPassword = Boolean(source.hasPassword || maskedPassword || target.password);
  target.hasCookies = Boolean(source.hasCookies || maskedCookies || target.cookies);
}

function applyConfig(data = {}) {
  const ai = data.ai || {};
  draft.provider = ai.provider || 'custom';
  draft.apiUrl = ai.apiUrl || ai.baseUrl || '';
  draft.apiKey = ai.apiKey || '';
  draft.model = ai.model || '';
  draft.proxyUrl = ai.proxyUrl || '';
  draft.timeoutMs = ai.timeoutMs || 120000;
  draft.retryCount = ai.retryCount ?? 1;

  PLATFORM_META.forEach((meta) => {
    applyPlatformConfig(meta, data.platforms?.[meta.key]);
  });
}

function buildPlatformPayload() {
  return PLATFORM_META.reduce((acc, meta) => {
    const item = platformDrafts[meta.key];
    acc[meta.key] = {
      enabled: Boolean(item.enabled),
      loginMode: item.loginMode,
      username: item.username.trim(),
      password: resolveSecretValue(item.password, item.hasPassword),
      cookies: resolveSecretValue(item.cookies, item.hasCookies),
      notes: item.notes.trim(),
      label: meta.label
    };
    return acc;
  }, {});
}

function resolveSecretValue(value, hasStoredSecret) {
  const trimmed = (value || '').trim();
  if (!trimmed && hasStoredSecret) {
    return MASK;
  }
  return trimmed;
}

function platformHasSecret(key) {
  const item = platformDrafts[key];
  return Boolean(item?.hasPassword || item?.hasCookies || item?.password || item?.cookies);
}

function platformCredentialStatus(key) {
  const item = platformDrafts[key];
  if (!item.enabled) {
    return '未启用';
  }
  if (item.loginMode === 'oauth') {
    return item.hasCookies ? '授权已保存' : '待官网授权';
  }
  if (item.loginMode === 'cookies') {
    return (item.cookies || '').trim() || item.hasCookies ? 'Cookie 已保存' : '缺 Cookie';
  }
  const hasUsername = Boolean((item.username || '').trim());
  const hasPassword = Boolean((item.password || '').trim() || item.hasPassword);
  if (hasUsername && hasPassword) {
    return '账号密码已保存';
  }
  if (hasUsername) {
    return '缺密码';
  }
  if (hasPassword) {
    return '缺账号';
  }
  return '缺账号或密码';
}

function loginModeLabel(mode) {
  return LOGIN_MODE_LABELS[mode] || '未设置';
}

function loginModeTag(mode) {
  if (mode === 'oauth') return 'success';
  if (mode === 'cookies') return 'warning';
  return 'info';
}

function loginModeHint(mode) {
  return LOGIN_MODE_TIPS[mode] || LOGIN_MODE_TIPS.oauth;
}

async function openOfficialSite(meta) {
  if (!meta?.officialUrl) {
    ElMessage.info('这个平台没有预设官网地址');
    return;
  }

  officialAuthStarting.value = true;
  errorMessage.value = '';

  try {
    stopOfficialAuthPolling();
    const data = await request('post', '/platforms/official-auth/start', {
      platform: meta.key,
      browser: 'chrome'
    });

    if (!data?.success || !data?.taskId) {
      throw new Error(data?.error || '官网授权监听启动失败');
    }

    officialAuthTaskId.value = data.taskId;
    officialAuthPolling.value = true;
    window.open(meta.officialUrl, '_blank', 'noopener,noreferrer');
    ElMessage.info('官网登录页已打开。完成登录后关闭 Chrome 或 Edge，系统会自动回填。');
    startOfficialAuthPolling(meta.key);
  } catch (error) {
    errorMessage.value = error.message || '官网授权启动失败';
    ElMessage.error(errorMessage.value);
  } finally {
    officialAuthStarting.value = false;
  }
}

function openPlatformDialog(key) {
  activePlatformKey.value = key;
  platformDialogVisible.value = true;
}

async function importFromBrowser() {
  if (!activePlatformKey.value) {
    return;
  }

  importingBrowserSession.value = true;
  try {
    errorMessage.value = '';
    const data = await request('post', '/platforms/import-browser-session', {
      platform: activePlatformKey.value,
      browser: 'chrome'
    });

    if (!data?.success || !data?.cookies) {
      throw new Error(data?.error || '浏览器导入失败');
    }

    const target = platformDrafts[activePlatformKey.value];
    target.enabled = true;
    target.loginMode = 'cookies';
    target.cookies = data.cookies;
    target.hasCookies = true;

    ElMessage.success(data.message || '已从浏览器导入登录信息');
  } catch (error) {
    const rawMessage = error.message || '浏览器导入失败';
    if (/not found/i.test(rawMessage)) {
      errorMessage.value = '浏览器导入接口不存在，请先重启后端服务后再试。';
    } else if (/无法占用当前浏览器配置文件/.test(rawMessage)) {
      errorMessage.value = '请先关闭 Chrome 或 Edge，再点击“从浏览器导入”。';
    } else {
      errorMessage.value = rawMessage;
    }
    ElMessage.error(errorMessage.value);
  } finally {
    importingBrowserSession.value = false;
  }
}

function applyImportedCookies(platformKey, data) {
  const target = platformDrafts[platformKey];
  if (!target) {
    return;
  }

  target.enabled = true;
  target.loginMode = 'cookies';
  target.cookies = data.cookies || '';
  target.hasCookies = true;
}

function stopOfficialAuthPolling() {
  if (officialAuthPollTimer) {
    clearInterval(officialAuthPollTimer);
    officialAuthPollTimer = null;
  }
  officialAuthPolling.value = false;
  officialAuthTaskId.value = '';
}

function startOfficialAuthPolling(platformKey) {
  officialAuthPolling.value = true;

  officialAuthPollTimer = window.setInterval(async () => {
    try {
      if (!officialAuthTaskId.value) {
        stopOfficialAuthPolling();
        return;
      }

      const data = await request('get', `/platforms/official-auth/status?taskId=${encodeURIComponent(officialAuthTaskId.value)}`);
      if (data?.status === 'pending') {
        return;
      }

      stopOfficialAuthPolling();

      if (data?.status === 'success' && data?.cookies) {
        applyImportedCookies(platformKey, data);
        await loadAll();
        ElMessage.success(data.message || '官网登录态已自动回填');
        return;
      }

      errorMessage.value = data?.error || data?.message || '官网登录态自动回填失败';
      ElMessage.error(errorMessage.value);
    } catch (error) {
      stopOfficialAuthPolling();
      errorMessage.value = error.message || '官网登录态轮询失败';
      ElMessage.error(errorMessage.value);
    }
  }, 3000);
}

async function loadAll() {
  errorMessage.value = '';
  isBootstrapping.value = true;
  try {
    await configStore.fetchConfig();
    await configStore.fetchHealth();
    applyConfig(configStore.data || {});
  } catch (error) {
    errorMessage.value = error.message || '加载配置失败';
  } finally {
    isBootstrapping.value = false;
  }
}

async function saveConfig() {
  try {
    errorMessage.value = '';
    await configStore.saveConfig({
      ...draft,
      platforms: buildPlatformPayload()
    });
    ElMessage.success('配置已保存');
    await loadAll();
    return true;
  } catch (error) {
    errorMessage.value = error.message || '保存配置失败';
    ElMessage.error(errorMessage.value);
    return false;
  }
}

async function savePlatformConfig() {
  const success = await saveConfig();
  if (success) {
    platformDialogVisible.value = false;
  }
}

async function testConnection() {
  try {
    errorMessage.value = '';
    await configStore.testConnection({ ...draft });
    ElMessage.success('连接测试完成');
  } catch (error) {
    errorMessage.value = error.message || '连接测试失败';
    ElMessage.error(errorMessage.value);
  }
}

function resetDraft() {
  applyConfig(configStore.data || {});
  ElMessage.info('已恢复当前配置');
}

function formatDateTime(value) {
  if (!value) return isBootstrapping.value ? '加载中' : '未返回';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}

function healthText(value) {
  if (isBootstrapping.value && configStore.health === null) return '加载中';
  return value ? '是' : '否';
}

const platformRows = computed(() =>
  PLATFORM_META.map((meta) => ({
    key: meta.key,
    label: meta.label,
    officialUrl: meta.officialUrl,
    description: meta.description,
    enabled: platformDrafts[meta.key].enabled,
    loginMode: platformDrafts[meta.key].loginMode,
    credentialStatus: platformCredentialStatus(meta.key)
  }))
);

const currentPlatformMeta = computed(() =>
  PLATFORM_META.find((item) => item.key === activePlatformKey.value) || null
);

const currentPlatform = computed(() =>
  activePlatformKey.value ? platformDrafts[activePlatformKey.value] : createPlatformDraft()
);

const dialogTitle = computed(() =>
  currentPlatformMeta.value ? `配置 ${currentPlatformMeta.value.label}` : '平台配置'
);

const currentPlatformSecretHint = computed(() => {
  if (!activePlatformKey.value) return '';
  const item = platformDrafts[activePlatformKey.value];
  if (!item) {
    return '';
  }
  if (item.loginMode === 'cookies') {
    return item.hasCookies || (item.cookies || '').trim()
      ? 'Cookie 已保存，留空不会覆盖旧值。'
      : '当前还没有保存 Cookie。';
  }
  if (item.loginMode === 'account') {
    const hasUsername = Boolean((item.username || '').trim());
    const hasPassword = Boolean((item.password || '').trim() || item.hasPassword);
    if (hasUsername && hasPassword) {
      return '账号密码已保存，留空不会覆盖旧值。';
    }
    if (hasUsername) {
      return '账号已填，密码还没保存。';
    }
    if (hasPassword) {
      return '密码已保存，账号还没填。';
    }
    return '当前还没有保存账号密码。';
  }
  return platformHasSecret(activePlatformKey.value)
    ? '已保存授权信息。'
    : '当前还没有可用授权信息。';
});

const backendStatusText = computed(() => {
  if (isBootstrapping.value && configStore.health === null) return '加载中';
  if (!configStore.health) return '待检查';
  if (configStore.health.success && configStore.health.mysqlAvailable) return '服务正常';
  if (configStore.health.success) return '数据库待检查';
  return '需要检查';
});

const mysqlStatusText = computed(() => {
  if (isBootstrapping.value && configStore.health === null) return '加载中';
  if (!configStore.health) return '未知';
  return configStore.health.mysqlAvailable ? '已连接' : '不可用';
});

const aiStatusText = computed(() => {
  if (isBootstrapping.value && configStore.health === null) return '加载中';
  return configStore.health?.aiConfigured ? '已配置' : '未配置';
});

const modelSummary = computed(() => {
  if (isBootstrapping.value && !configStore.data) return '读取中';
  return draft.model || '未填写模型';
});

const currentBookSummary = computed(() => {
  if (isBootstrapping.value && !configStore.data) return '读取中';
  return configStore.data?.novel?.currentBookKey || '未设置';
});

const chapterSummary = computed(() => {
  if (isBootstrapping.value && !configStore.data) return '读取中';
  return `${configStore.data?.novel?.defaultChapterCount ?? '-'} 章 / ${configStore.data?.novel?.wordsPerChapter ?? '-'} 字`;
});

const platformSummary = computed(() => {
  const enabledCount = PLATFORM_META.filter((meta) => platformDrafts[meta.key]?.enabled).length;
  return `${enabledCount}/${PLATFORM_META.length} 已启用`;
});

const healthAvailabilityTag = computed(() => {
  if (isBootstrapping.value && configStore.health === null) return 'info';
  return configStore.health?.success ? 'success' : 'warning';
});

const healthAvailabilityText = computed(() => {
  if (isBootstrapping.value && configStore.health === null) return '加载中';
  return configStore.health?.success ? '通过' : '未通过';
});

const healthPanelState = computed(() => {
  if (isBootstrapping.value && configStore.health === null) return 'idle';
  if (configStore.health?.mysqlAvailable && configStore.health?.aiConfigured) return 'succeeded';
  if (!configStore.health || !configStore.health.success) return 'warning';
  return 'pending';
});

const healthHint = computed(() => {
  if (isBootstrapping.value && configStore.health === null) {
    return '正在同步后端状态。';
  }
  if (configStore.health?.mysqlAvailable && configStore.health?.aiConfigured) {
    return '数据库和模型链路都已经可用。';
  }
  if (configStore.health && !configStore.health.mysqlAvailable) {
    return '优先检查 MySQL 链路。';
  }
  if (configStore.health && !configStore.health.aiConfigured) {
    return 'AI 配置还没有补齐。';
  }
  return '建议先重新加载或执行一次连接测试。';
});

onMounted(loadAll);
onBeforeUnmount(stopOfficialAuthPolling);
</script>

<style scoped>
.config-page {
  display: grid;
  gap: 18px;
}

.config-header {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 22px 24px;
  border-radius: 24px;
  background: linear-gradient(145deg, rgba(15, 118, 110, 0.95), rgba(14, 165, 233, 0.88));
  color: #fff;
  box-shadow: 0 24px 52px rgba(15, 118, 110, 0.2);
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

.config-header h2 {
  margin: 0 0 10px;
  font-size: clamp(28px, 4vw, 38px);
  line-height: 1.08;
}

.config-header p {
  margin: 0;
  max-width: 760px;
  line-height: 1.7;
  opacity: 0.94;
}

.header-stats {
  display: grid;
  gap: 10px;
  min-width: 220px;
}

.stat-chip {
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.stat-chip span {
  display: block;
  font-size: 12px;
  opacity: 0.78;
}

.stat-chip strong {
  display: block;
  margin-top: 6px;
  font-size: 18px;
}

.loading-grid,
.top-grid {
  display: grid;
  gap: 18px;
}

.top-grid {
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
  align-items: start;
}

.glass-card {
  border-radius: 22px;
  border: 1px solid var(--panel-border);
  background: var(--panel);
  box-shadow: var(--panel-shadow);
  backdrop-filter: blur(18px);
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

.form-grid,
.summary-stack,
.platform-body {
  display: grid;
  gap: 16px;
}

.two-col {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.compact-two-col :deep(.el-input-number) {
  width: 100%;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.compact-toolbar {
  justify-content: flex-end;
}

.status-banner {
  display: grid;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.04);
}

.status-banner strong {
  font-size: 18px;
}

.status-banner span {
  color: var(--text-sub);
  font-size: 13px;
}

.status-banner.is-succeeded {
  background: rgba(22, 163, 74, 0.1);
}

.status-banner.is-warning {
  background: rgba(217, 119, 6, 0.12);
}

.summary-list {
  display: grid;
  gap: 10px;
}

.summary-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.summary-item:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.summary-item span {
  color: var(--text-sub);
}

.summary-item strong {
  text-align: right;
}

.platform-table :deep(.el-table__cell) {
  vertical-align: middle;
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.dialog-intro {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.dialog-intro p {
  margin: 0;
  color: var(--text-sub);
  line-height: 1.6;
}

.dialog-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0 8px;
}

.dialog-note-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-sub);
  font-size: 12px;
  line-height: 1.6;
}

.dialog-toolbar {
  justify-content: flex-end;
}

.full-width {
  width: 100%;
}

@media (max-width: 1100px) {
  .config-header,
  .top-grid,
  .card-head-inline {
    grid-template-columns: 1fr;
    flex-direction: column;
  }

  .header-stats,
  .compact-toolbar {
    width: 100%;
  }

  .compact-toolbar {
    justify-content: flex-start;
  }
}

@media (max-width: 900px) {
  .two-col,
  .dialog-note-row {
    grid-template-columns: 1fr;
    flex-direction: column;
  }
}
</style>

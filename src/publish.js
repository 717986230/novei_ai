const { FanqiePublisher } = require('./platforms/fanqie');
const { QidianPublisher } = require('./platforms/qidian');

const SUPPORTED_PLATFORMS = new Set([
  'fanqie',
  'qidian',
  'qimao',
  'douyin',
  'zongheng',
  '17k',
  'custom'
]);

const LOGIN_MODES = new Set([
  'oauth',
  'official',
  'browser',
  'cookies',
  'account',
  'password'
]);

const PLATFORM_LABELS = {
  fanqie: 'Fanqie',
  qidian: 'Qidian',
  qimao: 'Qimao',
  douyin: 'Douyin',
  zongheng: 'Zongheng',
  '17k': '17K',
  custom: 'Custom'
};

class PlatformPublisher {
  constructor(platforms) {
    this.platforms = platforms || {};
    this.fanqiePublisher = null;
    this.qidianPublisher = null;
  }

  async publish(chapters, context = {}) {
    const results = [];

    for (const chapter of chapters) {
      const enabledPlatforms = this.getEnabledPlatforms();
      const chapterResult = {
        chapter: chapter.number,
        title: chapter.title,
        platforms: {},
        enabledCount: enabledPlatforms.length,
        successCount: 0,
        success: false
      };

      for (const [platformName, config] of enabledPlatforms) {
        try {
          console.log(`Publishing to ${platformName}...`);
          const result = await this.publishToPlatform(platformName, chapter, config, context);
          chapterResult.platforms[platformName] = { success: true, detail: result };
          chapterResult.successCount += 1;
        } catch (error) {
          chapterResult.platforms[platformName] = {
            success: false,
            error: error.message,
            detail: {
              platform: platformName,
              mode: 'unimplemented',
              readiness: 'blocked',
              message: error.message
            }
          };
        }
      }

      chapterResult.success = chapterResult.enabledCount > 0
        && chapterResult.successCount === chapterResult.enabledCount;
      results.push(chapterResult);
    }

    return results;
  }

  async publishToPlatform(platformName, chapter, config, context = {}) {
    const normalizedName = this.normalizePlatformName(platformName);
    if (!SUPPORTED_PLATFORMS.has(normalizedName)) {
      throw new Error(`Unsupported platform: ${platformName}`);
    }

    const normalizedConfig = this.normalizeConfig(config, normalizedName);
    this.assertConfig(normalizedConfig, normalizedName);

    if (normalizedName === 'fanqie') {
      return this.publishToFanqie(chapter, normalizedConfig, context);
    }

    if (normalizedName === 'qidian') {
      return this.publishToQidian(chapter, normalizedConfig, context);
    }

    throw new Error(
      `${this.getPlatformLabel(normalizedName, normalizedConfig.label)} real publishing adapter is not implemented. ` +
      'Current project only supports configuration and readiness checks, not actual publishing.'
    );
  }

  async publishToFanqie(chapter, config, context = {}) {
    if (!this.fanqiePublisher) {
      this.fanqiePublisher = new FanqiePublisher(config);
    }

    return this.fanqiePublisher.publishChapter(chapter, context);
  }

  async publishToQidian(chapter, config, context = {}) {
    if (!this.qidianPublisher) {
      this.qidianPublisher = new QidianPublisher(config);
    }

    return this.qidianPublisher.publishChapter(chapter, context);
  }

  async publishToQimao(chapter, config) {
    return this.publishToPlatform('qimao', chapter, config);
  }

  async publishToDouyin(chapter, config) {
    return this.publishToPlatform('douyin', chapter, config);
  }

  async publishToZongheng(chapter, config) {
    return this.publishToPlatform('zongheng', chapter, config);
  }

  async publishTo17K(chapter, config) {
    return this.publishToPlatform('17k', chapter, config);
  }

  async publishToCustom(chapter, config) {
    return this.publishToPlatform('custom', chapter, config);
  }

  assertConfig(config, platformName) {
    const platformLabel = this.getPlatformLabel(platformName);
    const authState = this.getAuthState(config);

    if (authState.status === 'missing') {
      throw new Error(
        `${platformLabel} is not configured. Provide cookies, or username/password, or choose an official authorization login mode.`
      );
    }

    if (authState.status === 'needs_authorization') {
      return;
    }

    if (authState.status === 'missing_credentials') {
      throw new Error(
        `${platformLabel} is configured, but cookies or username/password are missing.`
      );
    }
  }

  getPublishStatus(platformName) {
    const normalizedName = this.normalizePlatformName(platformName);
    const config = this.platforms[normalizedName];
    if (!config) {
      throw new Error(`Unknown platform: ${platformName}`);
    }

    const normalizedConfig = this.normalizeConfig(config, normalizedName);
    const authState = this.getAuthState(normalizedConfig);

    return {
      enabled: Boolean(normalizedConfig.enabled),
      configured: authState.status !== 'missing',
      loginMode: authState.loginMode,
      readiness: authState.readiness,
      authStrategy: authState.strategy,
      message: authState.message,
      platform: normalizedName,
      label: this.getPlatformLabel(normalizedName)
    };
  }

  getEnabledPlatforms() {
    return Object.entries(this.platforms).filter(([, config]) => config && config.enabled);
  }

  normalizePlatformName(platformName) {
    return String(platformName || '').trim().toLowerCase();
  }

  normalizeConfig(config, platformName) {
    const normalized = config && typeof config === 'object' ? { ...config } : {};
    normalized.enabled = Boolean(normalized.enabled);
    normalized.label = this.getPlatformLabel(platformName, normalized.label);
    normalized.loginMode = this.normalizeLoginMode(normalized.loginMode);
    normalized.username = this.normalizeText(normalized.username);
    normalized.password = this.normalizeText(normalized.password);
    normalized.cookies = this.normalizeText(normalized.cookies);
    normalized.notes = this.normalizeText(normalized.notes);
    return normalized;
  }

  normalizeLoginMode(loginMode) {
    const value = this.normalizeText(loginMode).toLowerCase();
    if (!value) {
      return '';
    }

    if (LOGIN_MODES.has(value)) {
      return value;
    }

    if (value === 'auth' || value === 'authorize') {
      return 'oauth';
    }

    return value;
  }

  normalizeText(value) {
    return value == null ? '' : String(value).trim();
  }

  getPlatformLabel(platformName, fallback = '') {
    return fallback || PLATFORM_LABELS[platformName] || platformName;
  }

  getAuthState(config) {
    const hasCookies = Boolean(config.cookies);
    const hasUsername = Boolean(config.username);
    const hasPassword = Boolean(config.password);
    const loginMode = config.loginMode || this.inferLoginMode(config);

    if (!loginMode && !hasCookies && !hasUsername && !hasPassword) {
      return {
        status: 'missing',
        readiness: 'not-configured',
        strategy: 'none',
        loginMode: '',
        message: 'No platform credentials configured.'
      };
    }

    if (loginMode === 'oauth' || loginMode === 'official') {
      return {
        status: 'needs_authorization',
        readiness: 'needs-official-auth',
        strategy: 'official-oauth',
        loginMode,
        message: 'Official website authorization is pending.'
      };
    }

    if (loginMode === 'browser') {
      return {
        status: 'needs_browser_login',
        readiness: 'needs-browser-automation',
        strategy: 'browser-automation',
        loginMode,
        message: 'Browser automation login is pending.'
      };
    }

    if (loginMode === 'cookies') {
      if (!hasCookies) {
        return {
          status: 'missing_credentials',
          readiness: 'configured-but-missing-cookies',
          strategy: 'cookies',
          loginMode,
          message: 'Cookie-based login selected, but cookies are missing.'
        };
      }

      return {
        status: 'ready',
        readiness: 'ready',
        strategy: 'cookies',
        loginMode,
        message: 'Cookie-based configuration is ready.'
      };
    }

    if (loginMode === 'account' || loginMode === 'password') {
      if (!hasUsername || !hasPassword) {
        return {
          status: 'missing_credentials',
          readiness: 'configured-but-missing-account',
          strategy: 'account-password',
          loginMode,
          message: 'Account/password login selected, but username or password is missing.'
        };
      }

      return {
        status: 'ready',
        readiness: 'ready',
        strategy: 'account-password',
        loginMode,
        message: 'Account/password configuration is ready.'
      };
    }

    if (hasCookies) {
      return {
        status: 'ready',
        readiness: 'ready',
        strategy: 'cookies',
        loginMode: loginMode || 'cookies',
        message: 'Cookie-based configuration is ready.'
      };
    }

    if (hasUsername || hasPassword) {
      if (!hasUsername || !hasPassword) {
        return {
          status: 'missing_credentials',
          readiness: 'configured-but-missing-account',
          strategy: 'account-password',
          loginMode: loginMode || 'account',
          message: 'Account/password credentials are incomplete.'
        };
      }

      return {
        status: 'ready',
        readiness: 'ready',
        strategy: 'account-password',
        loginMode: loginMode || 'account',
        message: 'Account/password configuration is ready.'
      };
    }

    if (loginMode === 'browser') {
      return {
        status: 'needs_browser_login',
        readiness: 'needs-browser-automation',
        strategy: 'browser-automation',
        loginMode,
        message: 'Browser automation login is pending.'
      };
    }

    return {
      status: 'missing_credentials',
      readiness: 'configured-but-missing-credentials',
      strategy: loginMode || 'unknown',
      loginMode,
      message: 'Platform is enabled, but no usable credentials were found.'
    };
  }

  inferLoginMode(config) {
    if (config.cookies) {
      return 'cookies';
    }

    if (config.username || config.password) {
      return 'account';
    }

    return '';
  }

  createMockResult(platformName, chapter, config) {
    const authState = this.getAuthState(config);
    const platformLabel = this.getPlatformLabel(platformName, config.label);

    return {
      platform: platformName,
      label: platformLabel,
      chapter: chapter.number,
      title: chapter.title,
      mode: 'mock',
      readiness: authState.readiness,
      authStrategy: authState.strategy,
      loginMode: authState.loginMode,
      status: authState.status,
      published: authState.status === 'ready',
      message: this.getResultMessage(platformLabel, authState),
      nextStep: this.getNextStep(authState),
      configured: authState.status !== 'missing'
    };
  }

  getResultMessage(platformLabel, authState) {
    switch (authState.readiness) {
      case 'ready':
        return `${platformLabel} is configured and ready for mock publishing.`;
      case 'needs-official-auth':
        return `${platformLabel} will use official website authorization when the browser flow is connected.`;
      case 'needs-browser-automation':
        return `${platformLabel} will use browser automation login when the browser flow is connected.`;
      case 'configured-but-missing-cookies':
        return `${platformLabel} is partially configured, but cookies are missing.`;
      case 'configured-but-missing-account':
        return `${platformLabel} is partially configured, but username or password is missing.`;
      default:
        return `${platformLabel} is not ready yet.`;
    }
  }

  getNextStep(authState) {
    switch (authState.readiness) {
      case 'ready':
        return 'mock-publish';
      case 'needs-official-auth':
        return 'open-official-login-window';
      case 'needs-browser-automation':
        return 'open-browser-login-flow';
      case 'configured-but-missing-cookies':
        return 'provide-cookies';
      case 'configured-but-missing-account':
        return 'provide-username-password';
      default:
        return 'configure-platform';
    }
  }
}

module.exports = { PlatformPublisher, SUPPORTED_PLATFORMS };

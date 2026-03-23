const { chromium } = require('playwright');

const QIDIAN_ORIGIN = 'https://write.qq.com';
const LOGIN_URL = `${QIDIAN_ORIGIN}/portal/login`;
const DASHBOARD_URL = `${QIDIAN_ORIGIN}/portal`;

function normalizeText(value) {
  return value == null ? '' : String(value).trim();
}

function parseCookieHeader(cookieHeader) {
  const rawCookies = normalizeText(cookieHeader)
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const index = pair.indexOf('=');
      if (index <= 0) {
        return null;
      }

      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (!name) {
        return null;
      }

      return { name, value };
    })
    .filter(Boolean);

  return rawCookies.flatMap((cookie) => ([
    { ...cookie, domain: '.qq.com', path: '/', secure: true, sameSite: 'Lax' },
    { ...cookie, domain: '.write.qq.com', path: '/', secure: true, sameSite: 'Lax' },
    { ...cookie, domain: '.yuewen.com', path: '/', secure: true, sameSite: 'Lax' }
  ]));
}

class QidianPublisher {
  constructor(config = {}, options = {}) {
    this.config = config;
    this.headless = options.headless ?? process.env.QIDIAN_HEADLESS === '1';
    this.slowMo = options.slowMo ?? Number(process.env.QIDIAN_SLOW_MO || 0);
  }

  async publishChapter(chapter, context = {}) {
    const chapterTitle = normalizeText(chapter.title);
    const chapterContent = normalizeText(chapter.content);
    const chapterNumber = Number(chapter.number) || 1;
    const targetBookTitle = normalizeText(context.novelInfo?.title || context.bookTitle);

    if (!chapterTitle) {
      throw new Error('Qidian publish requires a chapter title.');
    }

    if (chapterContent.length < 1000) {
      throw new Error('Qidian publish requires at least 1000 characters of chapter content before publishing.');
    }

    const browser = await chromium.launch({
      headless: this.headless,
      slowMo: this.slowMo
    });
    const browserContext = await browser.newContext({
      viewport: { width: 1440, height: 960 }
    });

    try {
      await this.applyCookies(browserContext);

      const page = await browserContext.newPage();
      await this.ensureLoggedIn(page);

      if (context.dryRun) {
        return {
          platform: 'qidian',
          label: this.config.label || 'Qidian',
          mode: 'browser-automation',
          readiness: 'logged-in-ready',
          authStrategy: this.config.cookies ? 'cookies' : 'account-password',
          loginMode: this.config.cookies ? 'cookies' : 'account',
          configured: true,
          dryRun: true,
          dashboardUrl: page.url(),
          bookTitle: targetBookTitle,
          chapter: chapterNumber,
          title: chapterTitle,
          message: 'Qidian author dashboard login succeeded. Publish route capture is the next implementation step.'
        };
      }

      throw new Error(
        'Qidian login succeeded, but the editor/publish route is not implemented yet. ' +
        'A live authenticated create-chapter flow needs to be captured next.'
      );
    } finally {
      await browserContext.close();
      await browser.close();
    }
  }

  async applyCookies(browserContext) {
    const cookies = parseCookieHeader(this.config.cookies);
    if (!cookies.length) {
      return;
    }

    await browserContext.addCookies(cookies);
  }

  async ensureLoggedIn(page) {
    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    if (await this.isLoggedIn(page)) {
      return;
    }

    if (!normalizeText(this.config.username) || !normalizeText(this.config.password)) {
      throw new Error('Qidian login requires cookies or username/password.');
    }

    await this.loginWithPassword(page);

    if (!(await this.isLoggedIn(page))) {
      const loginError = await this.readLoginError(page);
      throw new Error(loginError || 'Qidian login failed. Please verify the account credentials.');
    }
  }

  async loginWithPassword(page) {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const loginFrame = page.frameLocator('iframe').first();
    const accountInput = loginFrame.locator('input[placeholder="手机/邮箱/用户名"]').first();
    const passwordInput = loginFrame.locator('input[placeholder="密码"]').first();

    await accountInput.waitFor({ timeout: 15000 });
    await passwordInput.waitFor({ timeout: 15000 });

    await accountInput.fill(normalizeText(this.config.username));
    await passwordInput.fill(normalizeText(this.config.password));

    const agreementCheckbox = loginFrame.getByRole('checkbox').last();
    if (await agreementCheckbox.isVisible().catch(() => false)) {
      await agreementCheckbox.check({ force: true }).catch(() => null);
    }

    const loginButton = loginFrame.getByText('登 录', { exact: true }).first();
    await loginButton.click({ force: true });
    await page.waitForTimeout(3000);

    await page.waitForLoadState('networkidle').catch(() => null);
  }

  async isLoggedIn(page) {
    if (page.url().includes('/portal/login')) {
      return false;
    }

    const loginAnchors = [
      page.locator('a[href*="/portal/login"]').first(),
      page.getByText('登录', { exact: true }).first(),
      page.getByText('成为作家', { exact: true }).first()
    ];

    for (const anchor of loginAnchors) {
      if (await anchor.isVisible().catch(() => false)) {
        return false;
      }
    }

    const authorOnlySignals = [
      page.locator('a[href*="bookcase"]').first(),
      page.locator('a[href*="create"]').first(),
      page.getByText('作品管理', { exact: true }).first(),
      page.getByText('作家后台', { exact: true }).first()
    ];
    for (const signal of authorOnlySignals) {
      if (await signal.isVisible().catch(() => false)) {
        return true;
      }
    }

    const bodyText = await page.locator('body').textContent().catch(() => '');
    return !bodyText.includes('登录') && !bodyText.includes('成为作家');
  }

  async readLoginError(page) {
    const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
    if (!frame) {
      return '';
    }

    const texts = await frame.locator('body').textContent().catch(() => '');
    if (!texts) {
      return '';
    }

    if (texts.includes('登录失败')) {
      return 'Qidian login failed. The current account/password was rejected by the author login page.';
    }

    if (texts.includes('验证码')) {
      return 'Qidian login requires an additional verification step.';
    }

    return '';
  }
}

module.exports = { QidianPublisher };

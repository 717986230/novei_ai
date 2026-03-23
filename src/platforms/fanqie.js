const { chromium } = require('playwright');

const FANQIE_ORIGIN = 'https://fanqienovel.com';
const WRITER_HOME_URL = `${FANQIE_ORIGIN}/main/writer/?enter_from=author_zone`;
const LOGIN_URL = `${FANQIE_ORIGIN}/main/writer/login?enter_from=author_zone`;

function normalizeText(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeBookTitle(value) {
  return normalizeText(value).replace(/\s+/g, ' ').slice(0, 15);
}

function normalizeChapterContent(value) {
  return normalizeText(value).replace(/\r/g, '');
}

function parseCookieHeader(cookieHeader) {
  return normalizeText(cookieHeader)
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

      return {
        name,
        value,
        domain: '.fanqienovel.com',
        path: '/',
        secure: true,
        sameSite: 'Lax'
      };
    })
    .filter(Boolean);
}

function extractIdsFromUrl(url) {
  const match = String(url || '').match(/\/main\/writer\/(\d+)\/publish\/?(\d+)?/);
  return {
    bookId: match?.[1] || '',
    articleId: match?.[2] || ''
  };
}

function canReuseDraftBook(book) {
  if (!book || typeof book !== 'object') {
    return false;
  }

  return book.book_intro?.status === 'book_initial_without_audit'
    || (Number(book.chapter_number || 0) === 0 && Number(book.content_word_number || 0) === 0);
}

class FanqiePublisher {
  constructor(config = {}, options = {}) {
    this.config = config;
    this.headless = options.headless ?? process.env.FANQIE_HEADLESS === '1';
    this.slowMo = options.slowMo ?? Number(process.env.FANQIE_SLOW_MO || 0);
  }

  async publishChapter(chapter, context = {}) {
    const targetBookTitle = normalizeBookTitle(
      context.novelInfo?.title || context.bookTitle || chapter.title || '新书'
    );
    const chapterTitle = normalizeText(chapter.title);
    const chapterContent = normalizeChapterContent(chapter.content);
    const chapterNumber = Number(chapter.number) || 1;

    if (!targetBookTitle) {
      throw new Error('Fanqie publish requires a novel title.');
    }

    if (!chapterTitle) {
      throw new Error('Fanqie publish requires a chapter title.');
    }

    if (chapterContent.length < 1000) {
      throw new Error('Fanqie requires at least 1000 characters of chapter content before publishing.');
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

      const target = await this.openEditor(page, targetBookTitle);
      await this.fillEditor(page, {
        chapterNumber,
        chapterTitle,
        chapterContent
      });
      await this.openPublishDialog(page);
      await this.fillPublishDialog(page, targetBookTitle);

      if (context.dryRun) {
        return {
          platform: 'fanqie',
          label: this.config.label || 'Fanqie',
          mode: 'browser-automation',
          readiness: 'ready-to-publish',
          authStrategy: this.config.cookies ? 'cookies' : 'account-password',
          loginMode: this.config.cookies ? 'cookies' : 'account',
          configured: true,
          dryRun: true,
          bookId: target.bookId,
          articleId: target.articleId,
          bookTitle: targetBookTitle,
          chapter: chapter.number,
          title: chapterTitle,
          message: 'Fanqie publish flow reached the final confirmation dialog.'
        };
      }

      await this.confirmPublish(page, {
        bookTitle: targetBookTitle,
        chapterTitle
      });

      return {
        platform: 'fanqie',
        label: this.config.label || 'Fanqie',
        mode: 'browser-automation',
        readiness: 'published',
        authStrategy: this.config.cookies ? 'cookies' : 'account-password',
        loginMode: this.config.cookies ? 'cookies' : 'account',
        configured: true,
        published: true,
        bookId: target.bookId,
        articleId: target.articleId,
        bookTitle: targetBookTitle,
        chapter: chapter.number,
        title: chapterTitle,
        message: 'Fanqie chapter publish request has been submitted.'
      };
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
    await page.goto(WRITER_HOME_URL, { waitUntil: 'domcontentloaded' });

    if (await this.isLoggedIn(page)) {
      return;
    }

    if (!normalizeText(this.config.username) || !normalizeText(this.config.password)) {
      throw new Error('Fanqie login requires cookies or username/password.');
    }

    await this.loginWithPassword(page);

    if (!(await this.isLoggedIn(page))) {
      throw new Error('Fanqie login failed. Please verify the account credentials or import fresh cookies.');
    }
  }

  async loginWithPassword(page) {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    let accountInput = page.getByPlaceholder('请输入手机号/邮箱');
    if (!(await accountInput.count())) {
      const passwordLoginButton = page.getByRole('button', {
        name: /密码登录|账号密码登录/
      }).first();
      if (await passwordLoginButton.isVisible().catch(() => false)) {
        await passwordLoginButton.click();
        await page.waitForTimeout(1200);
      }
      accountInput = page.getByPlaceholder('请输入手机号/邮箱');
    }

    await accountInput.waitFor({ timeout: 15000 });
    await accountInput.fill(normalizeText(this.config.username));
    await page.getByPlaceholder('请输入密码').fill(normalizeText(this.config.password));

    const checkbox = page.locator('input[type="checkbox"]').first();
    if (await checkbox.count()) {
      try {
        if (!(await checkbox.isChecked())) {
          await checkbox.check({ force: true });
        }
      } catch {
        const agreementLabel = page.locator('label').first();
        if (await agreementLabel.count()) {
          await agreementLabel.click();
        }
      }
    }

    const loginButton = page.getByRole('button', { name: '登录' }).first();
    await loginButton.click();
    await page.waitForTimeout(2500);
    await page.goto(WRITER_HOME_URL, { waitUntil: 'domcontentloaded' });
  }

  async isLoggedIn(page) {
    const accountInfo = await page.evaluate(async () => {
      const response = await fetch('/api/author/account/info/v0/?aid=2503&app_name=muye_novel', {
        credentials: 'include'
      });
      return response.json();
    }).catch(() => null);

    return Boolean(accountInfo?.code === 0 && accountInfo?.data?.author_name);
  }

  async fetchBookList(page) {
    const payload = await page.evaluate(async () => {
      const response = await fetch(
        '/api/author/homepage/book_list/v0/?aid=2503&app_name=muye_novel&page_count=20&page_index=0&image_fmt_list=396x220',
        { credentials: 'include' }
      );
      return response.json();
    });

    return payload?.data?.book_list || [];
  }

  findTargetBook(books, targetBookTitle) {
    const exactMatch = books.find((book) => normalizeBookTitle(book.book_name) === targetBookTitle);
    if (exactMatch) {
      return exactMatch;
    }

    return books.find((book) => canReuseDraftBook(book)) || null;
  }

  async openEditor(page, targetBookTitle) {
    await page.goto(WRITER_HOME_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const books = await this.fetchBookList(page);
    const targetBook = this.findTargetBook(books, targetBookTitle);

    if (targetBook?.book_id) {
      await page.goto(
        `${FANQIE_ORIGIN}/main/writer/${targetBook.book_id}/publish/?enter_from=novel_ai_auto`,
        { waitUntil: 'domcontentloaded' }
      );
      return this.waitForEditor(page);
    }

    const writeButton = page.getByText('去写作', { exact: true });
    if (!(await writeButton.isVisible().catch(() => false))) {
      throw new Error('No reusable Fanqie book was found, and the quick entry for creating the first chapter is unavailable.');
    }

    await writeButton.click();
    await page.waitForTimeout(500);

    const createChapterEntry = page.locator('.write-button-dropdown-item').first();
    if (!(await createChapterEntry.isVisible().catch(() => false))) {
      throw new Error('Fanqie quick publish menu did not open. Please create a book manually once in the writer console.');
    }

    await createChapterEntry.click();
    return this.waitForEditor(page);
  }

  async waitForEditor(page) {
    await page.waitForFunction(() => /\/main\/writer\/\d+\/publish/.test(window.location.href), null, {
      timeout: 15000
    });
    await page.getByPlaceholder('请输入标题').waitFor({ timeout: 15000 });
    await page.locator('.ProseMirror').first().waitFor({ timeout: 15000 });
    await this.waitForDialogSequence(page, { maxAttempts: 10, emptyPollLimit: 3 });

    return extractIdsFromUrl(page.url());
  }

  async fillEditor(page, chapter) {
    await this.waitForDialogSequence(page, { maxAttempts: 10, emptyPollLimit: 3 });

    const chapterNumberInput = page.locator('input.serial-input').first();
    await chapterNumberInput.fill(String(chapter.chapterNumber));

    await page.getByPlaceholder('请输入标题').fill(chapter.chapterTitle);

    const editor = page.locator('.ProseMirror').first();
    await editor.click();
    await editor.fill(chapter.chapterContent);
    await page.waitForTimeout(800);

    const saveDraftButton = page.getByRole('button', { name: '存草稿' }).first();
    if (await saveDraftButton.isVisible().catch(() => false)) {
      await saveDraftButton.click();
      await page.waitForTimeout(1200);
    }
  }

  async openPublishDialog(page) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const nextButton = page.getByRole('button', { name: '下一步' }).first();
      await nextButton.click({ force: true });
      await page.waitForTimeout(1500);

      const dialogState = await this.waitForDialogSequence(page, {
        maxAttempts: 18,
        emptyPollLimit: 6,
        idleDelay: 800
      });

      if (dialogState.reachedPublishDialog) {
        return;
      }

      const handledSidebar = await this.handleProofreadingSidebar(page);
      if (!handledSidebar) {
        break;
      }
    }

    await this.getPublishDialog(page).waitFor({ timeout: 15000 });
  }

  async fillPublishDialog(page, targetBookTitle) {
    const dialog = this.getPublishDialog(page);
    const titleInput = dialog.locator('input[type="text"], input:not([type]), textarea').first();
    if (await titleInput.isVisible().catch(() => false)) {
      await titleInput.fill(targetBookTitle);
    }

    const aiNoLabel = dialog.getByText('否', { exact: true }).last();
    if (await aiNoLabel.isVisible().catch(() => false)) {
      await aiNoLabel.click({ force: true });
      await page.waitForTimeout(300);
    }

    const aiRadios = dialog.locator('input[type="radio"]');
    if (await aiRadios.count().catch(() => 0)) {
      await aiRadios.last().evaluate((node) => {
        node.checked = true;
        node.dispatchEvent(new Event('input', { bubbles: true }));
        node.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
  }

  async confirmPublish(page, target) {
    const dialog = this.getPublishDialog(page);
    await dialog.getByRole('button', { name: '确认发布' }).click({ force: true });
    await this.waitForDialogSequence(page, {
      maxAttempts: 10,
      emptyPollLimit: 3,
      idleDelay: 800,
      stopOnPublishDialog: false
    });

    const startedAt = Date.now();
    while (Date.now() - startedAt < 20000) {
      await page.waitForTimeout(1500);

      const books = await this.fetchBookList(page).catch(() => []);
      const matchedBook = books.find((book) => normalizeBookTitle(book.book_name) === normalizeBookTitle(target.bookTitle));

      if (matchedBook && (
        Number(matchedBook.chapter_number || 0) >= 1
        || normalizeText(matchedBook.last_chapter_title) === target.chapterTitle
      )) {
        return;
      }

      const successToast = await page.getByText(/发布成功|提交成功|审核中/).isVisible().catch(() => false);
      if (successToast) {
        return;
      }
    }

    throw new Error('Fanqie publish confirmation did not complete within 20 seconds.');
  }

  getPublishDialog(page) {
    return page.locator('[role="dialog"]').filter({ hasText: '发布设置' }).first();
  }

  async handleBlockingDialog(page, dialog) {
    const text = normalizeText(await dialog.textContent().catch(() => ''));
    if (!text || text.includes('发布设置')) {
      return false;
    }

    if (text.includes('版本冲突')) {
      const keepLocalButton = dialog.getByRole('button', { name: '继续编辑本地' }).first();
      if (await keepLocalButton.isVisible().catch(() => false)) {
        await keepLocalButton.click({ force: true });
        await page.waitForTimeout(700);
        return true;
      }

      const chooseCloudButton = dialog.getByRole('button', { name: '选择云端版本' }).first();
      if (await chooseCloudButton.isVisible().catch(() => false)) {
        await chooseCloudButton.click({ force: true });
        await page.waitForTimeout(700);
        return true;
      }
    }

    if (text.includes('错别字')) {
      const confirmButton = dialog.locator('button, [role="button"], .arco-btn').filter({
        hasText: /提交|确定提交|确认提交|继续提交/
      }).first();
      if (await confirmButton.isVisible().catch(() => false)) {
        await confirmButton.click({ force: true });
        await page.waitForTimeout(700);
        return true;
      }

      const cancelSubmitButton = dialog.locator('button, [role="button"], .arco-btn').filter({
        hasText: /取消|取消提交/
      }).first();
      if (await cancelSubmitButton.isVisible().catch(() => false)) {
        await cancelSubmitButton.click({ force: true });
        await page.waitForTimeout(700);
        return true;
      }
    }

    if (text.includes('风险')) {
      const skipRiskButton = dialog.getByRole('button', {
        name: /取消|暂不检测|稍后再说/
      }).last();
      if (await skipRiskButton.isVisible().catch(() => false)) {
        await skipRiskButton.click({ force: true });
        await page.waitForTimeout(700);
        return true;
      }
    }

    const closeButton = dialog.locator('.arco-modal-close-btn, [class*="close"]').first();
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click({ force: true });
      await page.waitForTimeout(500);
      return true;
    }

    const actionButton = dialog.getByRole('button', {
      name: /下一步|知道了|我知道了|关闭|跳过|完成|取消|稍后再说/
    }).last();
    if (await actionButton.isVisible().catch(() => false)) {
      await actionButton.click({ force: true });
      await page.waitForTimeout(500);
      return true;
    }

    return false;
  }

  async handleProofreadingSidebar(page) {
    const proofreadingPanel = page.locator('text=智能纠错').first();
    if (!(await proofreadingPanel.isVisible().catch(() => false))) {
      return false;
    }

    const ignoreAllButton = page.getByRole('button', { name: '忽略全部' }).first();
    if (await ignoreAllButton.isVisible().catch(() => false)) {
      await ignoreAllButton.click({ force: true });
      await page.waitForTimeout(1200);
      return true;
    }

    const replaceAllButton = page.getByRole('button', { name: '替换全部' }).first();
    if (await replaceAllButton.isVisible().catch(() => false)) {
      await replaceAllButton.click({ force: true });
      await page.waitForTimeout(1200);
      return true;
    }

    return false;
  }

  async waitForDialogSequence(page, options = {}) {
    const maxAttempts = options.maxAttempts ?? 15;
    const emptyPollLimit = options.emptyPollLimit ?? 4;
    const idleDelay = options.idleDelay ?? 700;
    const stopOnPublishDialog = options.stopOnPublishDialog ?? true;
    let handledAnyDialog = false;
    let emptyPolls = 0;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const publishDialog = this.getPublishDialog(page);
      if (stopOnPublishDialog && await publishDialog.isVisible().catch(() => false)) {
        return { handledAnyDialog, reachedPublishDialog: true };
      }

      const dialogs = page.locator('[role="dialog"]');
      const count = await dialogs.count().catch(() => 0);
      let dismissed = false;

      for (let index = 0; index < count; index += 1) {
        const dialog = dialogs.nth(index);
        if (!(await dialog.isVisible().catch(() => false))) {
          continue;
        }

        dismissed = await this.handleBlockingDialog(page, dialog);
        if (dismissed) {
          handledAnyDialog = true;
          emptyPolls = 0;
          break;
        }
      }

      if (dismissed) {
        continue;
      }

      emptyPolls += 1;
      if (emptyPolls >= emptyPollLimit) {
        return {
          handledAnyDialog,
          reachedPublishDialog: await publishDialog.isVisible().catch(() => false)
        };
      }

      await page.waitForTimeout(idleDelay);
    }

    return {
      handledAnyDialog,
      reachedPublishDialog: await this.getPublishDialog(page).isVisible().catch(() => false)
    };
  }

  async dismissBlockingDialogs(page, options = {}) {
    return this.waitForDialogSequence(page, options);
  }
}

module.exports = { FanqiePublisher, normalizeBookTitle };

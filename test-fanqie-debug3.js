const { chromium } = require('playwright');
const fs = require('fs');

const FANQIE_ORIGIN = 'https://fanqienovel.com';
const BOOK_ID = '7619924757198146585';
const WRITER_EDITOR_URL = `${FANQIE_ORIGIN}/main/writer/${BOOK_ID}/publish/?enter_from=novel_ai_auto`;

const config = {
  label: '番茄小说',
  loginMode: 'cookies',
  cookies: 'x-web-secsdk-uid=34c2d9b8-2d97-45af-8a71-68bb36583a27; Hm_lvt_2667d29c8e792e6fa9182c20a3013175=1774151687; Hm_lpvt_2667d29c8e792e6fa9182c20a3013175=1774151687; HMACCOUNT=2D7E1AD02EEC1D30; s_v_web_id=verify_mn183uvx_DJhQzZeA_2ubl_4N8j_9NGY_nH2vOcKNVLEf; csrf_session_id=61ea8541cb6d31e0e830fead0033892c; novel_web_id=7619923511318742563; serial_uuid=7619923511318742563; serial_webid=7619923511318742563; gfkadpd=2503,36144; passport_csrf_token=64fd26b48abe6fbea826275cfbe644c3; passport_csrf_token_default=64fd26b48abe6fbea826275cfbe644c3; passport_mfa_token=Ci8PIidri5v4Hc1duqDkPIk%2FKBffIKL9PqYlBMtJ%2FPxsUIYAfiLJBszYkucr3dsBixpKCjwAAAAAAAAAAAAAUDaVm8AnH5bvTYOeZYoFEFgQyG03YxNgbPNMfueN65c%2ByrW4pPTxeTUkj6jq2w8R2wUQn%2BGMDhj2sdFsIAIiAQPygfYy; d_ticket=1d930ba5f211c1fe6f35172550c550b04afa2; odin_tt=454788c1acb0a6e94a4b554ce44410cba6565cc40bf1cfc448ec35362a1fa39649a18d23cf82d7933f89ce41cc579b8f; n_mh=EmJHqh7JpAAeAtDS4X_xrGh5ZJzNCIXE8VbGSw8Dnl4; sid_guard=6a655fc22a944dc3a4fb17c1aa5b12e2%7C1774151926%7C5184000%7CThu%2C+21-May-2026+03%3A58%3A46+GMT; uid_tt=f23301253ab570f5e88783ae87a72dd8; uid_tt_ss=f23301253ab570f5e88783ae87a72dd8; sid_tt=6a655fc22a944dc3a4fb17c1aa5b12e2; sessionid=6a655fc22a944dc3a4fb17c1aa5b12e2; sessionid_ss=6a655fc22a944dc3a4fb17c1aa5b12e2; session_tlb_tag=sttt%7C10%7CamVfwiqUTcOk-xfBqlsS4v________-07tro1jmxE_IkkIyYZTSHwyQeSBd2LNAE8B3AQm20rfc%3D; is_staff_user=false; sid_ucp_v1=1.0.0-KDViMDg3MzM3ZDYyYjlhOGJmYTQ3NjMxN2ZjYWJiYmI0MmY2ZDQyNmUKHQilh_WvugIQ9tH9zQYYxxMgDDDum77SBTgCQO8HGgJsZiIgNmE2NTVmYzIyYTk0NGRjM2E0ZmIxN2MxYWE1YjEyZTI; ssid_ucp_v1=1.0.0-KDViMDg3MzM3ZDYyYjlhOGJmYTQ3NjMxN2ZjYWJiYmI0MmY2ZDQyNmUKHQilh_WvugIQ9tH9zQYYxxMgDDDum77SBTgCQO8HGgJsZiIgNmE2NTVmYzIyYTk0NGRjM2E0ZmIxN2MxYWE1YjEyZTI; ttwid=1%7CjUfcU_dT_0xto0Ljx7rpvrHbWQo1JBn_MRSYhIVjHXg%7C1774152113%7Cd1255eff264ccd799999961f58933636ecb22ebc1fc0b907bb5fa0502fe2b46b'
};

const chapter = JSON.parse(
  fs.readFileSync('./output/books/独门修炼/chapters/chapter_0002.json', 'utf-8')
);

function parseCookieHeader(cookieHeader) {
  return cookieHeader
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const index = pair.indexOf('=');
      if (index <= 0) return null;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (!name) return null;
      return { name, value, domain: '.fanqienovel.com', path: '/', secure: true, sameSite: 'Lax' };
    })
    .filter(Boolean);
}

function trimPreview(text, max = 80) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function clickFirstVisible(locator) {
  if (await locator.isVisible().catch(() => false)) {
    await locator.click({ force: true });
    return true;
  }
  return false;
}

async function handleSingleDialog(page, dialog, index) {
  const text = (await dialog.textContent().catch(() => '')).trim();
  console.log(`   发现弹窗 ${index}: ${trimPreview(text)}`);

  if (!text || text.includes('发布设置')) {
    return false;
  }

  if (text.includes('错别字')) {
    const buttonLabels = await dialog.locator('button, [role="button"], .arco-btn, .arco-modal-footer span').evaluateAll(
      (nodes) => nodes.map((node) => (node.textContent || '').trim()).filter(Boolean)
    ).catch(() => []);
    console.log(`   错别字弹窗可见按钮: ${buttonLabels.join(' | ') || '无'}`);

    const confirmSubmit = dialog.locator('button, [role="button"], .arco-btn').filter({
      hasText: /提交|确定提交|确认提交|继续提交/
    }).first();
    if (await clickFirstVisible(confirmSubmit)) {
      console.log('   点击了“确定提交”');
      await page.waitForTimeout(700);
      return true;
    }

    const cancelSubmit = dialog.locator('button, [role="button"], .arco-btn').filter({
      hasText: /取消|取消提交/
    }).first();
    if (await clickFirstVisible(cancelSubmit)) {
      console.log('   点击了“取消提交”，继续等待后续弹窗');
      await page.waitForTimeout(700);
      return true;
    }
  }

  if (text.includes('风险')) {
    const skipRisk = dialog.getByRole('button', {
      name: /取消|暂不检测|稍后再说/
    }).last();
    if (await clickFirstVisible(skipRisk)) {
      console.log('   点击了风险提示弹窗的跳过按钮');
      await page.waitForTimeout(700);
      return true;
    }
  }

  const closeButton = dialog.locator('.arco-modal-close-btn, [class*="close"]').first();
  if (await clickFirstVisible(closeButton)) {
    console.log('   点击了关闭按钮');
    await page.waitForTimeout(500);
    return true;
  }

  const fallbackButton = dialog.getByRole('button', {
    name: /下一步|知道了|我知道了|关闭|跳过|完成|取消|稍后再说/
  }).last();
  if (await clickFirstVisible(fallbackButton)) {
    console.log('   点击了兜底按钮');
    await page.waitForTimeout(500);
    return true;
  }

  return false;
}

async function waitForDialogSequence(page, options = {}) {
  const publishDialog = page.locator('[role="dialog"]').filter({ hasText: '发布设置' }).first();
  const maxAttempts = options.maxAttempts ?? 15;
  const emptyPollLimit = options.emptyPollLimit ?? 4;
  const idleDelay = options.idleDelay ?? 700;
  let handledAnyDialog = false;
  let emptyPolls = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await publishDialog.isVisible().catch(() => false)) {
      console.log('   已进入“发布设置”弹窗');
      return { handledAnyDialog, reachedPublishDialog: true };
    }

    const dialogs = page.locator('[role="dialog"]');
    const count = await dialogs.count().catch(() => 0);
    let dismissed = false;

    for (let index = 0; index < count; index += 1) {
      const dialog = dialogs.nth(index);
      if (!(await dialog.isVisible().catch(() => false))) continue;

      dismissed = await handleSingleDialog(page, dialog, index);
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
    reachedPublishDialog: await publishDialog.isVisible().catch(() => false)
  };
}

async function handleProofreadingSidebar(page) {
  const proofreadingPanel = page.locator('text=智能纠错').first();
  if (!(await proofreadingPanel.isVisible().catch(() => false))) {
    return false;
  }

  const ignoreAllButton = page.getByRole('button', { name: '忽略全部' }).first();
  if (await ignoreAllButton.isVisible().catch(() => false)) {
    await ignoreAllButton.click({ force: true });
    console.log('处理智能纠错侧栏: 点击“忽略全部”');
    await page.waitForTimeout(1200);
    return true;
  }

  const replaceAllButton = page.getByRole('button', { name: '替换全部' }).first();
  if (await replaceAllButton.isVisible().catch(() => false)) {
    await replaceAllButton.click({ force: true });
    console.log('处理智能纠错侧栏: 点击“替换全部”');
    await page.waitForTimeout(1200);
    return true;
  }

  return false;
}

async function main() {
  console.log('='.repeat(50));
  console.log('番茄小说发布完整调试');
  console.log('='.repeat(50));

  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const browserContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });

  try {
    const cookies = parseCookieHeader(config.cookies);
    await browserContext.addCookies(cookies);
    console.log(`已导入 ${cookies.length} 个 cookies`);

    const page = await browserContext.newPage();

    console.log(`打开编辑页: ${WRITER_EDITOR_URL}`);
    await page.goto(WRITER_EDITOR_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    try {
      await page.waitForFunction(() => /\/main\/writer\/\d+\/publish/.test(window.location.href), {
        timeout: 15000
      });
      await page.getByPlaceholder('请输入标题').waitFor({ timeout: 15000 });
      console.log('编辑器已加载');
    } catch (error) {
      console.log(`编辑器加载超时: ${error.message}`);
    }

    await waitForDialogSequence(page);

    console.log('填写章节内容...');
    const chapterNumInput = page.locator('input.serial-input').first();
    if (await chapterNumInput.isVisible().catch(() => false)) {
      await chapterNumInput.fill(String(chapter.number));
    }

    await page.getByPlaceholder('请输入标题').fill(chapter.title);
    const editor = page.locator('.ProseMirror').first();
    await editor.click();
    await editor.fill(chapter.content);
    console.log(`已填写章节内容，字数 ${chapter.content.length}`);

    const saveDraftBtn = page.getByRole('button', { name: '存草稿' }).first();
    if (await saveDraftBtn.isVisible().catch(() => false)) {
      await saveDraftBtn.click();
      await page.waitForTimeout(1500);
      console.log('已保存草稿');
    }

    let dialogState = { reachedPublishDialog: false };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      console.log(`点击“下一步”... 第 ${attempt + 1} 次`);
      const nextBtn = page.getByRole('button', { name: '下一步' }).first();
      await nextBtn.click({ force: true });
      await page.waitForTimeout(1500);

      dialogState = await waitForDialogSequence(page, {
        maxAttempts: 18,
        emptyPollLimit: 6,
        idleDelay: 800
      });

      if (dialogState.reachedPublishDialog) {
        break;
      }

      const handledSidebar = await handleProofreadingSidebar(page);
      if (!handledSidebar) {
        break;
      }
    }

    const publishDialog = page.locator('[role="dialog"]').filter({ hasText: '发布设置' }).first();
    if (!dialogState.reachedPublishDialog) {
      console.log('未等到“发布设置”弹窗，保存截图 fanqie-error2.png');
      await page.screenshot({ path: 'fanqie-error2.png', fullPage: true });
      return;
    }

    console.log('填写发布设置...');
    const titleInput = publishDialog.locator('input[type="text"], input:not([type]), textarea').first();
    const publishDialogInputs = await publishDialog.locator('input, textarea').evaluateAll((nodes) => (
      nodes.map((node) => ({
        tag: node.tagName,
        type: node.getAttribute('type') || '',
        value: node.getAttribute('value') || '',
        placeholder: node.getAttribute('placeholder') || ''
      }))
    )).catch(() => []);
    console.log(`发布设置输入控件: ${JSON.stringify(publishDialogInputs)}`);
    await page.screenshot({ path: 'fanqie-publish-dialog.png', fullPage: true });

    if (await titleInput.isVisible().catch(() => false)) {
      await titleInput.fill('独门修炼');
    } else {
      console.log('发布设置里没有可见文本输入框，跳过书名填写');
    }

    const aiNoLabel = publishDialog.getByText('否', { exact: true }).last();
    if (await aiNoLabel.isVisible().catch(() => false)) {
      await aiNoLabel.click({ force: true });
      await page.waitForTimeout(300);
      console.log('发布设置: 已点击“否”标签');
    }

    const aiRadios = publishDialog.locator('input[type="radio"]');
    if (await aiRadios.count().catch(() => 0)) {
      await aiRadios.last().evaluate((node) => {
        node.checked = true;
        node.dispatchEvent(new Event('input', { bubbles: true }));
        node.dispatchEvent(new Event('change', { bubbles: true }));
      });
      console.log('发布设置: 已选择“不使用 AI”');
    }

    const radioStates = await aiRadios.evaluateAll((nodes) => (
      nodes.map((node) => ({ value: node.value, checked: node.checked }))
    )).catch(() => []);
    console.log(`发布设置 radio 状态: ${JSON.stringify(radioStates)}`);

    console.log('点击“确认发布”...');
    const confirmBtn = publishDialog.getByRole('button', { name: '确认发布' }).first();
    await confirmBtn.click({ force: true });
    await page.waitForTimeout(5000);

    const publishDialogStillVisible = await publishDialog.isVisible().catch(() => false);
    console.log(`确认发布后弹窗仍可见: ${publishDialogStillVisible}`);

    const successToast = await page.getByText(/发布成功|提交成功|审核中/).isVisible().catch(() => false);
    if (successToast) {
      console.log('发布成功');
    } else {
      console.log('发布结果未知，保存截图 fanqie-after-next.png');
      await page.screenshot({ path: 'fanqie-after-next.png', fullPage: true });
    }

    console.log('按回车关闭浏览器...');
    await new Promise((resolve) => process.stdin.once('data', resolve));
  } finally {
    await browserContext.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

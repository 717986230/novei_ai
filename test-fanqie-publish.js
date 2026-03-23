/**
 * 番茄小说发布测试脚本 v2
 * 直接使用现有的书籍ID
 */
const { chromium } = require('playwright');
const fs = require('fs');

const FANQIE_ORIGIN = 'https://fanqienovel.com';

// 从调试结果得到的书籍ID
const BOOK_ID = '7619924757198146585';
const WRITER_EDITOR_URL = `${FANQIE_ORIGIN}/main/writer/${BOOK_ID}/publish/?enter_from=novel_ai_auto`;

const config = {
  label: '番茄小说',
  loginMode: 'cookies',
  cookies: 'x-web-secsdk-uid=34c2d9b8-2d97-45af-8a71-68bb36583a27; Hm_lvt_2667d29c8e792e6fa9182c20a3013175=1774151687; Hm_lpvt_2667d29c8e792e6fa9182c20a3013175=1774151687; HMACCOUNT=2D7E1AD02EEC1D30; s_v_web_id=verify_mn183uvx_DJhQzZeA_2ubl_4N8j_9NGY_nH2vOcKNVLEf; csrf_session_id=61ea8541cb6d31e0e830fead0033892c; novel_web_id=7619923511318742563; serial_uuid=7619923511318742563; serial_webid=7619923511318742563; gfkadpd=2503,36144; passport_csrf_token=64fd26b48abe6fbea826275cfbe644c3; passport_csrf_token_default=64fd26b48abe6fbea826275cfbe644c3; passport_mfa_token=Ci8PIidri5v4Hc1duqDkPIk%2FKBffIKL9PqYlBMtJ%2FPxsUIYAfiLJBszYkucr3dsBixpKCjwAAAAAAAAAAAAAUDaVm8AnH5bvTYOeZYoFEFgQyG03YxNgbPNMfueN65c%2ByrW4pPTxeTUkj6jq2w8R2wUQn%2BGMDhj2sdFsIAIiAQPygfYy; d_ticket=1d930ba5f211c1fe6f35172550c550b04afa2; odin_tt=454788c1acb0a6e94a4b554ce44410cba6565cc40bf1cfc448ec35362a1fa39649a18d23cf82d7933f89ce41cc579b8f; n_mh=EmJHqh7JpAAeAtDS4X_xrGh5ZJzNCIXE8VbGSw8Dnl4; sid_guard=6a655fc22a944dc3a4fb17c1aa5b12e2%7C1774151926%7C5184000%7CThu%2C+21-May-2026+03%3A58%3A46+GMT; uid_tt=f23301253ab570f5e88783ae87a72dd8; uid_tt_ss=f23301253ab570f5e88783ae87a72dd8; sid_tt=6a655fc22a944dc3a4fb17c1aa5b12e2; sessionid=6a655fc22a944dc3a4fb17c1aa5b12e2; sessionid_ss=6a655fc22a944dc3a4fb17c1aa5b12e2; session_tlb_tag=sttt%7C10%7CamVfwiqUTcOk-xfBqlsS4v________-07tro1jmxE_IkkIyYZTSHwyQeSBd2LNAE8B3AQm20rfc%3D; is_staff_user=false; sid_ucp_v1=1.0.0-KDViMDg3MzM3ZDYyYjlhOGJmYTQ3NjMxN2ZjYWJiYmI0MmY2ZDQyNmUKHQilh_WvugIQ9tH9zQYYxxMgDDDum77SBTgCQO8HGgJsZiIgNmE2NTVmYzIyYTk0NGRjM2E0ZmIxN2MxYWE1YjEyZTI; ssid_ucp_v1=1.0.0-KDViMDg3MzM3ZDYyYjlhOGJmYTQ3NjMxN2ZjYWJiYmI0MmY2ZDQyNmUKHQilh_WvugIQ9tH9zQYYxxMgDDDum77SBTgCQO8HGgJsZiIgNmE2NTVmYzIyYTk0NGRjM2E0ZmIxN2MxYWE1YjEyZTI; ttwid=1%7CjUfcU_dT_0xto0Ljx7rpvrHbWQo1JBn_MRSYhIVjHXg%7C1774152113%7Cd1255eff264ccd799999961f58933636ecb22ebc1fc0b907bb5fa0502fe2b46b'
};

async function parseCookieHeader(cookieHeader) {
  return cookieHeader
    .split(';')
    .map(pair => pair.trim())
    .filter(Boolean)
    .map(pair => {
      const index = pair.indexOf('=');
      if (index <= 0) return null;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (!name) return null;
      return { name, value, domain: '.fanqienovel.com', path: '/', secure: true, sameSite: 'Lax' };
    })
    .filter(Boolean);
}

// 读取测试章节
const chapter = JSON.parse(fs.readFileSync('./output/books/独门修炼/chapters/chapter_0002.json', 'utf-8'));

console.log('='.repeat(50));
console.log('番茄小说发布测试');
console.log('='.repeat(50));
console.log(`\n📖 章节: ${chapter.number} - ${chapter.title}`);
console.log(`   字数: ${chapter.content.length}`);

async function dismissBlockingDialogs(page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const dialogs = page.locator('[role="dialog"]');
    const count = await dialogs.count().catch(() => 0);
    let dismissed = false;

    for (let index = 0; index < count; index += 1) {
      const dialog = dialogs.nth(index);
      if (!(await dialog.isVisible().catch(() => false))) continue;

      const text = (await dialog.textContent().catch(() => '')).trim();
      if (!text || text.includes('发布设置')) continue;

      // 尝试关闭
      const closeBtn = dialog.locator('.arco-modal-close-btn, .close-btn, [class*="close"]').first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click({ force: true });
        await page.waitForTimeout(300);
        dismissed = true;
        break;
      }
    }

    if (!dismissed) return;
  }
}

async function main() {
  console.log('\n🚀 启动浏览器...');
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const browserContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });

  const cookies = await parseCookieHeader(config.cookies);
  await browserContext.addCookies(cookies);
  console.log(`   已添加 ${cookies.length} 个cookies`);

  const page = await browserContext.newPage();

  // 直接打开书籍编辑页面
  console.log(`\n📖 打开书籍编辑页: ${WRITER_EDITOR_URL}`);
  await page.goto(WRITER_EDITOR_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // 等待编辑器加载
  console.log('   等待编辑器加载...');
  try {
    await page.waitForFunction(() => /\/main\/writer\/\d+\/publish/.test(window.location.href), { timeout: 15000 });
    await page.getByPlaceholder('请输入标题').waitFor({ timeout: 15000 });
    console.log('   ✅ 编辑器已加载');
  } catch (e) {
    console.log('   ⚠️ 编辑器加载超时，尝试继续...');
    await page.waitForTimeout(2000);
  }

  // 关闭可能弹出的对话框
  await dismissBlockingDialogs(page);

  // 填写章节信息
  console.log('\n📝 填写章节内容...');

  // 章节序号
  const chapterNumInput = page.locator('input.serial-input').first();
  if (await chapterNumInput.isVisible().catch(() => false)) {
    await chapterNumInput.fill(String(chapter.number));
    console.log('   - 已填写章节序号');
  }

  // 章节标题
  await page.getByPlaceholder('请输入标题').fill(chapter.title);
  console.log('   - 已填写章节标题');

  // 章节内容
  const editor = page.locator('.ProseMirror').first();
  await editor.click();
  await editor.fill(chapter.content);
  console.log(`   - 已填写章节内容 (${chapter.content.length} 字)`);

  // 保存草稿
  const saveDraftBtn = page.getByRole('button', { name: '存草稿' });
  if (await saveDraftBtn.isVisible().catch(() => false)) {
    await saveDraftBtn.click();
    await page.waitForTimeout(1500);
    console.log('   - 已保存草稿');
  }

  // 点击下一步
  console.log('\n⬇️ 点击下一步...');
  const nextBtn = page.getByRole('button', { name: '下一步' }).first();
  await nextBtn.click({ force: true });
  await page.waitForTimeout(2000);

  // 处理风险检测弹窗
  const riskDialog = page.getByText(/风险检测|内容风险检测/).first();
  if (await riskDialog.isVisible().catch(() => false)) {
    console.log('   处理风险检测弹窗...');
    const cancelBtn = page.getByRole('button', { name: /取消|暂不检测|稍后再说/ }).last();
    if (await cancelBtn.isVisible().catch(() => false)) {
      await cancelBtn.click({ force: true });
      await page.waitForTimeout(1000);
    }
  }

  // 等待发布设置对话框
  console.log('   等待发布设置对话框...');
  const publishDialog = page.locator('[role="dialog"]').filter({ hasText: '发布设置' }).first();

  try {
    await publishDialog.waitFor({ timeout: 10000 });
    console.log('   ✅ 找到发布设置对话框');

    // 填写书名
    const titleInput = publishDialog.locator('input').first();
    await titleInput.fill('独门修炼');

    // 选择AI辅助
    const aiRadio = publishDialog.getByRole('radio', { name: '是' });
    if (await aiRadio.isVisible().catch(() => false)) {
      await aiRadio.check({ force: true });
    }

    // 点击确认发布
    console.log('\n🚀 点击确认发布...');
    const confirmBtn = publishDialog.getByRole('button', { name: '确认发布' });
    await confirmBtn.click({ force: true });

    // 等待发布完成
    await page.waitForTimeout(3000);

    // 检查是否成功
    const successToast = await page.getByText(/发布成功|提交成功|审核中/).isVisible().catch(() => false);
    if (successToast) {
      console.log('\n✅ 发布成功!');
    } else {
      console.log('\n⚠️ 发布结果未知，请检查浏览器');
    }

  } catch (e) {
    console.log(`   ❌ 等待发布设置对话框失败: ${e.message}`);
    console.log('   截图保存当前状态...');
    await page.screenshot({ path: 'fanqie-error.png', fullPage: true });
  }

  console.log('\n按回车键关闭浏览器...');
  await new Promise(resolve => process.stdin.once('data', resolve));

  await browserContext.close();
  await browser.close();
}

main().catch(console.error);
/**
 * 番茄小说发布调试脚本 - 检查下一步后的状态
 */
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

const chapter = JSON.parse(fs.readFileSync('./output/books/独门修炼/chapters/chapter_0002.json', 'utf-8'));

async function main() {
  console.log('🚀 启动浏览器...');
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const browserContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });

  const cookies = await parseCookieHeader(config.cookies);
  await browserContext.addCookies(cookies);

  const page = await browserContext.newPage();

  console.log('📖 打开书籍编辑页...');
  await page.goto(WRITER_EDITOR_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // 等待编辑器加载
  await page.waitForFunction(() => /\/main\/writer\/\d+\/publish/.test(window.location.href), { timeout: 15000 });
  await page.getByPlaceholder('请输入标题').waitFor({ timeout: 15000 });
  console.log('✅ 编辑器已加载');

  // 填写章节内容
  console.log('📝 填写章节内容...');
  const chapterNumInput = page.locator('input.serial-input').first();
  if (await chapterNumInput.isVisible().catch(() => false)) {
    await chapterNumInput.fill(String(chapter.number));
  }
  await page.getByPlaceholder('请输入标题').fill(chapter.title);
  const editor = page.locator('.ProseMirror').first();
  await editor.click();
  await editor.fill(chapter.content);
  console.log('   内容已填写');

  // 点击下一步
  console.log('\n⬇️ 点击下一步...');
  const nextBtn = page.getByRole('button', { name: '下一步' }).first();
  await nextBtn.click({ force: true });
  await page.waitForTimeout(3000);

  // 截图
  await page.screenshot({ path: 'fanqie-after-next.png', fullPage: true });

  // 检查所有弹窗
  const dialogs = page.locator('[role="dialog"]');
  const dialogCount = await dialogs.count().catch(() => 0);
  console.log(`\n📊 发现 ${dialogCount} 个对话框`);

  for (let i = 0; i < dialogCount; i++) {
    const dialog = dialogs.nth(i);
    const isVisible = await dialog.isVisible().catch(() => false);
    if (isVisible) {
      const text = await dialog.textContent().catch(() => '');
      console.log(`\n对话框 ${i}: ${text.slice(0, 200)}...`);
    }
  }

  // 检查是否有包含"风险检测"的弹窗
  const riskDialog = page.locator('[role="dialog"]').filter({ hasText: '风险检测' }).first();
  const riskVisible = await riskDialog.isVisible().catch(() => false);
  console.log(`\n风险检测弹窗可见: ${riskVisible}`);

  if (riskVisible) {
    console.log('点击"暂不检测"...');
    const skipBtn = riskDialog.getByRole('button', { name: '暂不检测' });
    if (await skipBtn.isVisible().catch(() => false)) {
      await skipBtn.click({ force: true });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'fanqie-after-skip-risk.png', fullPage: true });
    }
  }

  // 检查发布设置弹窗
  const publishDialog = page.locator('[role="dialog"]').filter({ hasText: '发布设置' }).first();
  const publishVisible = await publishDialog.isVisible().catch(() => false);
  console.log(`\n发布设置弹窗可见: ${publishVisible}`);

  console.log('\n按回车键关闭浏览器...');
  await new Promise(resolve => process.stdin.once('data', resolve));

  await browserContext.close();
  await browser.close();
}

main().catch(console.error);
/**
 * 番茄小说发布调试脚本
 * 带详细日志输出
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FANQIE_ORIGIN = 'https://fanqienovel.com';
const WRITER_HOME_URL = `${FANQIE_ORIGIN}/main/writer/?enter_from=author_zone`;

const config = {
  label: '番茄小说',
  loginMode: 'cookies',
  cookies: 'x-web-secsdk-uid=34c2d9b8-2d97-45af-8a71-68bb36583a27; Hm_lvt_2667d29c8e792e6fa9182c20a3013175=1774151687; Hm_lpvt_2667d29c8e792e6fa9182c20a3013175=1774151687; HMACCOUNT=2D7E1AD02EEC1D30; s_v_web_id=verify_mn183uvx_DJhQzZeA_2ubl_4N8j_9NGY_nH2vOcKNVLEf; csrf_session_id=61ea8541cb6d31e0e830fead0033892c; novel_web_id=7619923511318742563; serial_uuid=7619923511318742563; serial_webid=7619923511318742563; gfkadpd=2503,36144; passport_csrf_token=64fd26b48abe6fbea826275cfbe644c3; passport_csrf_token_default=64fd26b48abe6fbea826275cfbe644c3; passport_mfa_token=Ci8PIidri5v4Hc1duqDkPIk%2FKBffIKL9PqYlBMtJ%2FPxsUIYAfiLJBszYkucr3dsBixpKCjwAAAAAAAAAAAAAUDaVm8AnH5bvTYOeZYoFEFgQyG03YxNgbPNMfueN65c%2ByrW4pPTxeTUkj6jq2w8R2wUQn%2BGMDhj2sdFsIAIiAQPygfYy; d_ticket=1d930ba5f211c1fe6f35172550c550b04afa2; odin_tt=454788c1acb0a6e94a4b554ce44410cba6565cc40bf1cfc448ec35362a1fa39649a18d23cf82d7933f89ce41cc579b8f; n_mh=EmJHqh7JpAAeAtDS4X_xrGh5ZJzNCIXE8VbGSw8Dnl4; sid_guard=6a655fc22a944dc3a4fb17c1aa5b12e2%7C1774151926%7C5184000%7CThu%2C+21-May-2026+03%3A58%3A46+GMT; uid_tt=f23301253ab570f5e88783ae87a72dd8; uid_tt_ss=f23301253ab570f5e88783ae87a72dd8; sid_tt=6a655fc22a944dc3a4fb17c1aa5b12e2; sessionid=6a655fc22a944dc3a4fb17c1aa5b12e2; sessionid_ss=6a655fc22a944dc3a4fb17c1aa5b12e2; session_tlb_tag=sttt%7C10%7CamVfwiqUTcOk-xfBqlsS4v________-07tro1jmxE_IkkIyYZTSHwyQeSBd2LNAE8B3AQm20rfc%3D; is_staff_user=false; sid_ucp_v1=1.0.0-KDViMDg3MzM3ZDYyYjlhOGJmYTQ3NjMxN2ZjYWJiYmI0MmY2ZDQyNmUKHQilh_WvugIQ9tH9zQYYxxMgDDDum77SBTgCQO8HGgJsZiIgNmE2NTVmYzIyYTk0NGRjM2E0ZmIxN2MxYWE1YjEyZTI; ssid_ucp_v1=1.0.0-KDViMDg3MzM3ZDYyYjlhOGJmYTQ3NjMxN2ZjYWJiYmI0MmY2ZDQyNmUKHQilh_WvugIQ9tH9zQYYxxMgDDDum77SBTgCQO8HGgJsZiIgNmE2NTVmYzIyYTk0NGRjM2E0ZmIxN2MxYWE1YjEyZTI; ttwid=1%7CjUfcU_dT_0xto0Ljx7rpvrHbWQo1JBn_MRSYhIVjHXg%7C1774152113%7Cd1255eff264ccd799999961f58933636ecb22ebc1fc0b907bb5fa0502fe2b46b',
  username: '13835279698',
  password: '600327qweR'
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

async function main() {
  console.log('启动浏览器...');
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const browserContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });

  // 添加cookies
  const cookies = await parseCookieHeader(config.cookies);
  await browserContext.addCookies(cookies);
  console.log(`已添加 ${cookies.length} 个cookies`);

  const page = await browserContext.newPage();

  // 访问作家专区
  console.log('\n访问作家主页...');
  await page.goto(WRITER_HOME_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // 检查登录状态
  console.log('\n检查登录状态...');
  const accountInfo = await page.evaluate(async () => {
    try {
      const response = await fetch('/api/author/account/info/v0/?aid=2503&app_name=muye_novel', { credentials: 'include' });
      return response.json();
    } catch (e) {
      return null;
    }
  });

  console.log('账户信息:', JSON.stringify(accountInfo, null, 2));

  if (accountInfo?.code === 0 && accountInfo?.data?.author_name) {
    console.log(`✅ 已登录，作者: ${accountInfo.data.author_name}`);
  } else {
    console.log('❌ 未登录，需要重新获取cookies');
  }

  // 获取书籍列表
  console.log('\n获取书籍列表...');
  const bookList = await page.evaluate(async () => {
    try {
      const response = await fetch('/api/author/homepage/book_list/v0/?aid=2503&app_name=muye_novel&page_count=20&page_index=0', { credentials: 'include' });
      return response.json();
    } catch (e) {
      return null;
    }
  });

  console.log('书籍列表:', JSON.stringify(bookList, null, 2));

  if (bookList?.data?.book_list?.length > 0) {
    console.log(`\n📚 发现 ${bookList.data.book_list.length} 本书:`);
    bookList.data.book_list.forEach(book => {
      console.log(`   - ${book.book_name} (ID: ${book.book_id}, 章节数: ${book.chapter_number})`);
    });
  } else {
    console.log('\n📚 没有找到任何书籍');
  }

  // 截图保存当前状态
  await page.screenshot({ path: 'fanqie-debug.png', fullPage: true });
  console.log('\n📸 截图已保存到 fanqie-debug.png');

  console.log('\n按回车键关闭浏览器...');
  await new Promise(resolve => process.stdin.once('data', resolve));

  await browserContext.close();
  await browser.close();
}

main().catch(console.error);
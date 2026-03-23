import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const platform = (process.argv[2] || '').trim().toLowerCase();
const browser = (process.argv[3] || 'chrome').trim().toLowerCase();

const PLATFORM_MAP = {
  fanqie: {
    url: 'https://fanqienovel.com',
    cookieUrls: ['https://fanqienovel.com', 'https://www.fanqienovel.com'],
    validateUrl: 'https://fanqienovel.com/main/writer/'
  },
  qidian: {
    url: 'https://write.qq.com/portal/login',
    cookieUrls: [
      'https://write.qq.com',
      'https://www.qidian.com',
      'https://qidian.com',
      'https://my.qidian.com'
    ],
    validateUrl: 'https://write.qq.com/portal'
  },
  qimao: {
    url: 'https://www.qimao.com',
    cookieUrls: ['https://www.qimao.com', 'https://qimao.com']
  },
  douyin: {
    url: 'https://www.douyin.com',
    cookieUrls: ['https://www.douyin.com', 'https://douyin.com']
  },
  zongheng: {
    url: 'https://www.zongheng.com',
    cookieUrls: ['https://www.zongheng.com', 'https://zongheng.com']
  },
  '17k': {
    url: 'https://www.17k.com',
    cookieUrls: ['https://www.17k.com', 'https://17k.com']
  },
  custom: {
    url: 'https://example.com',
    cookieUrls: ['https://example.com']
  }
};

const BROWSER_MAP = {
  chrome: {
    executablePath: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ],
    userDataDir: path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data'),
    profileDirectory: 'Default'
  },
  edge: {
    executablePath: [
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ],
    userDataDir: path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data'),
    profileDirectory: 'Default'
  }
};

function print(result) {
  process.stdout.write(JSON.stringify(result));
}

function normalizeErrorMessage(error) {
  const message = error?.message || 'Browser session import failed';
  if (
    message.includes('Target page, context or browser has been closed') ||
    message.includes('SingletonLock') ||
    message.includes('exitCode=21')
  ) {
    return '无法占用当前浏览器配置文件。请先关闭 Chrome/Edge 后重试导入。';
  }
  return message;
}

function resolveExecutable(config) {
  return config.executablePath.find((candidate) => fs.existsSync(candidate)) || '';
}

async function isAuthenticated(page, platform) {
  const currentUrl = page.url();
  const bodyText = await page.locator('body').textContent().catch(() => '');

  if (platform === 'qidian') {
    if (currentUrl.includes('/portal/login')) {
      return false;
    }
    if (bodyText.includes('登录') || bodyText.includes('成为作家')) {
      return false;
    }
    return true;
  }

  if (platform === 'fanqie') {
    if (currentUrl.includes('/login')) {
      return false;
    }
    return !bodyText.includes('登录');
  }

  return true;
}

function shouldFallbackToProfileCopy(error) {
  const message = error?.message || '';
  return (
    message.includes('Target page, context or browser has been closed')
    || message.includes('SingletonLock')
    || message.includes('exitCode=21')
  );
}

function copyBrowserProfile(sourceDir) {
  const tempDir = path.join(os.tmpdir(), `novel-ai-browser-import-${Date.now()}`);
  fs.cpSync(sourceDir, tempDir, {
    recursive: true,
    filter: (sourcePath) => {
      const baseName = path.basename(sourcePath);
      if (
        baseName.startsWith('Singleton')
        || baseName === 'lockfile'
        || baseName === 'LOCK'
        || baseName.endsWith('.log')
      ) {
        return false;
      }
      return true;
    }
  });
  return tempDir;
}

async function launchProfileContext(browserConfig, executablePath) {
  try {
    return {
      context: await chromium.launchPersistentContext(browserConfig.userDataDir, {
        headless: true,
        executablePath,
        args: [`--profile-directory=${browserConfig.profileDirectory}`]
      }),
      cleanupDir: ''
    };
  } catch (error) {
    if (!shouldFallbackToProfileCopy(error)) {
      throw error;
    }

    const copiedProfileDir = copyBrowserProfile(browserConfig.userDataDir);
    try {
      const context = await chromium.launchPersistentContext(copiedProfileDir, {
        headless: true,
        executablePath,
        args: [`--profile-directory=${browserConfig.profileDirectory}`]
      });
      return { context, cleanupDir: copiedProfileDir };
    } catch (copyError) {
      fs.rmSync(copiedProfileDir, { recursive: true, force: true });
      throw copyError;
    }
  }
}

async function main() {
  const platformConfig = PLATFORM_MAP[platform];
  if (!platformConfig) {
    print({ success: false, error: `Unsupported platform: ${platform}`, platform, browser });
    process.exit(0);
  }

  const browserConfig = BROWSER_MAP[browser] || BROWSER_MAP.chrome;
  const executablePath = resolveExecutable(browserConfig);
  if (!executablePath) {
    print({ success: false, error: `Browser not found: ${browser}`, platform, browser });
    process.exit(0);
  }

  if (!fs.existsSync(browserConfig.userDataDir)) {
    print({
      success: false,
      error: `Browser profile directory not found: ${browserConfig.userDataDir}`,
      platform,
      browser
    });
    process.exit(0);
  }

  let context;
  let cleanupDir = '';
  try {
    const launchResult = await launchProfileContext(browserConfig, executablePath);
    context = launchResult.context;
    cleanupDir = launchResult.cleanupDir;

    const page = context.pages()[0] || await context.newPage();
    await page.goto(platformConfig.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    const cookies = await context.cookies(platformConfig.cookieUrls);
    const cookieHeader = cookies
      .filter((cookie) => cookie.name && cookie.value)
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');

    if (!cookieHeader) {
      print({
        success: false,
        error: 'No login cookies found. If your browser is open, close it and try again.',
        platform,
        browser,
        sourceUrl: platformConfig.url
      });
      process.exit(0);
    }

    if (platformConfig.validateUrl) {
      await page.goto(platformConfig.validateUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      const authenticated = await isAuthenticated(page, platform);
      if (!authenticated) {
        print({
          success: false,
          error: 'Imported browser cookies exist, but the browser session is not logged in for this platform.',
          platform,
          browser,
          sourceUrl: platformConfig.validateUrl,
          cookieCount: cookies.length,
          cookies: cookieHeader
        });
        process.exit(0);
      }
    }

    print({
      success: true,
      message: 'Imported browser session successfully.',
      platform,
      browser,
      sourceUrl: platformConfig.url,
      cookieCount: cookies.length,
      cookies: cookieHeader
    });
  } catch (error) {
    print({
      success: false,
      error: normalizeErrorMessage(error),
      platform,
      browser,
      sourceUrl: platformConfig?.url || ''
    });
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
    if (cleanupDir) {
      fs.rmSync(cleanupDir, { recursive: true, force: true });
    }
  }
}

main();

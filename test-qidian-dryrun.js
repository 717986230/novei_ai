const fs = require('fs');
const path = require('path');
const { QidianPublisher } = require('./src/platforms/qidian');

function loadSettings() {
  const settingsPath = path.join(__dirname, 'config', 'settings.json');
  return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
}

function loadChapter() {
  const chapterPath = path.join(__dirname, 'output', 'books', '独门修炼', 'chapters', 'chapter_0002.json');
  return JSON.parse(fs.readFileSync(chapterPath, 'utf-8'));
}

async function main() {
  const settings = loadSettings();
  const config = { ...(settings.platforms?.qidian || {}) };
  if (process.env.QIDIAN_COOKIES && process.env.QIDIAN_COOKIES.trim()) {
    config.loginMode = 'cookies';
    config.cookies = process.env.QIDIAN_COOKIES.trim();
  }
  const chapter = loadChapter();

  console.log('='.repeat(50));
  console.log('起点 dry-run 登录验证');
  console.log('='.repeat(50));
  console.log(`账号: ${config.username || '未配置'}`);
  console.log(`模式: ${config.loginMode || '未配置'}`);

  const publisher = new QidianPublisher(config, {
    headless: false,
    slowMo: 300
  });

  try {
    const result = await publisher.publishChapter(chapter, {
      dryRun: true,
      novelInfo: { title: '独门修炼' }
    });

    console.log('\n验证结果:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('\n验证失败:', error.message);
    process.exitCode = 1;
  }
}

main().catch(console.error);

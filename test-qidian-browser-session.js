const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { QidianPublisher } = require('./src/platforms/qidian');

function loadChapter() {
  const chapterPath = path.join(__dirname, 'output', 'books', '独门修炼', 'chapters', 'chapter_0002.json');
  return JSON.parse(fs.readFileSync(chapterPath, 'utf-8'));
}

function importBrowserSession(browser = 'edge') {
  const scriptPath = path.join(__dirname, 'scripts', 'import-browser-session.mjs');
  const output = execFileSync('node', [scriptPath, 'qidian', browser], {
    cwd: __dirname,
    encoding: 'utf-8'
  });
  return JSON.parse(output);
}

async function main() {
  console.log('='.repeat(50));
  console.log('起点浏览器会话联调');
  console.log('='.repeat(50));

  const imported = importBrowserSession(process.argv[2] || 'edge');
  console.log('导入结果:');
  console.log(JSON.stringify(imported, null, 2));

  if (!imported.success || !imported.cookies) {
    process.exitCode = 1;
    return;
  }

  const publisher = new QidianPublisher({
    label: '起点中文网',
    loginMode: 'cookies',
    cookies: imported.cookies
  }, {
    headless: false,
    slowMo: 300
  });

  const chapter = loadChapter();

  try {
    const result = await publisher.publishChapter(chapter, {
      dryRun: true,
      novelInfo: { title: '独门修炼' }
    });
    console.log('dry-run 结果:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('dry-run 失败:', error.message);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

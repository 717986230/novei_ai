/**
 * 番茄小说发布测试脚本
 * 用法: node test-fanqie.js
 */
const { FanqiePublisher } = require('./src/platforms/fanqie');
const { loadConfig } = require('./src/config');
const path = require('path');
const fs = require('fs');

async function main() {
  console.log('='.repeat(50));
  console.log('番茄小说自动发布测试');
  console.log('='.repeat(50));

  // 加载配置
  const config = loadConfig();
  const fanqieConfig = config.platforms?.fanqie;

  if (!fanqieConfig?.enabled) {
    console.log('❌ 番茄小说平台未启用');
    process.exit(1);
  }

  console.log('\n📋 平台配置:');
  console.log(`   标签: ${fanqieConfig.label}`);
  console.log(`   登录模式: ${fanqieConfig.loginMode}`);
  console.log(`   Cookies: ${fanqieConfig.cookies ? '已配置' : '未配置'}`);
  console.log(`   账号: ${fanqieConfig.username || '未配置'}`);

  // 读取测试章节
  const testChapterPath = path.join(__dirname, 'output/books/独门修炼/chapters/chapter_0002.json');

  if (!fs.existsSync(testChapterPath)) {
    console.log('\n❌ 测试章节文件不存在');
    process.exit(1);
  }

  const chapter = JSON.parse(fs.readFileSync(testChapterPath, 'utf-8'));

  console.log('\n📖 测试章节信息:');
  console.log(`   章节号: ${chapter.number}`);
  console.log(`   标题: ${chapter.title}`);
  console.log(`   字数: ${chapter.content.length}`);
  console.log(`   已发布: ${chapter.published}`);

  if (chapter.content.length < 1000) {
    console.log('\n❌ 内容太短，番茄小说要求至少1000字');
    process.exit(1);
  }

  console.log('\n🚀 开始发布测试 (显示浏览器)...');

  // 创建发布器 (非headless模式，可以看浏览器操作)
  const publisher = new FanqiePublisher(fanqieConfig, {
    headless: false, // 显示浏览器
    slowMo: 300     // 减慢操作速度，方便观察
  });

  try {
    const result = await publisher.publishChapter(chapter, {
      novelInfo: {
        title: '独门修炼'
      },
      dryRun: false // 实际发布
    });

    console.log('\n📊 发布结果:');
    console.log(JSON.stringify(result, null, 2));

    if (result.published) {
      console.log('\n✅ 发布成功!');
    } else {
      console.log('\n⚠️ 发布未完成');
    }
  } catch (error) {
    console.error('\n❌ 发布失败:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
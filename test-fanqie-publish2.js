const { FanqiePublisher } = require('./src/platforms/fanqie');
const { fanqieConfig, loadFanqieChapter } = require('./scripts/fanqie-test-common');

const chapter = loadFanqieChapter();

console.log('='.repeat(50));
console.log('番茄小说发布测试 v3');
console.log('='.repeat(50));
console.log(`\n📖 章节: ${chapter.number} - ${chapter.title}`);
console.log(`   字数: ${chapter.content.length}`);

async function main() {
  console.log('\n🚀 启动发布测试 (显示浏览器)...');

  const publisher = new FanqiePublisher(fanqieConfig, {
    headless: false,
    slowMo: 300
  });

  try {
    const result = await publisher.publishChapter(chapter, {
      novelInfo: { title: '独门修炼' }
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
    process.exitCode = 1;
  }
}

main().catch(console.error);

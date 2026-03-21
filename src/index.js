const inquirer = require('inquirer');
const AIWriter = require('./ai/writer');
const NovelGenerator = require('./novel/generator');
const ChapterManager = require('./novel/chapter');
const Storage = require('./novel/storage');
const Scheduler = require('./scheduler');
const { loadConfig } = require('./config');

const settings = loadConfig();

class NovelAIPublisher {
  constructor() {
    this.aiWriter = new AIWriter(settings.ai);
    this.storage = new Storage(settings.novel.outputDir, settings.mysql);
    this.chapterManager = new ChapterManager(this.storage);
    this.generator = new NovelGenerator(this.aiWriter, this.chapterManager, this.storage);
    this.scheduler = new Scheduler(this.generator, this.chapterManager, settings.schedule);
  }

  async start() {
    console.log('='.repeat(50));
    console.log('    自动写小说多平台发布系统');
    console.log('='.repeat(50));

    const args = process.argv.slice(2);

    if (args.includes('--test')) {
      await this.testAI();
      return;
    }

    if (args.includes('--generate')) {
      await this.generateNovel();
      return;
    }

    if (args.includes('--publish')) {
      await this.publishChapters();
      return;
    }

    if (args.includes('--schedule')) {
      this.startScheduler();
      return;
    }

    await this.showMenu();
  }

  async showMenu() {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: '请选择操作：',
        choices: [
          { name: '1. 创建新小说', value: 'create' },
          { name: '2. 生成下一章', value: 'generate' },
          { name: '3. 批量生成章节', value: 'generateBatch' },
          { name: '4. 发布章节', value: 'publish' },
          { name: '5. 测试 AI 连接', value: 'test' },
          { name: '0. 退出', value: 'exit' }
        ]
      }
    ]);

    switch (action) {
      case 'create':
        await this.createNewNovel();
        break;
      case 'generate':
        await this.generateChapter();
        break;
      case 'generateBatch':
        await this.generateNovel();
        break;
      case 'publish':
        await this.publishChapters();
        break;
      case 'test':
        await this.testAI();
        break;
      case 'exit':
        console.log('再见');
        process.exit(0);
        break;
      default:
        break;
    }
  }

  async createNewNovel() {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'title',
        message: '小说标题（可留空，由 AI 自动生成）：'
      },
      {
        type: 'input',
        name: 'type',
        message: '小说类型（如：都市、玄幻、仙侠、言情）：'
      },
      {
        type: 'input',
        name: 'description',
        message: '小说简介：'
      },
      {
        type: 'input',
        name: 'targetChapters',
        message: '计划总章节数（默认 3000）：',
        default: '3000'
      }
    ]);

    const title = answers.title && answers.title.trim()
      ? answers.title.trim()
      : await this.aiWriter.generateBookTitle({
          type: answers.type,
          description: answers.description
        });

    const novelInfo = {
      title,
      type: answers.type,
      description: answers.description,
      targetChapters: parseInt(answers.targetChapters, 10),
      wordsPerChapter: settings.novel.wordsPerChapter || 2000,
      createdAt: new Date().toISOString()
    };

    await this.storage.saveNovelInfo(novelInfo);
    console.log(`AI 书名：${novelInfo.title}`);
    console.log(`小说《${novelInfo.title}》创建成功`);

    await this.generator.generateOutline(novelInfo);
    console.log('大纲已生成');

    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: '是否立即生成下一章？',
        default: true
      }
    ]);

    if (proceed) {
      await this.generateChapter();
    }
  }

  async generateChapter() {
    const novelInfo = await this.storage.getNovelInfo();
    if (!novelInfo) {
      console.log('请先创建小说');
      return;
    }

    console.log(`正在为《${novelInfo.title}》生成章节...`);
    const chapter = await this.generator.generateNextChapter(novelInfo);
    console.log(`第 ${chapter.number} 章《${chapter.title}》已生成`);
    console.log(`字数：${chapter.content.length}`);
  }

  async generateNovel() {
    const novelInfo = await this.storage.getNovelInfo();
    if (!novelInfo) {
      console.log('请先创建小说');
      return;
    }

    const { count } = await inquirer.prompt([
      {
        type: 'input',
        name: 'count',
        message: '要生成多少章？',
        default: '1'
      }
    ]);

    for (let i = 0; i < parseInt(count, 10); i += 1) {
      const chapter = await this.generator.generateNextChapter(novelInfo);
      console.log(`第 ${chapter.number} 章生成完成`);
    }
  }

  async publishChapters() {
    const { PlatformPublisher } = require('./publish');
    const publisher = new PlatformPublisher(settings.platforms);
    const unpublished = await this.chapterManager.getUnpublishedChapters();

    if (!unpublished.length) {
      console.log('没有待发布的章节');
      return;
    }

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `确认发布 ${unpublished.length} 章到所有启用的平台？`,
        default: true
      }
    ]);

    if (!confirm) {
      return;
    }

    const results = await publisher.publish(unpublished);
    const successCount = results.filter((item) => item.success).length;
    console.log(`发布完成：成功 ${successCount} 章，失败 ${results.length - successCount} 章`);
  }

  startScheduler() {
    console.log('定时发布任务已启动');
    this.scheduler.start();
  }

  async testAI() {
    console.log('正在测试 AI 连接...');
    const result = await this.aiWriter.generate('你好，请用一句话介绍自己');
    console.log(result);
  }
}

const app = new NovelAIPublisher();
app.start().catch(console.error);

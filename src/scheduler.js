const cron = require('node-cron');
const { loadConfig } = require('./config');

class Scheduler {
  constructor(generator, chapterManager, config) {
    this.generator = generator;
    this.chapterManager = chapterManager;
    this.config = config;
    this.task = null;
    this.isRunning = false;
  }

  start() {
    if (!this.config.enabled) {
      console.log('定时发布功能未启用');
      return;
    }

    const publishTime = this.config.publishTime || '08:00';
    const [hour, minute] = publishTime.split(':');
    const cronExpression = `${minute} ${hour} * * *`;

    console.log(`定时任务已设置，每天 ${publishTime} 执行`);
    this.task = cron.schedule(cronExpression, async () => {
      await this.executePublish();
    }, {
      scheduled: true,
      timezone: 'Asia/Shanghai'
    });
  }

  stop() {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('定时任务已停止');
    }
  }

  async executePublish() {
    if (this.isRunning) {
      console.log('上一轮发布尚未完成，跳过本次任务');
      return;
    }

    this.isRunning = true;
    console.log('开始执行定时发布任务');

    try {
      const chaptersPerDay = this.config.chaptersPerDay || 3;
      const unpublished = await this.chapterManager.getUnpublishedChapters();

      if (!unpublished.length) {
        console.log('没有待发布章节');
        return;
      }

      const { PlatformPublisher } = require('./publish');
      const settings = loadConfig();
      const publisher = new PlatformPublisher(settings.platforms);
      const toPublish = unpublished.slice(0, chaptersPerDay);
      const results = await publisher.publish(toPublish);

      for (const result of results) {
        if (result.success) {
          await this.chapterManager.markAsPublished(result.chapter, 'all');
        }
      }

      const successCount = results.filter((item) => item.success).length;
      console.log(`定时发布完成：成功 ${successCount}/${results.length}`);
    } catch (error) {
      console.error('定时发布执行失败:', error.message);
    } finally {
      this.isRunning = false;
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      enabled: this.config.enabled,
      publishTime: this.config.publishTime,
      chaptersPerDay: this.config.chaptersPerDay
    };
  }
}

module.exports = Scheduler;

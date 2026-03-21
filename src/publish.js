class PlatformPublisher {
  constructor(platforms) {
    this.platforms = platforms || {};
  }

  async publish(chapters) {
    const results = [];

    for (const chapter of chapters) {
      const enabledPlatforms = Object.entries(this.platforms).filter(([, config]) => config && config.enabled);
      const chapterResult = {
        chapter: chapter.number,
        title: chapter.title,
        platforms: {},
        enabledCount: enabledPlatforms.length,
        successCount: 0,
        success: false
      };

      for (const [platformName, config] of enabledPlatforms) {
        try {
          console.log(`正在发布到 ${platformName}...`);
          const result = await this.publishToPlatform(platformName, chapter, config);
          chapterResult.platforms[platformName] = { success: true, detail: result };
          chapterResult.successCount += 1;
        } catch (error) {
          chapterResult.platforms[platformName] = { success: false, error: error.message };
        }
      }

      chapterResult.success = chapterResult.enabledCount > 0
        && chapterResult.successCount === chapterResult.enabledCount;
      results.push(chapterResult);
    }

    return results;
  }

  async publishToPlatform(platformName, chapter, config) {
    switch (platformName) {
      case 'fanqie':
        return this.publishToFanqie(chapter, config);
      case 'qimao':
        return this.publishToQimao(chapter, config);
      case 'qidian':
        return this.publishToQidian(chapter, config);
      case 'douyin':
        return this.publishToDouyin(chapter, config);
      default:
        throw new Error(`不支持的平台: ${platformName}`);
    }
  }

  async publishToFanqie(chapter, config) {
    this.assertConfig(config, '番茄小说');
    console.log(`[番茄小说] 模拟发布第 ${chapter.number} 章 ${chapter.title}`);
    return { platform: 'fanqie', mode: 'mock' };
  }

  async publishToQimao(chapter, config) {
    this.assertConfig(config, '七猫小说');
    console.log(`[七猫小说] 模拟发布第 ${chapter.number} 章 ${chapter.title}`);
    return { platform: 'qimao', mode: 'mock' };
  }

  async publishToQidian(chapter, config) {
    this.assertConfig(config, '起点中文网');
    console.log(`[起点中文网] 模拟发布第 ${chapter.number} 章 ${chapter.title}`);
    return { platform: 'qidian', mode: 'mock' };
  }

  async publishToDouyin(chapter, config) {
    this.assertConfig(config, '抖音小说');
    console.log(`[抖音小说] 模拟发布第 ${chapter.number} 章 ${chapter.title}`);
    return { platform: 'douyin', mode: 'mock' };
  }

  assertConfig(config, platformLabel) {
    if (!config || !config.cookies) {
      throw new Error(`${platformLabel} 未配置 cookies`);
    }
  }

  async getPublishStatus(platformName) {
    const config = this.platforms[platformName];
    if (!config) {
      throw new Error(`未知平台: ${platformName}`);
    }

    return {
      enabled: Boolean(config.enabled),
      configured: Boolean(config.cookies)
    };
  }
}

module.exports = { PlatformPublisher };

const Storage = require('./storage');

class NovelGenerator {
  constructor(aiWriter, chapterManager, storage = null) {
    this.aiWriter = aiWriter;
    this.chapterManager = chapterManager;
    this.storage = storage;
  }

  async generateOutline(novelInfo) {
    console.log('正在生成小说大纲...');

    const targetChapters = novelInfo.targetChapters || 100;
    const outline = await this.aiWriter.generateOutline(novelInfo, targetChapters);

    const outlineData = {
      ...outline,
      novelTitle: novelInfo.title,
      type: novelInfo.type,
      description: novelInfo.description,
      targetChapters,
      wordsPerChapter: novelInfo.wordsPerChapter || 2000,
      createdAt: new Date().toISOString()
    };

    const storage = this.storage || new Storage(novelInfo.outputDir || './output');
    await storage.saveOutline(outlineData);

    console.log('大纲生成完成');
    return outlineData;
  }

  async generateNextChapter(novelInfo) {
    const chapterNumber = await this.chapterManager.getNextChapterNumber();
    console.log(`正在生成第 ${chapterNumber} 章...`);

    const previousContent = await this.chapterManager.getPreviousContent(chapterNumber);
    const title = await this.generateChapterTitle(novelInfo, chapterNumber);

    const chapter = {
      number: chapterNumber,
      title,
      outline: '',
      content: ''
    };

    const content = await this.aiWriter.generateChapter(novelInfo, chapter, previousContent);

    return this.chapterManager.createChapter(
      chapterNumber,
      title,
      content,
      chapter.outline
    );
  }

  async generateChapterTitle(novelInfo, chapterNumber) {
    const prompt = [
      `你是网络小说作者，请为《${novelInfo.title}》第 ${chapterNumber} 章生成一个中文章节标题。`,
      '',
      '要求：',
      '1. 标题简洁有力，适合网文风格。',
      '2. 不超过 10 个汉字。',
      '3. 只输出标题，不要解释，不要输出 <think>。'
    ].join('\n');

    const rawTitle = await this.aiWriter.generate(prompt, { maxTokens: 80, temperature: 0.7 });
    const cleanTitle = this.aiWriter.cleanTitle(rawTitle, novelInfo);

    if (!cleanTitle || cleanTitle.length < 2) {
      return `第${chapterNumber}章`;
    }

    return cleanTitle;
  }

  async generateChapters(novelInfo, count) {
    const chapters = [];

    for (let i = 0; i < count; i += 1) {
      const chapter = await this.generateNextChapter(novelInfo);
      chapters.push(chapter);
      console.log(`已完成 ${i + 1}/${count} 章`);
    }

    return chapters;
  }

  async regenerateChapter(novelInfo, chapterNumber) {
    const existingChapter = await this.chapterManager.getChapter(chapterNumber);
    if (!existingChapter) {
      throw new Error(`章节 ${chapterNumber} 不存在`);
    }

    const previousContent = await this.chapterManager.getPreviousContent(chapterNumber);
    const chapter = {
      number: chapterNumber,
      title: existingChapter.title,
      outline: existingChapter.outline,
      content: ''
    };

    const content = await this.aiWriter.generateChapter(novelInfo, chapter, previousContent);

    await this.chapterManager.createChapter(
      chapterNumber,
      existingChapter.title,
      content,
      existingChapter.outline
    );

    return this.chapterManager.getChapter(chapterNumber);
  }
}

module.exports = NovelGenerator;

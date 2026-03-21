const fs = require('fs-extra');
const path = require('path');
const MySQLStore = require('../db/mysql');

class Storage {
  constructor(outputDir = './output', mysqlConfig = {}) {
    this.outputDir = outputDir;
    this.novelInfoFile = path.join(outputDir, 'novel.json');
    this.outlineFile = path.join(outputDir, 'outline.json');
    this.chaptersDir = path.join(outputDir, 'chapters');
    this.mysqlStore = new MySQLStore(mysqlConfig, outputDir);
  }

  async init() {
    await fs.ensureDir(this.outputDir);
    await fs.ensureDir(this.chaptersDir);
    await this.mysqlStore.init();
  }

  sanitizeChapter(chapter) {
    if (!chapter) {
      return null;
    }

    const next = { ...chapter };

    if (typeof next.number === 'string') {
      next.number = Number(next.number);
    }

    if (typeof next.title === 'string') {
      next.title = next.title
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<think>[\s\S]*/gi, '')
        .replace(/^标题[:：]\s*/i, '')
        .trim()
        .split(/\r?\n/)[0]
        .trim();
    } else {
      next.title = '';
    }

    if (typeof next.content === 'string') {
      next.content = next.content
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .trim();
    } else {
      next.content = '';
    }

    if (!next.title && next.content) {
      const headingMatch = next.content.match(/^#?\s*第\s*\d+\s*章[:：\s]+([^\r\n]+)/m);
      if (headingMatch) {
        next.title = headingMatch[1].trim();
      }
    }

    next.outline = typeof next.outline === 'string' ? next.outline : '';
    next.wordCount = Number(next.wordCount) || next.content.length;
    next.published = Boolean(next.published);
    next.platforms = Array.isArray(next.platforms) ? next.platforms : [];

    return next;
  }

  async saveNovelInfo(novelInfo) {
    await this.init();
    await fs.writeJson(this.novelInfoFile, novelInfo, { spaces: 2 });
    await this.mysqlStore.saveNovelInfo(novelInfo);
  }

  async getNovelInfo() {
    try {
      await fs.ensureDir(this.outputDir);

      const mysqlNovelInfo = await this.mysqlStore.getNovelInfo();
      if (await fs.pathExists(this.novelInfoFile)) {
        const fileNovelInfo = await fs.readJson(this.novelInfoFile);
        return mysqlNovelInfo ? { ...fileNovelInfo, ...mysqlNovelInfo } : fileNovelInfo;
      }

      return mysqlNovelInfo || null;
    } catch (error) {
      console.error('读取小说信息失败:', error);
      return null;
    }
  }

  async saveChapter(chapter) {
    await this.init();
    const sanitized = this.sanitizeChapter(chapter);
    const chapterFile = path.join(
      this.chaptersDir,
      `chapter_${String(sanitized.number).padStart(4, '0')}.json`
    );

    await fs.writeJson(chapterFile, sanitized, { spaces: 2 });
    await this.mysqlStore.saveChapter(sanitized);
  }

  async getChapter(number) {
    const chapterFile = path.join(this.chaptersDir, `chapter_${String(number).padStart(4, '0')}.json`);

    try {
      const mysqlChapter = await this.mysqlStore.getChapter(number);
      if (mysqlChapter) {
        return this.sanitizeChapter(mysqlChapter);
      }

      if (await fs.pathExists(chapterFile)) {
        return this.sanitizeChapter(await fs.readJson(chapterFile));
      }

      return null;
    } catch (error) {
      console.error(`读取章节 ${number} 失败:`, error);
      return null;
    }
  }

  async getAllChapters() {
    await this.init();

    const mysqlChapters = await this.mysqlStore.getAllChapters();
    const files = await fs.readdir(this.chaptersDir);
    const chapterMap = new Map();

    for (const chapter of mysqlChapters) {
      const sanitized = this.sanitizeChapter(chapter);
      chapterMap.set(sanitized.number, sanitized);
    }

    for (const file of files) {
      if (file.endsWith('.json') && file.startsWith('chapter_')) {
        const chapter = await fs.readJson(path.join(this.chaptersDir, file));
        const sanitized = this.sanitizeChapter(chapter);
        if (!chapterMap.has(sanitized.number)) {
          chapterMap.set(sanitized.number, sanitized);
        }
      }
    }

    return Array.from(chapterMap.values()).sort((a, b) => a.number - b.number);
  }

  async getLastChapterNumber() {
    const chapters = await this.getAllChapters();
    if (chapters.length === 0) {
      return 0;
    }

    return chapters[chapters.length - 1].number;
  }

  async getPublishedChapters() {
    const chapters = await this.getAllChapters();
    return chapters.filter(chapter => chapter.published);
  }

  async getUnpublishedChapters() {
    const chapters = await this.getAllChapters();
    return chapters.filter(chapter => !chapter.published);
  }

  async updateChapterPublishStatus(number, published) {
    const chapter = await this.getChapter(number);
    if (!chapter) {
      return;
    }

    chapter.published = published;
    chapter.publishedAt = published ? new Date().toISOString() : null;
    await this.saveChapter(chapter);
  }

  async saveOutline(outline) {
    await this.init();
    await fs.writeJson(this.outlineFile, outline, { spaces: 2 });
    await this.mysqlStore.saveOutline(outline);
  }

  async getOutline() {
    try {
      const mysqlOutline = await this.mysqlStore.getOutline();
      if (await fs.pathExists(this.outlineFile)) {
        const fileOutline = await fs.readJson(this.outlineFile);
        return mysqlOutline ? { ...fileOutline, ...mysqlOutline } : fileOutline;
      }

      return mysqlOutline || null;
    } catch {
      return null;
    }
  }

  async repairChapterFiles() {
    await this.init();
    const chapters = await this.getAllChapters();

    for (const chapter of chapters) {
      const chapterFile = path.join(
        this.chaptersDir,
        `chapter_${String(chapter.number).padStart(4, '0')}.json`
      );
      await fs.writeJson(chapterFile, chapter, { spaces: 2 });
      await this.mysqlStore.saveChapter(chapter);
    }

    return chapters.length;
  }

  async deleteChapter(number) {
    await this.init();
    const chapterFile = path.join(this.chaptersDir, `chapter_${String(number).padStart(4, '0')}.json`);

    if (await fs.pathExists(chapterFile)) {
      await fs.remove(chapterFile);
    }

    if (this.mysqlStore?.deleteChapter) {
      await this.mysqlStore.deleteChapter(number);
    }

    return true;
  }

  async resetBook() {
    await this.init();

    if (await fs.pathExists(this.chaptersDir)) {
      await fs.emptyDir(this.chaptersDir);
    }

    if (await fs.pathExists(this.outlineFile)) {
      await fs.remove(this.outlineFile);
    }

    if (this.mysqlStore?.deleteAllChapters) {
      await this.mysqlStore.deleteAllChapters();
    }

    if (this.mysqlStore?.clearOutline) {
      await this.mysqlStore.clearOutline();
    }

    return true;
  }
}

module.exports = Storage;

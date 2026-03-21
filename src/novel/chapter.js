class ChapterManager {
  constructor(storage) {
    this.storage = storage;
  }

  async createChapter(number, title, content, outline = '') {
    const chapter = {
      number,
      title,
      content,
      outline,
      wordCount: content.length,
      createdAt: new Date().toISOString(),
      published: false,
      publishedAt: null,
      platforms: []
    };

    await this.storage.saveChapter(chapter);
    return chapter;
  }

  async getChapter(number) {
    return this.storage.getChapter(number);
  }

  async updateChapter(number, patch = {}) {
    const existing = await this.storage.getChapter(number);
    if (!existing) {
      return null;
    }

    const next = {
      ...existing,
      ...patch,
      number: existing.number,
      title: typeof patch.title === 'string' ? patch.title : existing.title,
      content: typeof patch.content === 'string' ? patch.content : existing.content,
      outline: typeof patch.outline === 'string' ? patch.outline : existing.outline
    };

    next.wordCount = (next.content || '').length;
    await this.storage.saveChapter(next);
    return next;
  }

  async getAllChapters() {
    return this.storage.getAllChapters();
  }

  async getUnpublishedChapters() {
    return this.storage.getUnpublishedChapters();
  }

  async getPublishedChapters() {
    return this.storage.getPublishedChapters();
  }

  async getNextChapterNumber() {
    return (await this.storage.getLastChapterNumber()) + 1;
  }

  async getPreviousContent(number) {
    if (number <= 1) {
      return '';
    }

    const previousChapter = await this.storage.getChapter(number - 1);
    return previousChapter ? previousChapter.content : '';
  }

  async markAsPublished(number, platform) {
    const chapter = await this.storage.getChapter(number);
    if (!chapter) {
      return;
    }

    if (!chapter.platforms) {
      chapter.platforms = [];
    }

    if (!chapter.platforms.includes(platform)) {
      chapter.platforms.push(platform);
    }

    chapter.published = true;
    chapter.publishedAt = new Date().toISOString();
    await this.storage.saveChapter(chapter);
  }

  async getLatestChapters(count = 5) {
    const allChapters = await this.storage.getAllChapters();
    return allChapters.slice(-count);
  }

  async getStatistics() {
    const allChapters = await this.storage.getAllChapters();
    const publishedChapters = allChapters.filter(chapter => chapter.published);
    const totalWords = allChapters.reduce((sum, chapter) => sum + (chapter.wordCount || 0), 0);

    return {
      total: allChapters.length,
      published: publishedChapters.length,
      unpublished: allChapters.length - publishedChapters.length,
      totalWords,
      averageWords: allChapters.length > 0 ? Math.round(totalWords / allChapters.length) : 0
    };
  }
}

module.exports = ChapterManager;

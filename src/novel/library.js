const fs = require('fs-extra');
const path = require('path');
const Storage = require('./storage');
const { loadConfig, saveConfig } = require('../config');

class NovelLibrary {
  constructor(config) {
    this.config = config;
    this.novelConfig = config.novel || {};
    this.mysqlConfig = config.mysql || {};
    this.outputDir = path.resolve(this.novelConfig.outputDir || './output');
    this.libraryDir = path.resolve(this.novelConfig.libraryDir || path.join(this.outputDir, 'books'));
  }

  sanitizeBookKey(value = '') {
    const cleaned = String(value)
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/\.+$/g, '')
      .slice(0, 60);

    if (cleaned) {
      return cleaned;
    }

    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    return `book-${stamp}`;
  }

  getBookDir(bookKey) {
    return path.join(this.libraryDir, bookKey);
  }

  isValidBookKey(bookKey) {
    return Boolean(bookKey) && !/[<>:"/\\|?*\u0000-\u001f]/.test(String(bookKey));
  }

  async ensureInitialized() {
    await fs.ensureDir(this.outputDir);
    await fs.ensureDir(this.libraryDir);
    await this.migrateLegacyWorkspaceIfNeeded();

    const currentBookKey = this.config.novel?.currentBookKey;
    const currentBookExists = currentBookKey
      && this.isValidBookKey(currentBookKey)
      && await fs.pathExists(this.getBookDir(currentBookKey));

    if (!currentBookExists) {
      const books = await this.listBooks();
      if (books.length) {
        await this.setCurrentBook(books[0].key);
      } else if (currentBookKey) {
        await this.setCurrentBook('');
      }
    }
  }

  async migrateLegacyWorkspaceIfNeeded() {
    const legacyNovelFile = path.join(this.outputDir, 'novel.json');
    const legacyOutlineFile = path.join(this.outputDir, 'outline.json');
    const legacyChaptersDir = path.join(this.outputDir, 'chapters');
    const hasLegacyData = await fs.pathExists(legacyNovelFile)
      || await fs.pathExists(legacyOutlineFile)
      || await fs.pathExists(legacyChaptersDir);

    if (!hasLegacyData || this.config.novel?.currentBookKey) {
      return;
    }

    let key = 'legacy-book';
    try {
      if (await fs.pathExists(legacyNovelFile)) {
        const novelInfo = await fs.readJson(legacyNovelFile);
        key = this.sanitizeBookKey(novelInfo.title || key);
      }
    } catch {
      key = 'legacy-book';
    }

    let targetDir = this.getBookDir(key);
    let suffix = 1;
    while (await fs.pathExists(targetDir)) {
      targetDir = this.getBookDir(`${key}-${suffix}`);
      suffix += 1;
    }

    await fs.ensureDir(targetDir);

    if (await fs.pathExists(legacyNovelFile)) {
      await fs.move(legacyNovelFile, path.join(targetDir, 'novel.json'), { overwrite: true });
    }

    if (await fs.pathExists(legacyOutlineFile)) {
      await fs.move(legacyOutlineFile, path.join(targetDir, 'outline.json'), { overwrite: true });
    }

    if (await fs.pathExists(legacyChaptersDir)) {
      await fs.move(legacyChaptersDir, path.join(targetDir, 'chapters'), { overwrite: true });
    }

    const finalKey = path.basename(targetDir);
    await this.setCurrentBook(finalKey);
  }

  async listBooks() {
    await fs.ensureDir(this.libraryDir);

    const entries = await fs.readdir(this.libraryDir, { withFileTypes: true });
    const books = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const bookKey = entry.name;
      const bookDir = this.getBookDir(bookKey);
      try {
        const storage = new Storage(bookDir, this.mysqlConfig);
        const novelInfo = await storage.getNovelInfo();
        const chapters = await storage.getAllChapters();

        books.push({
          key: bookKey,
          title: novelInfo?.title || bookKey,
          type: novelInfo?.type || '',
          description: novelInfo?.description || '',
          createdAt: novelInfo?.createdAt || null,
          chapterCount: chapters.length,
          lastChapterNumber: chapters.length ? chapters[chapters.length - 1].number : 0,
          isCurrent: bookKey === this.config.novel?.currentBookKey
        });
      } catch (error) {
        console.warn(`跳过异常书籍目录 ${bookKey}: ${error.message}`);
      }
    }

    return books.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }

  async createBook({ title, type, description }) {
    const baseKey = this.sanitizeBookKey(title || type || 'book');
    let bookKey = baseKey;
    let suffix = 1;

    while (await fs.pathExists(this.getBookDir(bookKey))) {
      bookKey = `${baseKey}-${suffix}`;
      suffix += 1;
    }

    const bookDir = this.getBookDir(bookKey);
    await fs.ensureDir(path.join(bookDir, 'chapters'));
    await this.setCurrentBook(bookKey);

    const storage = new Storage(bookDir, this.mysqlConfig);
    await storage.init();

    return {
      key: bookKey,
      bookDir
    };
  }

  async setCurrentBook(bookKey) {
    const finalBookKey = this.isValidBookKey(bookKey) ? bookKey : '';
    const nextConfig = loadConfig();
    nextConfig.novel = nextConfig.novel || {};
    nextConfig.novel.currentBookKey = finalBookKey;
    nextConfig.novel.libraryDir = nextConfig.novel.libraryDir || this.libraryDir;
    nextConfig.novel.outputDir = nextConfig.novel.outputDir || this.outputDir;
    saveConfig(nextConfig);
    this.config = nextConfig;
    this.novelConfig = nextConfig.novel || {};
    return true;
  }

  async getCurrentBook() {
    await this.ensureInitialized();
    const currentBookKey = this.config.novel?.currentBookKey;

    if (!currentBookKey || !this.isValidBookKey(currentBookKey)) {
      return null;
    }

    const storage = new Storage(this.getBookDir(currentBookKey), this.mysqlConfig);
    const novelInfo = await storage.getNovelInfo();
    const chapters = await storage.getAllChapters();

    return {
      key: currentBookKey,
      dir: this.getBookDir(currentBookKey),
      title: novelInfo?.title || currentBookKey,
      type: novelInfo?.type || '',
      description: novelInfo?.description || '',
      chapterCount: chapters.length,
      lastChapterNumber: chapters.length ? chapters[chapters.length - 1].number : 0
    };
  }

  async deleteBook(bookKey) {
    const bookDir = this.getBookDir(bookKey);
    const storage = new Storage(bookDir, this.mysqlConfig);
    await storage.init();

    if (storage.mysqlStore?.available && storage.mysqlStore.deleteNovelByOutputDir) {
      await storage.mysqlStore.deleteNovelByOutputDir();
    }

    await fs.remove(bookDir);

    const remainingBooks = await this.listBooks();
    if (this.config.novel?.currentBookKey === bookKey) {
      await this.setCurrentBook(remainingBooks[0]?.key || '');
    }

    return true;
  }

  async getCurrentStorage() {
    await this.ensureInitialized();
    const currentBook = await this.getCurrentBook();

    if (!currentBook) {
      return null;
    }

    return new Storage(currentBook.dir, this.mysqlConfig);
  }
}

module.exports = NovelLibrary;

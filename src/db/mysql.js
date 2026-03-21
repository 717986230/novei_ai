const mysql = require('mysql2/promise');

class MySQLStore {
  constructor(config = {}, outputDir = './output') {
    this.config = config;
    this.outputDir = outputDir;
    this.pool = null;
    this.initialized = false;
    this.available = false;
    this.initError = null;
  }

  async init() {
    if (this.initialized) {
      return this.available;
    }

    this.initialized = true;

    if (!this.config.enabled) {
      return false;
    }

    try {
      if (this.config.autoCreateDatabase) {
        await this.ensureDatabase();
      }

      this.pool = mysql.createPool({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        charset: 'utf8mb4',
        waitForConnections: true,
        connectionLimit: this.config.connectionLimit || 10
      });

      await this.ensureTables();
      this.available = true;
      console.log(`MySQL 已连接: ${this.config.host}:${this.config.port}/${this.config.database}`);
      return true;
    } catch (error) {
      this.initError = error;
      this.available = false;
      console.warn(`MySQL 不可用，已回退到文件存储: ${error.message}`);
      return false;
    }
  }

  async ensureDatabase() {
    const connection = await mysql.createConnection({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      charset: 'utf8mb4'
    });

    try {
      await connection.query(
        `CREATE DATABASE IF NOT EXISTS \`${this.config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
    } finally {
      await connection.end();
    }
  }

  async ensureTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS novels (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        output_dir VARCHAR(255) NOT NULL UNIQUE,
        title VARCHAR(255) NOT NULL,
        type VARCHAR(120) DEFAULT '',
        description TEXT,
        target_chapters INT DEFAULT 0,
        words_per_chapter INT DEFAULT 0,
        outline_json LONGTEXT NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS chapters (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        output_dir VARCHAR(255) NOT NULL,
        chapter_number INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        content LONGTEXT,
        outline TEXT,
        word_count INT DEFAULT 0,
        created_at DATETIME NOT NULL,
        published TINYINT(1) NOT NULL DEFAULT 0,
        published_at DATETIME NULL,
        platforms_json TEXT NULL,
        updated_at DATETIME NOT NULL,
        UNIQUE KEY uniq_output_chapter (output_dir, chapter_number),
        KEY idx_output_published (output_dir, published),
        KEY idx_output_number (output_dir, chapter_number)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  toDateTime(value) {
    return value ? new Date(value) : new Date();
  }

  async saveNovelInfo(novelInfo) {
    if (!(await this.init())) {
      return false;
    }

    const now = new Date();
    await this.pool.query(
      `INSERT INTO novels (
        output_dir, title, type, description, target_chapters, words_per_chapter, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        type = VALUES(type),
        description = VALUES(description),
        target_chapters = VALUES(target_chapters),
        words_per_chapter = VALUES(words_per_chapter),
        created_at = VALUES(created_at),
        updated_at = VALUES(updated_at)`,
      [
        this.outputDir,
        novelInfo.title || '',
        novelInfo.type || '',
        novelInfo.description || '',
        novelInfo.targetChapters || 0,
        novelInfo.wordsPerChapter || 0,
        this.toDateTime(novelInfo.createdAt),
        now
      ]
    );

    return true;
  }

  async getNovelInfo() {
    if (!(await this.init())) {
      return null;
    }

    const [rows] = await this.pool.query(
      `SELECT title, type, description, target_chapters, words_per_chapter, created_at
       FROM novels
       WHERE output_dir = ?
       LIMIT 1`,
      [this.outputDir]
    );

    if (!rows.length) {
      return null;
    }

    const row = rows[0];
    return {
      title: row.title,
      type: row.type,
      description: row.description,
      targetChapters: row.target_chapters,
      wordsPerChapter: row.words_per_chapter,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
    };
  }

  async saveOutline(outline) {
    if (!(await this.init())) {
      return false;
    }

    const novelInfo = {
      title: outline.novelTitle || '未命名小说',
      type: outline.type || '',
      description: outline.description || '',
      targetChapters: outline.targetChapters || 0,
      wordsPerChapter: outline.wordsPerChapter || 0,
      createdAt: outline.createdAt || new Date().toISOString()
    };

    await this.saveNovelInfo(novelInfo);
    await this.pool.query(
      `UPDATE novels
       SET outline_json = ?, updated_at = ?
       WHERE output_dir = ?`,
      [JSON.stringify(outline), new Date(), this.outputDir]
    );

    return true;
  }

  async getOutline() {
    if (!(await this.init())) {
      return null;
    }

    const [rows] = await this.pool.query(
      `SELECT outline_json FROM novels WHERE output_dir = ? LIMIT 1`,
      [this.outputDir]
    );

    if (!rows.length || !rows[0].outline_json) {
      return null;
    }

    try {
      return JSON.parse(rows[0].outline_json);
    } catch {
      return null;
    }
  }

  async saveChapter(chapter) {
    if (!(await this.init())) {
      return false;
    }

    await this.pool.query(
      `INSERT INTO chapters (
        output_dir, chapter_number, title, content, outline, word_count, created_at,
        published, published_at, platforms_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        content = VALUES(content),
        outline = VALUES(outline),
        word_count = VALUES(word_count),
        created_at = VALUES(created_at),
        published = VALUES(published),
        published_at = VALUES(published_at),
        platforms_json = VALUES(platforms_json),
        updated_at = VALUES(updated_at)`,
      [
        this.outputDir,
        chapter.number,
        chapter.title || '',
        chapter.content || '',
        chapter.outline || '',
        chapter.wordCount || 0,
        this.toDateTime(chapter.createdAt),
        chapter.published ? 1 : 0,
        chapter.publishedAt ? this.toDateTime(chapter.publishedAt) : null,
        JSON.stringify(chapter.platforms || []),
        new Date()
      ]
    );

    return true;
  }

  mapChapter(row) {
    let platforms = [];

    try {
      platforms = row.platforms_json ? JSON.parse(row.platforms_json) : [];
    } catch {
      platforms = [];
    }

    return {
      number: row.chapter_number,
      title: row.title,
      content: row.content,
      outline: row.outline,
      wordCount: row.word_count,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      published: Boolean(row.published),
      publishedAt: row.published_at instanceof Date
        ? row.published_at.toISOString()
        : row.published_at,
      platforms
    };
  }

  async getChapter(number) {
    if (!(await this.init())) {
      return null;
    }

    const [rows] = await this.pool.query(
      `SELECT * FROM chapters WHERE output_dir = ? AND chapter_number = ? LIMIT 1`,
      [this.outputDir, number]
    );

    return rows.length ? this.mapChapter(rows[0]) : null;
  }

  async getAllChapters() {
    if (!(await this.init())) {
      return [];
    }

    const [rows] = await this.pool.query(
      `SELECT * FROM chapters WHERE output_dir = ? ORDER BY chapter_number ASC`,
      [this.outputDir]
    );

    return rows.map((row) => this.mapChapter(row));
  }

  async deleteChapter(number) {
    if (!(await this.init())) {
      return false;
    }

    await this.pool.query(
      `DELETE FROM chapters WHERE output_dir = ? AND chapter_number = ?`,
      [this.outputDir, number]
    );

    return true;
  }

  async deleteAllChapters() {
    if (!(await this.init())) {
      return false;
    }

    await this.pool.query(`DELETE FROM chapters WHERE output_dir = ?`, [this.outputDir]);
    return true;
  }

  async clearOutline() {
    if (!(await this.init())) {
      return false;
    }

    await this.pool.query(
      `UPDATE novels SET outline_json = NULL, updated_at = ? WHERE output_dir = ?`,
      [new Date(), this.outputDir]
    );

    return true;
  }

  async deleteNovelByOutputDir() {
    if (!(await this.init())) {
      return false;
    }

    await this.pool.query(`DELETE FROM chapters WHERE output_dir = ?`, [this.outputDir]);
    await this.pool.query(`DELETE FROM novels WHERE output_dir = ?`, [this.outputDir]);
    return true;
  }
}

module.exports = MySQLStore;

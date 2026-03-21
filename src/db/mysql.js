const mysql = require('mysql2/promise');

class MySQLStore {
  static stateCache = new Map();

  constructor(config = {}, outputDir = './output') {
    this.config = config;
    this.outputDir = outputDir;
    this.pool = null;
    this.initialized = false;
    this.available = false;
    this.initError = null;
  }

  getStateKey() {
    return [
      this.config.host,
      this.config.port,
      this.config.user,
      this.config.database
    ].join(':');
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
      const stateKey = this.getStateKey();
      let state = MySQLStore.stateCache.get(stateKey);

      if (!state) {
        state = {
          initPromise: this.initializeSharedState()
        };
        MySQLStore.stateCache.set(stateKey, state);
      }

      this.pool = await state.initPromise;
      this.available = true;
      console.log(`MySQL 已连接: ${this.config.host}:${this.config.port}/${this.config.database}`);
      return true;
    } catch (error) {
      this.initError = error;
      this.available = false;
      MySQLStore.stateCache.delete(this.getStateKey());
      console.warn(`MySQL 不可用，已回退到文件存储: ${error.message}`);
      return false;
    }
  }

  async initializeSharedState() {
    if (this.config.autoCreateDatabase) {
      await this.ensureDatabase();
    }

    const pool = mysql.createPool({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database,
      charset: 'utf8mb4',
      waitForConnections: true,
      connectionLimit: this.config.connectionLimit || 10
    });

    this.pool = pool;
    await this.ensureTables();
    return pool;
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

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS workflows (
        id VARCHAR(64) PRIMARY KEY,
        book_key VARCHAR(255) NOT NULL DEFAULT '',
        type VARCHAR(80) NOT NULL,
        title VARCHAR(255) NOT NULL,
        status VARCHAR(30) NOT NULL,
        payload_json LONGTEXT NULL,
        progress_json LONGTEXT NULL,
        result_json LONGTEXT NULL,
        error_text TEXT NULL,
        created_at DATETIME NOT NULL,
        started_at DATETIME NULL,
        finished_at DATETIME NULL,
        updated_at DATETIME NOT NULL,
        KEY idx_workflows_book_created (book_key, created_at),
        KEY idx_workflows_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  toDateTime(value) {
    return value ? new Date(value) : new Date();
  }

  parseJson(value, fallback = null) {
    if (!value) {
      return fallback;
    }

    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
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

    return this.parseJson(rows[0].outline_json, null);
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
    return {
      number: row.chapter_number,
      title: row.title,
      content: row.content,
      outline: row.outline,
      wordCount: row.word_count,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      published: Boolean(row.published),
      publishedAt: row.published_at instanceof Date ? row.published_at.toISOString() : row.published_at,
      platforms: this.parseJson(row.platforms_json, [])
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

  mapWorkflow(row) {
    return {
      id: row.id,
      bookKey: row.book_key,
      type: row.type,
      title: row.title,
      status: row.status,
      payload: this.parseJson(row.payload_json, {}),
      progress: this.parseJson(row.progress_json, {
        current: 0,
        total: 1,
        percent: 0,
        message: ''
      }),
      result: this.parseJson(row.result_json, null),
      error: row.error_text || '',
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      startedAt: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at,
      finishedAt: row.finished_at instanceof Date ? row.finished_at.toISOString() : row.finished_at
    };
  }

  async saveWorkflow(workflow) {
    if (!(await this.init())) {
      return false;
    }

    await this.pool.query(
      `INSERT INTO workflows (
        id, book_key, type, title, status, payload_json, progress_json, result_json, error_text,
        created_at, started_at, finished_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        book_key = VALUES(book_key),
        type = VALUES(type),
        title = VALUES(title),
        status = VALUES(status),
        payload_json = VALUES(payload_json),
        progress_json = VALUES(progress_json),
        result_json = VALUES(result_json),
        error_text = VALUES(error_text),
        created_at = VALUES(created_at),
        started_at = VALUES(started_at),
        finished_at = VALUES(finished_at),
        updated_at = VALUES(updated_at)`,
      [
        workflow.id,
        workflow.bookKey || '',
        workflow.type || '',
        workflow.title || '',
        workflow.status || 'pending',
        JSON.stringify(workflow.payload || {}),
        JSON.stringify(workflow.progress || {}),
        workflow.result === null || workflow.result === undefined ? null : JSON.stringify(workflow.result),
        workflow.error || '',
        this.toDateTime(workflow.createdAt),
        workflow.startedAt ? this.toDateTime(workflow.startedAt) : null,
        workflow.finishedAt ? this.toDateTime(workflow.finishedAt) : null,
        new Date()
      ]
    );

    return true;
  }

  async getWorkflow(id) {
    if (!(await this.init())) {
      return null;
    }

    const [rows] = await this.pool.query(
      `SELECT * FROM workflows WHERE id = ? LIMIT 1`,
      [id]
    );

    return rows.length ? this.mapWorkflow(rows[0]) : null;
  }

  async listWorkflows({ bookKey = '', type = '', limit = 100 } = {}) {
    if (!(await this.init())) {
      return [];
    }

    const clauses = [];
    const params = [];

    if (bookKey) {
      clauses.push('book_key = ?');
      params.push(bookKey);
    }

    if (type) {
      clauses.push('type = ?');
      params.push(type);
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(Math.max(1, Number(limit) || 100));

    const [rows] = await this.pool.query(
      `SELECT * FROM workflows ${whereClause} ORDER BY created_at DESC LIMIT ?`,
      params
    );

    return rows.map((row) => this.mapWorkflow(row));
  }

  async markIncompleteWorkflowsFailed(message = '服务重启，中断了之前的任务') {
    if (!(await this.init())) {
      return 0;
    }

    const [result] = await this.pool.query(
      `UPDATE workflows
       SET status = 'failed',
           error_text = ?,
           finished_at = ?,
           updated_at = ?
       WHERE status IN ('pending', 'running')`,
      [message, new Date(), new Date()]
    );

    return result.affectedRows || 0;
  }
}

module.exports = MySQLStore;

const fs = require('fs-extra');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const configPath = path.join(__dirname, '../config/settings.json');

function normalizeApiUrl(ai = {}) {
  if (ai.apiUrl) {
    return ai.apiUrl;
  }

  if (ai.baseUrl) {
    return `${String(ai.baseUrl).replace(/\/+$/, '')}/chat/completions`;
  }

  return '';
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseNumber(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function loadConfig() {
  const fileConfig = fs.existsSync(configPath) ? fs.readJsonSync(configPath) : {};
  const config = { ...fileConfig };
  const ai = { ...(fileConfig.ai || {}) };
  const mysql = { ...(fileConfig.mysql || {}) };
  const novel = { ...(fileConfig.novel || {}) };

  ai.provider = process.env.AI_PROVIDER || ai.provider || 'custom';
  ai.baseUrl = process.env.AI_BASE_URL || ai.baseUrl || '';
  ai.apiUrl = process.env.AI_API_URL || normalizeApiUrl({
    ...ai,
    baseUrl: process.env.AI_BASE_URL || ai.baseUrl
  });
  ai.apiKey = process.env.AI_API_KEY || ai.apiKey || '';
  ai.model = process.env.AI_MODEL || ai.model || 'minimaxai/minimax-m2.5';
  ai.proxyUrl = process.env.AI_PROXY_URL || ai.proxyUrl || '';
  ai.timeoutMs = parseNumber(process.env.AI_TIMEOUT_MS, ai.timeoutMs || 120000);
  ai.retryCount = parseNumber(process.env.AI_RETRY_COUNT, ai.retryCount || 1);

  mysql.enabled = parseBoolean(process.env.MYSQL_ENABLED, mysql.enabled ?? true);
  mysql.host = process.env.MYSQL_HOST || mysql.host || '127.0.0.1';
  mysql.port = parseNumber(process.env.MYSQL_PORT, mysql.port || 3306);
  mysql.user = process.env.MYSQL_USER || mysql.user || 'root';
  mysql.password = process.env.MYSQL_PASSWORD ?? mysql.password ?? '';
  mysql.database = process.env.MYSQL_DATABASE || mysql.database || 'novel_ai';
  mysql.connectionLimit = parseNumber(process.env.MYSQL_CONNECTION_LIMIT, mysql.connectionLimit || 10);
  mysql.autoCreateDatabase = parseBoolean(
    process.env.MYSQL_AUTO_CREATE_DATABASE,
    mysql.autoCreateDatabase ?? true
  );

  novel.defaultChapterCount = parseNumber(process.env.NOVEL_DEFAULT_CHAPTER_COUNT, novel.defaultChapterCount || 3000);
  novel.wordsPerChapter = parseNumber(process.env.NOVEL_WORDS_PER_CHAPTER, novel.wordsPerChapter || 2000);
  novel.outputDir = process.env.NOVEL_OUTPUT_DIR || novel.outputDir || './output';
  novel.libraryDir = process.env.NOVEL_LIBRARY_DIR || novel.libraryDir || path.join(novel.outputDir, 'books');
  novel.currentBookKey = process.env.NOVEL_CURRENT_BOOK_KEY || novel.currentBookKey || '';

  config.ai = ai;
  config.mysql = mysql;
  config.novel = novel;
  return config;
}

function saveConfig(config) {
  fs.writeJsonSync(configPath, config, { spaces: 2 });
}

module.exports = {
  configPath,
  loadConfig,
  normalizeApiUrl,
  parseBoolean,
  parseNumber,
  saveConfig
};

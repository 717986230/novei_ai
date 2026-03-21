const express = require('express');
const path = require('path');
const axios = require('axios');
const { loadConfig, normalizeApiUrl, saveConfig } = require('./config');
const AIWriter = require('./ai/writer');
const ChapterManager = require('./novel/chapter');
const NovelGenerator = require('./novel/generator');
const NovelLibrary = require('./novel/library');
const { PlatformPublisher } = require('./publish');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

function parseProxyUrl(proxyUrl) {
  try {
    const url = new URL(proxyUrl);
    return {
      protocol: url.protocol.replace(':', ''),
      host: url.hostname,
      port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
      auth: url.username && url.password ? {
        username: url.username,
        password: url.password
      } : undefined
    };
  } catch {
    return null;
  }
}

async function createContext() {
  const config = loadConfig();
  const library = new NovelLibrary(config);
  await library.ensureInitialized();

  const storage = await library.getCurrentStorage();
  const chapterManager = storage ? new ChapterManager(storage) : null;
  const aiWriter = new AIWriter(config.ai || {});
  const generator = storage && chapterManager ? new NovelGenerator(aiWriter, chapterManager, storage) : null;
  const publisher = new PlatformPublisher(config.platforms || {});

  return {
    config: loadConfig(),
    library,
    storage,
    chapterManager,
    aiWriter,
    generator,
    publisher
  };
}

app.get('/api/health', async (req, res) => {
  const { config, storage } = await createContext();
  if (storage) {
    await storage.init();
  }

  res.json({
    success: true,
    serverTime: new Date().toISOString(),
    aiConfigured: Boolean(config.ai?.apiUrl && config.ai?.apiKey),
    mysqlEnabled: Boolean(config.mysql?.enabled),
    mysqlAvailable: Boolean(storage?.mysqlStore?.available)
  });
});

app.get('/api/config', async (req, res) => {
  const { config } = await createContext();

  if (config.ai) {
    config.ai.hasApiKey = Boolean(config.ai.apiKey);
    config.ai.apiKey = config.ai.apiKey ? '********' : '';
  }

  if (config.mysql) {
    config.mysql.hasPassword = Boolean(config.mysql.password);
    config.mysql.password = config.mysql.password ? '********' : '';
  }

  res.json(config);
});

app.post('/api/save-config', (req, res) => {
  const { apiUrl, apiKey, model, proxyUrl } = req.body;
  const config = loadConfig();

  config.ai = {
    ...config.ai,
    provider: 'custom',
    baseUrl: apiUrl ? apiUrl.replace(/\/chat\/completions\/?$/, '') : config.ai?.baseUrl || '',
    apiUrl: apiUrl || normalizeApiUrl(config.ai),
    apiKey: apiKey && apiKey.trim() ? apiKey.trim() : (config.ai?.apiKey || ''),
    model: model || config.ai?.model || 'minimaxai/minimax-m2.5',
    proxyUrl: proxyUrl || '',
    timeoutMs: config.ai?.timeoutMs || 120000,
    retryCount: config.ai?.retryCount || 1
  };

  saveConfig(config);
  res.json({ success: true });
});

app.post('/api/test-connection', async (req, res) => {
  const { apiUrl, apiKey, model, proxyUrl } = req.body;

  try {
    const config = loadConfig();
    const finalApiKey = apiKey || config.ai?.apiKey || '';
    const finalApiUrl = apiUrl || config.ai?.apiUrl || normalizeApiUrl(config.ai || {});
    const finalModel = model || config.ai?.model || 'minimaxai/minimax-m2.5';

    if (!finalApiUrl || !finalApiKey) {
      res.json({ success: false, error: '请先配置 API 地址和 API Key' });
      return;
    }

    const axiosConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${finalApiKey}`
      },
      timeout: 30000,
      proxy: false
    };

    if (proxyUrl) {
      axiosConfig.proxy = parseProxyUrl(proxyUrl);
    }

    const response = await axios.post(
      finalApiUrl,
      {
        model: finalModel,
        messages: [{ role: 'user', content: '你好，请回复“连接成功”。' }],
        max_tokens: 100
      },
      axiosConfig
    );

    res.json({
      success: true,
      message: response.data.choices?.[0]?.message?.content || '连接成功'
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.response?.data?.error?.message || error.message
    });
  }
});

app.get('/api/books', async (req, res) => {
  const { library } = await createContext();
  const books = await library.listBooks();
  const currentBook = await library.getCurrentBook();
  res.json({ books, currentBookKey: currentBook?.key || '' });
});

app.post('/api/books', async (req, res) => {
  const { title, type, description } = req.body;
  const context = await createContext();

  try {
    const finalTitle = title && title.trim()
      ? title.trim()
      : await context.aiWriter.generateBookTitle({ type, description });

    const created = await context.library.createBook({ title: finalTitle, type, description });
    const { storage, generator } = await createContext();

    const novelInfo = {
      title: finalTitle,
      type,
      description,
      targetChapters: context.config.novel?.defaultChapterCount || 3000,
      wordsPerChapter: context.config.novel?.wordsPerChapter || 2000,
      createdAt: new Date().toISOString()
    };

    await storage.saveNovelInfo(novelInfo);

    try {
      await generator.generateOutline(novelInfo);
    } catch (error) {
      console.warn('生成大纲失败:', error.message);
    }

    res.json({
      success: true,
      book: {
        key: created.key,
        title: finalTitle,
        type,
        description
      }
    });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/books/select', async (req, res) => {
  const { bookKey } = req.body;
  const { library } = await createContext();

  if (!bookKey) {
    res.json({ success: false, error: '缺少 bookKey' });
    return;
  }

  await library.setCurrentBook(bookKey);
  res.json({ success: true });
});

app.delete('/api/books/:bookKey', async (req, res) => {
  const { bookKey } = req.params;
  const { library } = await createContext();

  if (!bookKey) {
    res.json({ success: false, error: '缺少 bookKey' });
    return;
  }

  try {
    await library.deleteBook(bookKey);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.get('/api/novel-info', async (req, res) => {
  const { storage, chapterManager, library } = await createContext();
  const currentBook = await library.getCurrentBook();
  const novelInfo = storage ? await storage.getNovelInfo() : null;
  const stats = chapterManager ? await chapterManager.getStatistics() : {
    total: 0,
    published: 0,
    unpublished: 0,
    totalWords: 0,
    averageWords: 0
  };

  res.json({
    ...(novelInfo || {}),
    stats,
    currentBookKey: currentBook?.key || ''
  });
});

app.get('/api/chapters', async (req, res) => {
  const { storage } = await createContext();
  const chapters = storage ? await storage.getAllChapters() : [];
  res.json(chapters);
});

app.delete('/api/chapters/:number', async (req, res) => {
  const { storage } = await createContext();
  const number = Number(req.params.number);

  if (!storage) {
    res.json({ success: false, error: '请先选择一本书' });
    return;
  }

  if (!Number.isInteger(number) || number <= 0) {
    res.json({ success: false, error: '章节编号无效' });
    return;
  }

  try {
    await storage.deleteChapter(number);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/reset-book', async (req, res) => {
  const { storage } = await createContext();

  if (!storage) {
    res.json({ success: false, error: '请先选择一本书' });
    return;
  }

  try {
    await storage.resetBook();
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/create-novel', async (req, res) => {
  const { storage, generator, aiWriter, config } = await createContext();
  const { title, type, description } = req.body;

  if (!storage || !generator) {
    res.json({ success: false, error: '请先新增一本书并选中它' });
    return;
  }

  try {
    const finalTitle = title && title.trim()
      ? title.trim()
      : await aiWriter.generateBookTitle({ type, description });

    const novelInfo = {
      title: finalTitle,
      type,
      description,
      targetChapters: config.novel?.defaultChapterCount || 3000,
      wordsPerChapter: config.novel?.wordsPerChapter || 2000,
      createdAt: new Date().toISOString()
    };

    await storage.saveNovelInfo(novelInfo);

    try {
      await generator.generateOutline(novelInfo);
    } catch (error) {
      console.warn('生成大纲失败:', error.message);
    }

    res.json({ success: true, title: finalTitle });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/generate-title', async (req, res) => {
  const { aiWriter } = await createContext();
  const { type, description } = req.body;

  if (!type && !description) {
    res.json({ success: false, error: '请提供小说类型或简介' });
    return;
  }

  try {
    const titles = [];

    for (let i = 0; i < 3; i += 1) {
      const title = await aiWriter.generateBookTitle({ type, description });
      if (title && !titles.includes(title)) {
        titles.push(title);
      }
    }

    res.json({ success: true, titles });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/generate-chapter', async (req, res) => {
  const { storage, generator } = await createContext();
  const novelInfo = storage ? await storage.getNovelInfo() : null;

  if (!storage || !generator || !novelInfo) {
    res.json({ success: false, error: '请先新增并配置一本书' });
    return;
  }

  try {
    const chapter = await generator.generateNextChapter(novelInfo);
    res.json({ success: true, chapter });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/generate-chapters', async (req, res) => {
  const { storage, generator } = await createContext();
  const { count } = req.body;
  const novelInfo = storage ? await storage.getNovelInfo() : null;

  if (!storage || !generator || !novelInfo) {
    res.json({ success: false, error: '请先新增并配置一本书' });
    return;
  }

  try {
    const chapters = await generator.generateChapters(novelInfo, Number(count) || 1);
    res.json({ success: true, count: chapters.length });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/publish', async (req, res) => {
  const { chapterManager, publisher } = await createContext();

  if (!chapterManager) {
    res.json({ success: false, error: '请先选择一本书' });
    return;
  }

  const unpublished = await chapterManager.getUnpublishedChapters();
  if (!unpublished.length) {
    res.json({ success: false, error: '没有待发布的章节' });
    return;
  }

  try {
    const results = await publisher.publish(unpublished);
    let successCount = 0;

    for (const result of results) {
      if (result.success) {
        await chapterManager.markAsPublished(result.chapter, 'all');
        successCount += 1;
      }
    }

    res.json({
      success: successCount > 0,
      count: successCount,
      total: unpublished.length,
      failed: unpublished.length - successCount,
      results
    });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/repair-data', async (req, res) => {
  const { storage } = await createContext();

  if (!storage) {
    res.json({ success: false, error: '请先选择一本书' });
    return;
  }

  try {
    const repaired = await storage.repairChapterFiles();
    const chapters = await storage.getAllChapters();

    res.json({
      success: true,
      repaired,
      lastChapterNumber: chapters.length ? chapters[chapters.length - 1].number : 0
    });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

function startServer() {
  app.listen(PORT, () => {
    console.log(`\nWeb 界面已启动: http://localhost:${PORT}\n`);
  });
}

module.exports = { app, startServer };

if (require.main === module) {
  startServer();
}

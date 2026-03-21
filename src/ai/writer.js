const axios = require('axios');

class AIWriter {
  constructor(config = {}) {
    this.config = config;
    this.provider = config.provider || 'custom';
    this.apiUrl = config.apiUrl || '';
    this.apiKey = config.apiKey || '';
    this.model = config.model || 'minimaxai/minimax-m2.5';
    this.proxyUrl = config.proxyUrl || '';
    this.timeoutMs = config.timeoutMs || 120000;
    this.retryCount = config.retryCount || 1;
  }

  async generate(prompt, options = {}) {
    const maxTokens = options.maxTokens || 4000;
    const temperature = options.temperature ?? 0.8;

    try {
      if (this.provider === 'custom') {
        return await this.callCustomAPI(prompt, { maxTokens, temperature });
      }

      if (this.provider === 'openai') {
        return await this.callOpenAI(prompt, { maxTokens, temperature });
      }

      if (this.provider === 'anthropic') {
        return await this.callAnthropic(prompt, { maxTokens, temperature });
      }

      throw new Error(`不支持的 AI provider: ${this.provider}`);
    } catch (error) {
      console.error('AI 生成失败:', error.message);
      throw error;
    }
  }

  buildAxiosConfig() {
    const config = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      timeout: this.timeoutMs,
      proxy: false
    };

    if (this.proxyUrl) {
      config.proxy = this.parseProxyUrl(this.proxyUrl);
    }

    return config;
  }

  parseProxyUrl(proxyUrl) {
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
  }

  async callCustomAPI(prompt, options) {
    let lastError = null;

    for (let attempt = 0; attempt <= this.retryCount; attempt += 1) {
      try {
        const response = await axios.post(
          this.apiUrl,
          {
            model: this.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: options.maxTokens,
            temperature: options.temperature
          },
          this.buildAxiosConfig()
        );

        return response.data.choices?.[0]?.message?.content || '';
      } catch (error) {
        lastError = error;
        if (!this.isRetryable(error) || attempt === this.retryCount) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  isRetryable(error) {
    return ['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT', 'UND_ERR_SOCKET'].includes(error.code);
  }

  async callOpenAI(prompt, options) {
    const { OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey: this.apiKey });

    const response = await openai.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens,
      temperature: options.temperature
    });

    return response.choices?.[0]?.message?.content || '';
  }

  async callAnthropic(prompt, options) {
    const { Anthropic } = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: this.apiKey });

    const response = await anthropic.messages.create({
      model: this.model,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      messages: [{ role: 'user', content: prompt }]
    });

    return response.content?.[0]?.text || '';
  }

  async generateChapter(novelInfo, chapter, previousContent = '') {
    const prompt = this.buildChapterPrompt(novelInfo, chapter, previousContent);
    const result = await this.generate(prompt, { maxTokens: 4000, temperature: 0.8 });
    return this.cleanContent(result);
  }

  async generateBookTitle(novelInfo) {
    const prompt = [
      '你是一名资深网文编辑，请根据小说类型和简介生成一个适合中文网文平台发布的书名。',
      `小说类型：${novelInfo.type || '未提供'}`,
      `小说简介：${novelInfo.description || '未提供'}`,
      '要求：',
      '1. 标题要有吸引力，适合网文风格。',
      '2. 不要输出解释、思考过程或 <think> 标签。',
      '3. 不要带书名号、引号或额外说明。',
      '4. 只输出一个最终书名。'
    ].join('\n');

    const result = await this.generate(prompt, { maxTokens: 120, temperature: 0.7 });
    return this.cleanTitle(result, novelInfo);
  }

  buildChapterPrompt(novelInfo, chapter, previousContent) {
    const parts = [
      '你是一位专业的网络小说作者，请按要求创作章节正文。',
      '',
      `小说标题：《${novelInfo.title}》`,
      `小说类型：${novelInfo.type || '未提供'}`,
      `小说简介：${novelInfo.description || '未提供'}`,
      `章节标题：第${chapter.number}章 ${chapter.title}`,
      `目标字数：约 ${novelInfo.wordsPerChapter || 2000} 字`,
      ''
    ];

    if (previousContent) {
      parts.push(`上一章末尾内容参考：\n${previousContent.slice(-800)}`);
      parts.push('');
    }

    if (chapter.outline) {
      parts.push(`本章大纲：${chapter.outline}`);
      parts.push('');
    }

    parts.push(
      '写作要求：',
      '1. 情节连贯，承接上一章。',
      '2. 人物性格、语气和世界观保持一致。',
      '3. 有具体场景、动作、对白和冲突推进。',
      '4. 直接输出章节正文，不要加解释、注释、标题说明或思考过程。'
    );

    return parts.join('\n');
  }

  async generateOutline(novelInfo, targetChapters = 100) {
    const prompt = [
      '你是一位专业的小说策划，请为以下小说生成详细大纲。',
      '',
      `小说标题：《${novelInfo.title}》`,
      `小说类型：${novelInfo.type || '未提供'}`,
      `小说简介：${novelInfo.description || '未提供'}`,
      `计划章节数：${targetChapters}章`,
      '',
      '请输出以下内容：',
      '1. 故事背景',
      '2. 主要人物',
      '3. 主线剧情',
      '4. 分阶段剧情规划',
      '',
      '请严格输出 JSON，格式示例：',
      '{"背景":"...","人物":[...],"主线":"...","情节":[...]}'
    ].join('\n');

    const result = await this.generate(prompt, { maxTokens: 3000, temperature: 0.7 });
    return this.parseJSON(this.stripThinking(result));
  }

  parseJSON(text) {
    try {
      const jsonMatch = String(text).match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return JSON.parse(text);
    } catch {
      console.warn('JSON 解析失败，返回原始文本');
      return { raw: text };
    }
  }

  stripThinking(text = '') {
    return String(text)
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<think>[\s\S]*/gi, '')
      .trim();
  }

  cleanTitle(text = '', novelInfo = {}) {
    const stripped = this.stripThinking(text);
    const lines = stripped
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    let candidate = lines[0] || '';

    for (const line of lines) {
      if (!/^([#>*-]|\d+\.)/.test(line)) {
        candidate = line;
        break;
      }
    }

    candidate = candidate
      .replace(/^标题[:：]\s*/i, '')
      .replace(/^书名[:：]\s*/i, '')
      .replace(/^第\s*\d+\s*章[:：\s]*/i, '')
      .replace(/^["'“”‘’《》【】()（）]+|["'“”‘’《》【】()（）]+$/g, '')
      .replace(/\s+/g, '')
      .trim();

    if (!candidate || candidate.length > 20 || /[<>]/.test(candidate)) {
      return this.buildFallbackTitle(novelInfo);
    }

    return candidate;
  }

  cleanContent(text = '') {
    return this.stripThinking(text)
      .replace(/^正文[:：]\s*/i, '')
      .trim();
  }

  buildFallbackTitle(novelInfo = {}) {
    const type = String(novelInfo.type || '').trim();
    const description = String(novelInfo.description || '').trim();
    const summary = description.replace(/[，。！？、；：,.!?;:\s]/g, '');

    if (summary.length >= 4) {
      return summary.slice(0, 8);
    }

    if (type) {
      return `${type}新篇`;
    }

    return '新的篇章';
  }
}

module.exports = AIWriter;

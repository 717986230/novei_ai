const { request } = require('../../utils/request');

Page({
  data: {
    hasAiConfig: false,
    novelTitle: '',
    alerts: [],
    misconfiguredPlatforms: [],
    stats: {
      total: 0,
      published: 0,
      unpublished: 0,
      totalWords: 0,
      averageWords: 0
    },
    latest: []
  },

  onShow() {
    this.refreshAll();
  },

  onPullDownRefresh() {
    this.refreshAll().finally(() => wx.stopPullDownRefresh());
  },

  async refreshAll() {
    await Promise.all([this.loadConfig(), this.loadNovelInfo(), this.loadLatest()]);
    this.buildAlerts();
  },

  async loadConfig() {
    try {
      const data = await request('/api/config');
      const ai = data?.ai || {};
      const platforms = data?.platforms || {};
      const misconfiguredPlatforms = Object.entries(platforms)
        .filter(([, cfg]) => cfg && cfg.enabled && !cfg.cookies)
        .map(([name]) => name);
      this.setData({
        hasAiConfig: Boolean(ai.apiUrl && (ai.hasApiKey || ai.apiKey)),
        misconfiguredPlatforms
      });
    } catch (error) {
      wx.showToast({ title: '配置加载失败', icon: 'none' });
    }
  },

  async loadNovelInfo() {
    try {
      const data = await request('/api/novel-info');
      this.setData({
        novelTitle: data?.title || '',
        stats: data?.stats || this.data.stats
      });
    } catch (error) {
      wx.showToast({ title: '小说信息加载失败', icon: 'none' });
    }
  },

  async loadLatest() {
    try {
      const chapters = await request('/api/chapters');
      const list = Array.isArray(chapters) ? chapters.slice(-5).reverse() : [];
      this.setData({ latest: list });
    } catch (error) {
      wx.showToast({ title: '章节加载失败', icon: 'none' });
    }
  },

  goCreate() {
    wx.switchTab({ url: '/pages/create/create' });
  },

  goPublish() {
    wx.switchTab({ url: '/pages/publish/publish' });
  },

  goConfig() {
    wx.switchTab({ url: '/pages/config/config' });
  },

  buildAlerts() {
    const alerts = [];
    if (!this.data.hasAiConfig) {
      alerts.push('AI 配置未完成，无法稳定生成章节');
    }
    if (!this.data.novelTitle) {
      alerts.push('尚未创建小说，请先到创作页初始化项目');
    }
    if ((this.data.stats.unpublished || 0) > 0) {
      alerts.push(`当前有 ${this.data.stats.unpublished} 章待发布`);
    }
    const badPlatforms = this.data.misconfiguredPlatforms || [];
    if (badPlatforms.length > 0) {
      alerts.push(`平台配置不完整：${badPlatforms.join('、')}（缺少 cookies）`);
    }
    this.setData({ alerts });
  }
});

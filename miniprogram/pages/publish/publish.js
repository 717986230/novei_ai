const { request } = require('../../utils/request');

Page({
  data: {
    chapters: [],
    unpublishedCount: 0,
    publishing: false,
    message: '',
    success: false,
    publishResults: [],
    publishHistory: [],
    retrying: false,
    hasFailedItems: false
  },

  onShow() {
    this.loadHistory();
    this.loadChapters();
  },

  onPullDownRefresh() {
    this.loadChapters().finally(() => wx.stopPullDownRefresh());
  },

  async loadChapters() {
    try {
      const list = await request('/api/chapters');
      const chapters = Array.isArray(list) ? list.slice().reverse() : [];
      const unpublishedCount = chapters.filter((c) => !c.published).length;
      this.setData({ chapters, unpublishedCount });
    } catch (error) {
      this.setData({
        success: false,
        message: `加载章节失败: ${error.errMsg || error.message}`
      });
    }
  },

  formatResults(results) {
    if (!Array.isArray(results)) return [];
    return results.map((item) => {
      const platforms = item.platforms || {};
      const platformList = Object.entries(platforms).map(([name, detail]) => ({
        name,
        success: !!detail.success,
        error: detail.error || ''
      }));
      return {
        ...item,
        platformList
      };
    });
  },

  loadHistory() {
    const publishHistory = wx.getStorageSync('publishHistory') || [];
    this.setData({ publishHistory });
  },

  saveHistory() {
    wx.setStorageSync('publishHistory', this.data.publishHistory);
  },

  appendHistory(type, success, results, message) {
    const resultBrief = (results || []).map((row) => ({
      chapter: row.chapter,
      success: !!row.success
    }));
    const historyItem = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      success: !!success,
      message: message || '',
      operatedAt: new Date().toISOString(),
      operatedAtText: this.formatTime(new Date().toISOString()),
      results: resultBrief
    };
    const merged = [historyItem, ...this.data.publishHistory].slice(0, 10);
    this.setData({ publishHistory: merged });
    this.saveHistory();
  },

  formatTime(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return isoString;
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  },

  async publishNow() {
    this.setData({ publishing: true, message: '' });
    try {
      const data = await request('/api/publish', 'POST');
      const formatted = this.formatResults(data.results);
      this.setData({
        success: !!data.success,
        message: data.message || (data.success ? '发布成功' : '发布失败'),
        publishResults: formatted
      });
      this.appendHistory('publish', data.success, formatted, data.message || '');
      this.syncFailedFlag();
      await this.loadChapters();
    } catch (error) {
      this.setData({
        success: false,
        message: `发布失败: ${error.errMsg || error.message}`
      });
    } finally {
      this.setData({ publishing: false });
    }
  },

  getRetryItems() {
    const retryItems = [];
    for (const row of this.data.publishResults) {
      const failedPlatforms = (row.platformList || [])
        .filter((p) => !p.success)
        .map((p) => p.name);
      if (failedPlatforms.length > 0) {
        retryItems.push({
          chapter: row.chapter,
          platforms: failedPlatforms
        });
      }
    }
    return retryItems;
  },

  async retryFailed() {
    const retryItems = this.getRetryItems();
    if (retryItems.length === 0) {
      this.setData({
        success: false,
        message: '当前没有可重试的失败项'
      });
      return;
    }

    this.setData({ retrying: true, message: '' });
    try {
      const data = await request('/api/publish/retry', 'POST', { retryItems });
      const formatted = this.formatResults(data.results);
      this.setData({
        success: !!data.success,
        message: data.success
          ? `重试完成：成功 ${data.count}，失败 ${data.failed}`
          : (data.error || '重试失败'),
        publishResults: formatted
      });
      this.appendHistory('retry', data.success, formatted, data.message || data.error || '');
      this.syncFailedFlag();
      await this.loadChapters();
    } catch (error) {
      this.setData({
        success: false,
        message: `重试失败: ${error.errMsg || error.message}`
      });
    } finally {
      this.setData({ retrying: false });
    }
  },

  syncFailedFlag() {
    const hasFailedItems = this.data.publishResults
      .some((row) => (row.platformList || []).some((p) => !p.success));
    this.setData({ hasFailedItems });
  },

  clearHistory() {
    wx.removeStorageSync('publishHistory');
    this.setData({ publishHistory: [] });
  }
});

const { request } = require('../../utils/request');

Page({
  data: {
    apiBaseUrl: '',
    apiUrl: '',
    apiKey: '',
    model: '',
    proxyUrl: '',
    hasSavedApiKey: false,
    testing: false,
    saving: false,
    resultMessage: '',
    resultSuccess: false
  },

  onShow() {
    const app = getApp();
    this.setData({ apiBaseUrl: app.globalData.apiBaseUrl });
    this.loadConfig();
  },

  onApiBaseUrlInput(e) {
    this.setData({ apiBaseUrl: e.detail.value.trim() });
  },

  onApiUrlInput(e) {
    this.setData({ apiUrl: e.detail.value.trim() });
  },

  onApiKeyInput(e) {
    this.setData({ apiKey: e.detail.value.trim() });
  },

  onModelInput(e) {
    this.setData({ model: e.detail.value.trim() });
  },

  onProxyUrlInput(e) {
    this.setData({ proxyUrl: e.detail.value.trim() });
  },

  persistBaseUrl() {
    const value = this.data.apiBaseUrl;
    if (!value) {
      this.showResult(false, '请先填写后端地址');
      return false;
    }
    const app = getApp();
    app.globalData.apiBaseUrl = value;
    wx.setStorageSync('apiBaseUrl', value);
    return true;
  },

  async loadConfig() {
    try {
      const data = await request('/api/config');
      if (data && data.ai) {
        this.setData({
          apiUrl: data.ai.apiUrl || '',
          apiKey: '',
          model: data.ai.model || '',
          proxyUrl: data.ai.proxyUrl || '',
          hasSavedApiKey: !!data.ai.hasApiKey
        });
      }
    } catch (error) {
      this.showResult(false, `加载配置失败: ${error.errMsg || error.message}`);
    }
  },

  async testConnection() {
    if (!this.persistBaseUrl()) return;
    const { apiUrl, apiKey, model, proxyUrl, hasSavedApiKey } = this.data;
    if (!apiUrl || (!apiKey && !hasSavedApiKey)) {
      this.showResult(false, '请填写 API 地址和 API Key（或先保存过 API Key）');
      return;
    }

    this.setData({ testing: true, resultMessage: '' });
    try {
      const data = await request('/api/test-connection', 'POST', {
        apiUrl,
        apiKey,
        model,
        proxyUrl
      });
      if (data.success) {
        this.showResult(true, `连接成功: ${data.message || ''}`);
      } else {
        this.showResult(false, `连接失败: ${data.error || '未知错误'}`);
      }
    } catch (error) {
      this.showResult(false, `连接失败: ${error.errMsg || error.message}`);
    } finally {
      this.setData({ testing: false });
    }
  },

  async saveConfig() {
    if (!this.persistBaseUrl()) return;
    const { apiUrl, apiKey, model, proxyUrl, hasSavedApiKey } = this.data;
    if (!apiUrl || (!apiKey && !hasSavedApiKey)) {
      this.showResult(false, '请填写 API 地址和 API Key（或先保存过 API Key）');
      return;
    }

    this.setData({ saving: true, resultMessage: '' });
    try {
      const data = await request('/api/save-config', 'POST', {
        apiUrl,
        apiKey,
        model,
        proxyUrl
      });
      if (data.success) {
        this.setData({ hasSavedApiKey: hasSavedApiKey || !!apiKey });
        this.showResult(true, '配置保存成功');
      } else {
        this.showResult(false, `保存失败: ${data.error || '未知错误'}`);
      }
    } catch (error) {
      this.showResult(false, `保存失败: ${error.errMsg || error.message}`);
    } finally {
      this.setData({ saving: false });
    }
  },

  goDashboard() {
    wx.switchTab({ url: '/pages/dashboard/dashboard' });
  },

  showResult(success, message) {
    this.setData({
      resultSuccess: success,
      resultMessage: message
    });
  }
});

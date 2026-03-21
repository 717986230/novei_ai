const { request } = require('../../utils/request');

Page({
  data: {
    novelTitle: '',
    novelType: '',
    novelDesc: '',
    stats: {
      total: 0,
      published: 0,
      totalWords: 0
    },
    chapters: [],
    creating: false,
    generatingOne: false,
    generatingBatch: false,
    publishing: false,
    resultMessage: '',
    resultSuccess: false
  },

  onShow() {
    this.refreshAll();
  },

  onPullDownRefresh() {
    this.refreshAll().finally(() => wx.stopPullDownRefresh());
  },

  onNovelTitleInput(e) {
    this.setData({ novelTitle: e.detail.value.trim() });
  },

  onNovelTypeInput(e) {
    this.setData({ novelType: e.detail.value.trim() });
  },

  onNovelDescInput(e) {
    this.setData({ novelDesc: e.detail.value.trim() });
  },

  async refreshAll() {
    await Promise.all([this.loadNovelInfo(), this.loadChapters()]);
  },

  async loadNovelInfo() {
    try {
      const data = await request('/api/novel-info');
      this.setData({
        novelTitle: data?.title || this.data.novelTitle,
        novelType: data?.type || this.data.novelType,
        novelDesc: data?.description || this.data.novelDesc,
        stats: data?.stats || { total: 0, published: 0, totalWords: 0 }
      });
    } catch (error) {
      this.showResult(false, `加载小说信息失败: ${error.errMsg || error.message}`);
    }
  },

  async loadChapters() {
    try {
      const list = await request('/api/chapters');
      const chapters = Array.isArray(list) ? list.slice().reverse() : [];
      this.setData({ chapters });
    } catch (error) {
      this.showResult(false, `加载章节失败: ${error.errMsg || error.message}`);
    }
  },

  async createNovel() {
    const { novelTitle, novelType, novelDesc } = this.data;
    if (!novelType && !novelDesc) {
      this.showResult(false, '请至少填写小说类型或简介');
      return;
    }

    this.setData({ creating: true, resultMessage: '' });
    try {
      const data = await request('/api/create-novel', 'POST', {
        title: novelTitle,
        type: novelType,
        description: novelDesc
      });
      if (data.success) {
        this.showResult(true, `创建成功，书名：${data.title || novelTitle}`);
        await this.refreshAll();
      } else {
        this.showResult(false, `创建失败: ${data.error || '未知错误'}`);
      }
    } catch (error) {
      this.showResult(false, `创建失败: ${error.errMsg || error.message}`);
    } finally {
      this.setData({ creating: false });
    }
  },

  async generateChapter() {
    this.setData({ generatingOne: true, resultMessage: '' });
    try {
      const data = await request('/api/generate-chapter', 'POST');
      if (data.success) {
        this.showResult(true, `第${data.chapter.number}章《${data.chapter.title}》生成完成`);
        await this.refreshAll();
      } else {
        this.showResult(false, `生成失败: ${data.error || '未知错误'}`);
      }
    } catch (error) {
      this.showResult(false, `生成失败: ${error.errMsg || error.message}`);
    } finally {
      this.setData({ generatingOne: false });
    }
  },

  async generateTen() {
    this.setData({ generatingBatch: true, resultMessage: '' });
    try {
      const data = await request('/api/generate-chapters', 'POST', { count: 10 });
      if (data.success) {
        this.showResult(true, `成功生成 ${data.count} 章`);
        await this.refreshAll();
      } else {
        this.showResult(false, `批量生成失败: ${data.error || '未知错误'}`);
      }
    } catch (error) {
      this.showResult(false, `批量生成失败: ${error.errMsg || error.message}`);
    } finally {
      this.setData({ generatingBatch: false });
    }
  },

  async publishChapters() {
    this.setData({ publishing: true, resultMessage: '' });
    try {
      const data = await request('/api/publish', 'POST');
      if (data.success) {
        this.showResult(true, data.message || `发布成功，共 ${data.count} 章`);
      } else {
        this.showResult(false, data.message || `发布失败: ${data.error || '未知错误'}`);
      }
      await this.refreshAll();
    } catch (error) {
      this.showResult(false, `发布失败: ${error.errMsg || error.message}`);
    } finally {
      this.setData({ publishing: false });
    }
  },

  showResult(success, message) {
    this.setData({
      resultSuccess: success,
      resultMessage: message
    });
  }
});

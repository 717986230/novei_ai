App({
  globalData: {
    // 真机调试请改成可访问的局域网 IP，如 http://192.168.1.10:3000
    apiBaseUrl: 'http://127.0.0.1:3000'
  },

  onLaunch() {
    const savedBaseUrl = wx.getStorageSync('apiBaseUrl');
    if (savedBaseUrl) {
      this.globalData.apiBaseUrl = savedBaseUrl;
    }
  }
});

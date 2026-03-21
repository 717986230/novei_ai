function request(path, method = 'GET', data = {}) {
  const app = getApp();
  const baseUrl = app.globalData.apiBaseUrl;

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}${path}`,
      method,
      data,
      timeout: 30000,
      header: {
        'content-type': 'application/json'
      },
      success: (res) => {
        resolve(res.data);
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
}

module.exports = {
  request
};

// app.js — 启用微信云开发
App({
  globalData: {
    cloudEnv: '',        // 首次使用请在微信开发者工具 > 云开发 控制台创建环境并填入 ID
    openid: '',
    user: null,
    categories: [],
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      wx.showModal({
        title: '云开发不可用',
        content: '请升级微信基础库至 2.2.3+，并在微信开发者工具中开通云开发',
        showCancel: false,
      });
      return;
    }

    wx.cloud.init({
      env: this.globalData.cloudEnv || undefined,  // 不填则使用默认环境
      traceUser: true,
    });

    // 恢复本地缓存的用户信息
    const user = wx.getStorageSync('user');
    const openid = wx.getStorageSync('openid');
    if (user) this.globalData.user = user;
    if (openid) this.globalData.openid = openid;
  },

  /**
   * 统一调用云函数封装
   * @param {string} name    云函数名（如 'todo'、'category'）
   * @param {object} data    传给云函数的 event 数据
   */
  call(name, data = {}) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name,
        data,
        success: (res) => {
          const r = res.result || {};
          if (r.code === 0) {
            resolve(r);
          } else if (r.code === 401) {
            // 未登录：清理并跳登录
            wx.removeStorageSync('user');
            wx.removeStorageSync('openid');
            this.globalData.user = null;
            this.globalData.openid = '';
            wx.reLaunch({ url: '/pages/login/login' });
            reject(r);
          } else {
            wx.showToast({ title: r.msg || '请求失败', icon: 'none' });
            reject(r);
          }
        },
        fail: (err) => {
          console.error('[callFunction fail]', name, err);
          wx.showToast({ title: '网络错误', icon: 'none' });
          reject(err);
        },
      });
    });
  },
});

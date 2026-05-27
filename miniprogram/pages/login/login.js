// login.js — 微信云开发登录（wx.getUserProfile + login 云函数）
const app = getApp();
const api = require('../../utils/api');

Page({
  data: {
    loading: false,
    avatarUrl: '',
    nickName: '',
  },

  onLoad() {
    if (app.globalData.openid && app.globalData.user) {
      wx.switchTab({ url: '/pages/index/index' });
    }
  },

  onChooseAvatar(e) {
    this.setData({ avatarUrl: e.detail.avatarUrl });
  },

  onNicknameInput(e) {
    this.setData({ nickName: e.detail.value });
  },

  async onQuickLogin() {
    await this.callLoginCloud(null);
  },

  async onAuthorizeLogin() {
    if (this.data.loading) return;
    const profile = {};
    if (this.data.nickName) profile.nickName = this.data.nickName;
    if (this.data.avatarUrl) profile.avatarUrl = this.data.avatarUrl;
    await this.callLoginCloud(profile);
  },

  // 调用 login 云函数
  async callLoginCloud(profile) {
    this.setData({ loading: true });
    try {
      const res = await api.login(profile || {});
      const { openid, user } = res.data;

      app.globalData.openid = openid;
      app.globalData.user = user;
      wx.setStorageSync('openid', openid);
      wx.setStorageSync('user', user);

      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 400);
    } catch (err) {
      console.error('登录失败', err);
    } finally {
      this.setData({ loading: false });
    }
  },
});

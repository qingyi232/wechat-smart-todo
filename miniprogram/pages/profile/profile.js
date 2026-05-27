const app = getApp();
const api = require('../../utils/api');

Page({
  data: {
    profile: {},
    showEdit: false,
    editForm: { nickname: '', phone: '' },
  },

  onShow() {
    this.loadProfile();
  },

  async loadProfile() {
    try {
      const res = await api.getProfile();
      this.setData({
        profile: {
          ...res.data,
          push_enabled: !!res.data.push_enabled,
        },
      });
    } catch {}
  },

  onCategory() { wx.navigateTo({ url: '/pages/category/category' }); },
  onArchive() { wx.navigateTo({ url: '/pages/archive/archive' }); },

  onEditProfile() {
    this.setData({
      showEdit: true,
      editForm: {
        nickname: this.data.profile.nickname || '',
        phone: this.data.profile.phone || '',
      },
    });
  },

  closeEdit() { this.setData({ showEdit: false }); },

  noop() {},

  onEditInput(e) {
    this.setData({ [`editForm.${e.currentTarget.dataset.field}`]: e.detail.value });
  },

  async saveProfile() {
    try {
      await api.updateProfile({
        nickname: this.data.editForm.nickname,
        phone: this.data.editForm.phone,
      });
      wx.showToast({ title: '保存成功', icon: 'success' });
      this.closeEdit();
      await this.loadProfile();
      const user = { ...app.globalData.user, ...this.data.editForm };
      app.globalData.user = user;
      wx.setStorageSync('user', user);
    } catch {}
  },

  async togglePush(e) {
    const enabled = e.detail.value;
    try {
      await api.updateProfile({ pushEnabled: enabled ? 1 : 0 });
      this.setData({ 'profile.push_enabled': enabled });
      wx.showToast({ title: enabled ? '已开启' : '已关闭', icon: 'success' });
    } catch {}
  },

  onClearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '确定要清除本地缓存吗？（不会影响云端数据）',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync();
          wx.setStorageSync('openid', app.globalData.openid);
          wx.setStorageSync('user', app.globalData.user);
          wx.showToast({ title: '已清除', icon: 'success' });
        }
      },
    });
  },

  onAbout() {
    wx.showModal({
      title: '关于我们',
      content: '智能待办清单 v1.0\n\n基于微信小程序 + 微信云开发架构\n云函数处理业务逻辑，云数据库持久化\n支持订阅消息推送提醒\n\n让每一天都井然有序。',
      showCancel: false,
    });
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      confirmColor: '#EF5A6F',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('openid');
          wx.removeStorageSync('user');
          app.globalData.openid = '';
          app.globalData.user = null;
          wx.reLaunch({ url: '/pages/login/login' });
        }
      },
    });
  },
});

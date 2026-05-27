const api = require('../../utils/api');
const { formatDate } = require('../../utils/date');

Page({
  data: {
    todos: [],
  },

  onShow() { this.loadData(); },

  async onPullDownRefresh() {
    await this.loadData();
    wx.stopPullDownRefresh();
  },

  async loadData() {
    try {
      const res = await api.getTodos({ status: 'completed', sort_by: 'createdAt' });
      const list = res.data.map(t => ({
        ...t,
        completed_text: t.completed_at ? formatDate(t.completed_at, 'MM-DD HH:mm') : '',
      }));
      this.setData({ todos: list });
    } catch {}
  },

  async onRestore(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await api.toggleTodo(id);
      wx.showToast({ title: '已恢复', icon: 'success' });
      this.loadData();
    } catch {}
  },

  async onDelete(e) {
    const id = e.currentTarget.dataset.id;
    const r = await new Promise(r => wx.showModal({
      title: '永久删除',
      content: '确定要永久删除这条待办吗？',
      confirmColor: '#EF5A6F',
      success: r,
    }));
    if (!r.confirm) return;
    try {
      await api.removeTodo(id);
      wx.showToast({ title: '已删除', icon: 'success' });
      this.loadData();
    } catch {}
  },
});

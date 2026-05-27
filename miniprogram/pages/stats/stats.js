const api = require('../../utils/api');

Page({
  data: {
    data: {
      base: {}, weekTrend: [], byCategory: [], byPriority: [],
    },
    priorityLabels: { 1: '低', 2: '中', 3: '高', 4: '紧急' },
    priorityColors: { 1: '#9CA3AF', 2: '#5B8DEF', 3: '#F59E5B', 4: '#EF5A6F' },
    motto: '',
  },

  onShow() {
    this.loadData();
  },

  async onPullDownRefresh() {
    await this.loadData();
    wx.stopPullDownRefresh();
  },

  async loadData() {
    try {
      const res = await api.getDashboard();
      const data = res.data;

      // 计算趋势图百分比
      const maxTrend = Math.max(...data.weekTrend.map(t => Math.max(t.completed, t.created)), 1);
      data.weekTrend = data.weekTrend.map(t => ({
        ...t,
        completedPct: Math.round(t.completed / maxTrend * 100),
        createdPct: Math.round(t.created / maxTrend * 100),
      }));

      // 分类百分比
      const totalCat = data.byCategory.reduce((s, c) => s + c.count, 0) || 1;
      data.byCategory = data.byCategory.map(c => ({
        ...c,
        pct: Math.round(c.count / totalCat * 100),
      }));

      // 优先级百分比
      const maxPr = Math.max(...data.byPriority.map(p => p.count), 1);
      data.byPriority = data.byPriority.map(p => ({
        ...p,
        pct: Math.round(p.count / maxPr * 100),
      }));

      this.setData({
        data,
        motto: this.getMotto(data.completionRate),
      });
    } catch {}
  },

  getMotto(rate) {
    if (rate >= 80) return '“坚持就是胜利，为自己喝彩！”';
    if (rate >= 50) return '“进步就是每天比昨天好一点”';
    if (rate >= 20) return '“一切伟大的行动都始于一个决定”';
    return '“千里之行，始于足下”';
  },
});

const app = getApp();
const api = require('../../utils/api');
const { relativeDate, isOverdue } = require('../../utils/date');

Page({
  data: {
    user: {},
    greeting: '',
    quote: '',
    summary: {},
    todos: [],
    categories: [],
    keyword: '',
    status: 'active',
    filterCategory: '',
    priorityLabels: { 1: '低', 2: '中', 3: '高', 4: '紧急' },
  },

  onLoad() {
    this.setData({
      user: app.globalData.user || wx.getStorageSync('user') || {},
      greeting: this.getGreeting(),
      quote: this.getQuote(),
    });
  },

  onShow() {
    this.setData({ user: app.globalData.user || wx.getStorageSync('user') || {} });
    this.loadAll();
  },

  async onPullDownRefresh() {
    await this.loadAll();
    wx.stopPullDownRefresh();
  },

  async loadAll() {
    await Promise.all([this.loadSummary(), this.loadCategories(), this.loadTodos()]);
  },

  async loadSummary() {
    try {
      const res = await api.getTodoSummary();
      this.setData({ summary: res.data });
    } catch {}
  },

  async loadCategories() {
    try {
      const res = await api.getCategories();
      // 只展示用户自己的分类（is_system=0）
      const userCats = res.data.filter(c => !c.is_system);
      this.setData({ categories: userCats });
    } catch {}
  },

  async loadTodos() {
    try {
      const res = await api.getTodos({
        status: this.data.status,
        category_id: this.data.filterCategory,
        keyword: this.data.keyword,
        sort_by: 'dueDate',
      });
      const list = res.data.map(t => ({
        ...t,
        due_text: t.due_date ? relativeDate(t.due_date) : '',
        overdue: !t.is_completed && t.due_date && isOverdue(t.due_date),
      }));
      this.setData({ todos: list });
    } catch (err) {
      console.error('加载待办失败', err);
    }
  },

  onKeywordInput(e) { this.setData({ keyword: e.detail.value }); },
  onSearch() { this.loadTodos(); },
  clearKeyword() { this.setData({ keyword: '' }); this.loadTodos(); },

  changeStatus(e) {
    this.setData({ status: e.currentTarget.dataset.status });
    this.loadTodos();
  },

  changeCategory(e) {
    this.setData({ filterCategory: e.currentTarget.dataset.id });
    this.loadTodos();
  },

  onTodoTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/todoEdit/todoEdit?id=${id}` });
  },

  async onToggle(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await api.toggleTodo(id);
      wx.vibrateShort({ type: 'light' });
      await this.loadAll();
    } catch {}
  },

  onAdd() {
    wx.navigateTo({ url: '/pages/todoEdit/todoEdit' });
  },

  getGreeting() {
    const h = new Date().getHours();
    if (h < 6) return '夜深了';
    if (h < 11) return '早上好 ☀';
    if (h < 14) return '中午好 🌤';
    if (h < 18) return '下午好 🌇';
    if (h < 22) return '晚上好 🌙';
    return '夜深了 🌌';
  },

  getQuote() {
    const quotes = [
      '“今日事今日毕，明日又有明日事”',
      '“千里之行，始于足下”',
      '“把每一件小事做好，就是大事”',
      '“时间是最公平的资源”',
      '“先完成，再完美”',
      '“高效的秘诀在于专注”',
    ];
    return quotes[Math.floor(Math.random() * quotes.length)];
  },
});

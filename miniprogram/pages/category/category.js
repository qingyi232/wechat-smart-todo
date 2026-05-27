const api = require('../../utils/api');

Page({
  data: {
    categories: [],
    showModal: false,
    isEdit: false,
    editingId: null,
    form: { name: '', color: '#2EAA8A' },
    colorOptions: [
      '#2EAA8A', '#5B8DEF', '#F59E5B', '#EF5A6F', '#9CA3AF',
      '#A855F7', '#EC4899', '#10B981', '#3B82F6', '#F97316',
      '#14B8A6', '#F43F5E',
    ],
  },

  onShow() {
    this.loadCats();
  },

  async loadCats() {
    try {
      const res = await api.getCategories();
      this.setData({ categories: res.data.filter(c => !c.is_system) });
    } catch {}
  },

  onAdd() {
    this.setData({
      showModal: true,
      isEdit: false,
      editingId: null,
      form: { name: '', color: '#2EAA8A' },
    });
  },

  editCat(e) {
    const { id, name, color } = e.currentTarget.dataset;
    this.setData({
      showModal: true,
      isEdit: true,
      editingId: id,
      form: { name, color },
    });
  },

  setField(e) {
    this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value });
  },

  selectColor(e) {
    this.setData({ 'form.color': e.currentTarget.dataset.color });
  },

  closeModal() { this.setData({ showModal: false }); },

  noop() {},

  async saveCat() {
    const f = this.data.form;
    if (!f.name.trim()) {
      wx.showToast({ title: '请输入名称', icon: 'none' });
      return;
    }
    try {
      if (this.data.isEdit) {
        await api.updateCategory(this.data.editingId, { name: f.name.trim(), color: f.color });
      } else {
        await api.createCategory({ name: f.name.trim(), color: f.color });
      }
      wx.showToast({ title: '保存成功', icon: 'success' });
      this.closeModal();
      await this.loadCats();
    } catch {}
  },

  async deleteCat(e) {
    const { id, name } = e.currentTarget.dataset;
    const r = await new Promise(r => wx.showModal({
      title: '删除分类',
      content: `确定要删除"${name}"？该分类下的待办将自动归入"其他"`,
      confirmColor: '#EF5A6F',
      success: r,
    }));
    if (!r.confirm) return;
    try {
      await api.removeCategory(id);
      wx.showToast({ title: '已删除', icon: 'success' });
      await this.loadCats();
    } catch {}
  },
});

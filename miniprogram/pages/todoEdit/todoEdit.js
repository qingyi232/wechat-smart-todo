const api = require('../../utils/api');

Page({
  data: {
    isEdit: false,
    editingId: null,
    form: {
      title: '',
      description: '',
      category_id: null,
      category_name: '',
      category_color: '#2EAA8A',
      priority: 2,
      dueDatePart: '',
      dueTimePart: '',
      reminder_enabled: true,
      reminder_before: 60,
      is_repeat: false,
      repeat_type: '',
    },
    categories: [],
    priorities: [
      { val: 1, label: '低', color: '#9CA3AF' },
      { val: 2, label: '中', color: '#5B8DEF' },
      { val: 3, label: '高', color: '#F59E5B' },
      { val: 4, label: '紧急', color: '#EF5A6F' },
    ],
    reminderOptions: [15, 30, 60, 120, 1440],
    repeatOptions: [
      { val: 'daily', label: '每天' },
      { val: 'workday', label: '工作日' },
      { val: 'weekly', label: '每周' },
      { val: 'monthly', label: '每月' },
    ],
  },

  async onLoad(options) {
    await this.loadCategories();
    if (options.id) {
      this.setData({ isEdit: true, editingId: options.id });
      wx.setNavigationBarTitle({ title: '编辑待办' });
      await this.loadDetail(options.id);
    } else {
      wx.setNavigationBarTitle({ title: '新建待办' });
      // 默认用第一个分类
      if (this.data.categories.length) {
        const c = this.data.categories[0];
        this.setData({
          'form.category_id': c.id,
          'form.category_name': c.name,
          'form.category_color': c.color,
        });
      }
    }
  },

  async loadCategories() {
    try {
      const res = await api.getCategories();
      this.setData({ categories: res.data.filter(c => !c.is_system) });
    } catch {}
  },

  async loadDetail(id) {
    try {
      const res = await api.getTodoDetail(id);
      const d = res.data;
      let dueDatePart = '', dueTimePart = '';
      if (d.due_date) {
        const parts = d.due_date.split(/[\sT]/);
        dueDatePart = parts[0];
        dueTimePart = parts[1] ? parts[1].slice(0, 5) : '09:00';
      }
      this.setData({
        form: {
          title: d.title,
          description: d.description || '',
          category_id: d.category_id,
          category_name: d.category_name,
          category_color: d.category_color,
          priority: d.priority,
          dueDatePart,
          dueTimePart,
          reminder_enabled: !!d.reminder_enabled,
          reminder_before: d.reminder_before || 60,
          is_repeat: !!d.is_repeat,
          repeat_type: d.repeat_type || '',
        },
      });
    } catch {}
  },

  setField(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  selectCategory(e) {
    const { id, name, color } = e.currentTarget.dataset;
    this.setData({
      'form.category_id': id,
      'form.category_name': name,
      'form.category_color': color,
    });
  },

  selectPriority(e) {
    this.setData({ 'form.priority': Number(e.currentTarget.dataset.val) });
  },

  selectDueDate(e) { this.setData({ 'form.dueDatePart': e.detail.value }); },
  selectDueTime(e) { this.setData({ 'form.dueTimePart': e.detail.value }); },
  clearDueDate() { this.setData({ 'form.dueDatePart': '', 'form.dueTimePart': '' }); },

  toggleReminder(e) { this.setData({ 'form.reminder_enabled': e.detail.value }); },
  selectReminder(e) { this.setData({ 'form.reminder_before': Number(e.currentTarget.dataset.val) }); },
  toggleRepeat(e) { this.setData({ 'form.is_repeat': e.detail.value, 'form.repeat_type': e.detail.value ? 'daily' : '' }); },
  selectRepeatType(e) { this.setData({ 'form.repeat_type': e.currentTarget.dataset.val }); },

  async onSubmit() {
    const f = this.data.form;
    if (!f.title.trim()) {
      wx.showToast({ title: '请输入标题', icon: 'none' });
      return;
    }
    let due_date = null;
    if (f.dueDatePart) {
      due_date = f.dueDatePart + ' ' + (f.dueTimePart || '09:00') + ':00';
    }
    const payload = {
      title: f.title.trim(),
      description: f.description.trim(),
      category_id: f.category_id,
      category_name: f.category_name,
      category_color: f.category_color,
      priority: f.priority,
      due_date,
      reminder_enabled: !!f.reminder_enabled,
      reminder_before: f.reminder_before,
      is_repeat: !!f.is_repeat,
      repeat_type: f.repeat_type,
    };
    try {
      let todoId = this.data.editingId;
      if (this.data.isEdit) {
        await api.updateTodo(todoId, payload);
        wx.showToast({ title: '修改成功', icon: 'success' });
      } else {
        const res = await api.createTodo(payload);
        todoId = res.data && (res.data._id || res.data.id);
        wx.showToast({ title: '创建成功', icon: 'success' });
      }

      // 若开启了提醒且有到期时间，请求订阅消息授权，授权后保存配额供云函数推送
      if (f.reminder_enabled && due_date && todoId) {
        this.requestSubscribeAndSave(todoId);
      }

      setTimeout(() => wx.navigateBack(), 500);
    } catch {}
  },

  // 请求订阅消息授权（需要在 app 小程序管理后台配置好模板 ID）
  requestSubscribeAndSave(todoId) {
    // ！部署前请替换为真实模板 ID（与 reminder 云函数中 TEMPLATE_ID 一致）
    const TEMPLATE_ID = 'PLEASE_REPLACE_WITH_YOUR_TEMPLATE_ID';
    if (!wx.requestSubscribeMessage) return;

    wx.requestSubscribeMessage({
      tmplIds: [TEMPLATE_ID],
      success: async (res) => {
        if (res[TEMPLATE_ID] === 'accept') {
          try {
            await api.saveSubscribe(todoId, TEMPLATE_ID);
            console.log('订阅消息授权已保存');
          } catch (e) {
            console.warn('保存订阅授权失败', e);
          }
        }
      },
      fail: (err) => {
        console.warn('订阅消息请求失败', err);
      },
    });
  },

  async onDelete() {
    const res = await new Promise(r => wx.showModal({
      title: '删除待办',
      content: '删除后可在"已完成"中恢复',
      confirmColor: '#EF5A6F',
      success: (res) => r(res),
    }));
    if (!res.confirm) return;
    try {
      await api.removeTodo(this.data.editingId);
      wx.showToast({ title: '已删除', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 400);
    } catch {}
  },
});

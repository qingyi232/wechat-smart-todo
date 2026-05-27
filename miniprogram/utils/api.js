// api.js — 所有后端调用通过 wx.cloud.callFunction 走云函数
// 为了兼容前端原先的下划线字段风格（如 due_date），这里做一层
// snake_case <-> camelCase 自动转换。
const app = getApp();

// 下划线 -> 驼峰（前端 -> 云函数）
function toCamel(obj) {
  if (Array.isArray(obj)) return obj.map(toCamel);
  if (obj && typeof obj === 'object' && obj.constructor === Object) {
    const out = {};
    for (const k in obj) {
      const ck = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      out[ck] = toCamel(obj[k]);
    }
    return out;
  }
  return obj;
}

// 驼峰 -> 同时保留驼峰和下划线（云函数 -> 前端）
function addSnakeAlias(obj) {
  if (Array.isArray(obj)) return obj.map(addSnakeAlias);
  if (obj && typeof obj === 'object' && obj.constructor === Object) {
    const out = {};
    for (const k in obj) {
      const v = addSnakeAlias(obj[k]);
      out[k] = v;
      const sk = k.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (sk !== k && out[sk] === undefined) out[sk] = v;
    }
    // id 字段兼容：_id 也作为 id
    if (out._id !== undefined && out.id === undefined) out.id = out._id;
    return out;
  }
  return obj;
}

// 统一调用封装：接收下划线风格参数；返回数据自动补全下划线别名
function call(name, data = {}) {
  const payload = { ...data };
  if (payload.patch) payload.patch = toCamel(payload.patch);
  // 把常见字段名转驼峰传给云函数
  const converted = toCamel(payload);
  return app.call(name, converted).then(res => {
    if (res && res.data !== undefined) {
      res.data = addSnakeAlias(res.data);
    }
    return res;
  });
}

const api = {
  // ======= 登录/用户 =======
  login: (profile = {}) => call('login', { action: 'login', ...profile }),
  getProfile: () => call('login', { action: 'getProfile' }),
  updateProfile: (data) => call('login', { action: 'updateProfile', ...data }),

  // ======= 待办 CRUD =======
  getTodos: (params = {}) => call('todo', { action: 'list', ...params }),
  getTodoDetail: (id) => call('todo', { action: 'detail', id }),
  createTodo: (data) => call('todo', { action: 'create', ...data }),
  updateTodo: (id, patch) => call('todo', { action: 'update', id, patch }),
  toggleTodo: (id) => call('todo', { action: 'toggle', id }),
  removeTodo: (id) => call('todo', { action: 'remove', id }),
  restoreTodo: (id) => call('todo', { action: 'restore', id }),
  getTodoSummary: () => call('todo', { action: 'summary' }),

  // ======= 分类管理 =======
  getCategories: () => call('category', { action: 'list' }),
  createCategory: (data) => call('category', { action: 'create', ...data }),
  updateCategory: (id, data) => call('category', { action: 'update', id, ...data }),
  removeCategory: (id) => call('category', { action: 'remove', id }),

  // ======= 数据统计 =======
  getDashboard: () => call('stats', {}),

  // ======= 提醒 =======
  getUpcomingReminders: () => call('reminder', { action: 'upcoming' }),
  getReminderList: () => call('reminder', { action: 'list' }),
  saveSubscribe: (todoId, templateId) =>
    call('reminder', { action: 'saveSubscribe', todoId, templateId }),
};

module.exports = api;

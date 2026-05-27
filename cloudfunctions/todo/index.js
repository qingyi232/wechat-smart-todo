// 待办云函数：待办事项的 CRUD、列表筛选、完成切换、概要统计
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 根据 action 分发到不同子功能
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, msg: '未登录' };

  const { action } = event;

  switch (action) {
    case 'list':       return listTodos(OPENID, event);
    case 'detail':     return detailTodo(OPENID, event);
    case 'create':     return createTodo(OPENID, event);
    case 'update':     return updateTodo(OPENID, event);
    case 'toggle':     return toggleTodo(OPENID, event);
    case 'remove':     return removeTodo(OPENID, event);
    case 'restore':    return restoreTodo(OPENID, event);
    case 'summary':    return summaryTodos(OPENID);
    default:           return { code: 400, msg: `未知 action: ${action}` };
  }
};

// ============ 待办列表（支持筛选、搜索、排序） ============
async function listTodos(openid, event) {
  const { status = 'all', categoryId, sortBy = 'dueDate', keyword } = event;

  const where = { _openid: openid, isDeleted: false };

  if (status === 'active') where.isCompleted = false;
  else if (status === 'completed') where.isCompleted = true;
  else if (status === 'archived') where.isArchived = true;

  if (categoryId) where.categoryId = categoryId;
  if (keyword) {
    where.title = db.RegExp({ regexp: keyword, options: 'i' });
  }

  let query = db.collection('todos').where(where);

  if (sortBy === 'dueDate') {
    query = query.orderBy('dueDate', 'asc');
  } else if (sortBy === 'priority') {
    query = query.orderBy('priority', 'desc');
  } else {
    query = query.orderBy('createdAt', 'desc');
  }

  const res = await query.limit(500).get();
  return { code: 0, data: res.data };
}

// ============ 单条详情 ============
async function detailTodo(openid, event) {
  const { id } = event;
  if (!id) return { code: 400, msg: '缺少 id' };

  const res = await db.collection('todos').doc(id).get().catch(() => null);
  if (!res || !res.data || res.data._openid !== openid) {
    return { code: 404, msg: '待办不存在' };
  }
  return { code: 0, data: res.data };
}

// ============ 创建待办 ============
async function createTodo(openid, event) {
  const {
    title, description = '',
    categoryId = '', categoryName = '', categoryColor = '#2EAA8A',
    priority = 2, dueDate = null,
    isRepeat = false, repeatType = '', repeatEndDate = null,
    reminderEnabled = true, reminderBefore = 60,
    tags = [],
  } = event;

  if (!title || !title.trim()) {
    return { code: 400, msg: '请输入待办标题' };
  }

  const now = new Date();
  const doc = {
    _openid: openid,
    title: title.trim(),
    description,
    categoryId, categoryName, categoryColor,
    priority,
    dueDate: dueDate ? new Date(dueDate) : null,
    isCompleted: false,
    completedAt: null,
    isArchived: false,
    isDeleted: false,
    isRepeat, repeatType,
    repeatEndDate: repeatEndDate ? new Date(repeatEndDate) : null,
    reminderEnabled, reminderBefore,
    reminderSent: false,
    tags,
    createdAt: now,
    updatedAt: now,
  };

  const add = await db.collection('todos').add({ data: doc });

  // 更新用户计数
  await db.collection('users')
    .where({ _openid: openid })
    .update({ data: { totalTodoCount: _.inc(1) } });

  return { code: 0, msg: '创建成功', data: { _id: add._id, ...doc } };
}

// ============ 更新待办 ============
async function updateTodo(openid, event) {
  const { id, patch = {} } = event;
  if (!id) return { code: 400, msg: '缺少 id' };

  // 校验所属
  const exist = await db.collection('todos').doc(id).get().catch(() => null);
  if (!exist || !exist.data || exist.data._openid !== openid) {
    return { code: 404, msg: '待办不存在' };
  }

  const allowed = [
    'title', 'description', 'categoryId', 'categoryName', 'categoryColor',
    'priority', 'dueDate', 'isRepeat', 'repeatType', 'repeatEndDate',
    'reminderEnabled', 'reminderBefore', 'tags',
  ];
  const update = { updatedAt: new Date() };
  for (const k of allowed) {
    if (patch[k] !== undefined) {
      if (k === 'dueDate' || k === 'repeatEndDate') {
        update[k] = patch[k] ? new Date(patch[k]) : null;
      } else {
        update[k] = patch[k];
      }
    }
  }

  // 修改 dueDate 或 reminder 相关字段时重置 reminderSent
  if (patch.dueDate !== undefined || patch.reminderBefore !== undefined) {
    update.reminderSent = false;
  }

  await db.collection('todos').doc(id).update({ data: update });

  const latest = await db.collection('todos').doc(id).get();
  return { code: 0, msg: '更新成功', data: latest.data };
}

// ============ 切换完成状态（含重复任务自动创建） ============
async function toggleTodo(openid, event) {
  const { id } = event;
  if (!id) return { code: 400, msg: '缺少 id' };

  const exist = await db.collection('todos').doc(id).get().catch(() => null);
  if (!exist || !exist.data || exist.data._openid !== openid) {
    return { code: 404, msg: '待办不存在' };
  }

  const row = exist.data;
  const newCompleted = !row.isCompleted;
  const completedAt = newCompleted ? new Date() : null;

  await db.collection('todos').doc(id).update({
    data: {
      isCompleted: newCompleted,
      completedAt,
      isArchived: newCompleted,
      updatedAt: new Date(),
    },
  });

  // 更新用户累计
  if (newCompleted) {
    await db.collection('users').where({ _openid: openid })
      .update({ data: { completedCount: _.inc(1) } });

    // 重复任务：自动创建下一次
    if (row.isRepeat && row.repeatType && row.dueDate) {
      const next = computeNextDueDate(row.dueDate, row.repeatType);
      const endOk = !row.repeatEndDate || next <= row.repeatEndDate;
      if (next && endOk) {
        await db.collection('todos').add({
          data: {
            _openid: openid,
            title: row.title,
            description: row.description,
            categoryId: row.categoryId,
            categoryName: row.categoryName,
            categoryColor: row.categoryColor,
            priority: row.priority,
            dueDate: next,
            isCompleted: false,
            completedAt: null,
            isArchived: false,
            isDeleted: false,
            isRepeat: row.isRepeat,
            repeatType: row.repeatType,
            repeatEndDate: row.repeatEndDate,
            reminderEnabled: row.reminderEnabled,
            reminderBefore: row.reminderBefore,
            reminderSent: false,
            tags: row.tags || [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }
    }
  } else {
    await db.collection('users').where({ _openid: openid })
      .update({ data: { completedCount: _.inc(-1) } });
  }

  const latest = await db.collection('todos').doc(id).get();
  return { code: 0, data: latest.data };
}

function computeNextDueDate(currentDate, repeatType) {
  const d = new Date(currentDate);
  switch (repeatType) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      return d;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      return d;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      return d;
    case 'workday': {
      d.setDate(d.getDate() + 1);
      while (d.getDay() === 0 || d.getDay() === 6) {
        d.setDate(d.getDate() + 1);
      }
      return d;
    }
    default:
      return null;
  }
}

// ============ 软删除 ============
async function removeTodo(openid, event) {
  const { id } = event;
  const exist = await db.collection('todos').doc(id).get().catch(() => null);
  if (!exist || !exist.data || exist.data._openid !== openid) {
    return { code: 404, msg: '待办不存在' };
  }
  await db.collection('todos').doc(id).update({
    data: { isDeleted: true, updatedAt: new Date() },
  });
  return { code: 0, msg: '删除成功' };
}

// ============ 恢复 ============
async function restoreTodo(openid, event) {
  const { id } = event;
  const exist = await db.collection('todos').doc(id).get().catch(() => null);
  if (!exist || !exist.data || exist.data._openid !== openid) {
    return { code: 404, msg: '待办不存在' };
  }
  await db.collection('todos').doc(id).update({
    data: { isDeleted: false, updatedAt: new Date() },
  });
  return { code: 0, msg: '已恢复' };
}

// ============ 今日概要 ============
async function summaryTodos(openid) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const now = new Date();

  const [totalActiveRes, todayRes, overdueRes, completedRes] = await Promise.all([
    db.collection('todos').where({
      _openid: openid, isDeleted: false, isCompleted: false,
    }).count(),
    db.collection('todos').where({
      _openid: openid, isDeleted: false,
      dueDate: _.gte(todayStart).and(_.lte(todayEnd)),
    }).count(),
    db.collection('todos').where({
      _openid: openid, isDeleted: false, isCompleted: false,
      dueDate: _.lt(now).and(_.neq(null)),
    }).count(),
    db.collection('todos').where({
      _openid: openid, isDeleted: false, isCompleted: true,
    }).count(),
  ]);

  return {
    code: 0,
    data: {
      totalActive: totalActiveRes.total,
      todayCount: todayRes.total,
      overdueCount: overdueRes.total,
      completedCount: completedRes.total,
    },
  };
}

// 分类管理云函数：增删改查
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, msg: '未登录' };

  const { action } = event;
  switch (action) {
    case 'list':   return listCategories(OPENID);
    case 'create': return createCategory(OPENID, event);
    case 'update': return updateCategory(OPENID, event);
    case 'remove': return removeCategory(OPENID, event);
    default:       return { code: 400, msg: `未知 action: ${action}` };
  }
};

// 列出当前用户的分类（含各分类的待办数量）
async function listCategories(openid) {
  const catsRes = await db.collection('categories').where({ _openid: openid })
    .orderBy('sortOrder', 'asc').limit(100).get();
  const categories = catsRes.data;

  // 统计每个分类下的待办数
  const counts = await Promise.all(categories.map(cat =>
    db.collection('todos').where({
      _openid: openid, categoryId: cat._id, isDeleted: false,
    }).count()
  ));

  categories.forEach((cat, i) => {
    cat.todoCount = counts[i].total;
  });

  return { code: 0, data: categories };
}

// 创建分类
async function createCategory(openid, event) {
  const { name, color = '#2EAA8A', icon = 'tag' } = event;
  if (!name || !name.trim()) return { code: 400, msg: '请输入分类名称' };

  // 重名校验
  const exists = await db.collection('categories').where({
    _openid: openid, name: name.trim(),
  }).count();
  if (exists.total > 0) return { code: 400, msg: '分类名称已存在' };

  const add = await db.collection('categories').add({
    data: {
      _openid: openid,
      name: name.trim(),
      color, icon,
      isSystem: false,
      sortOrder: 99,
      createdAt: new Date(),
    },
  });

  return { code: 0, msg: '创建成功', data: { _id: add._id } };
}

// 更新分类
async function updateCategory(openid, event) {
  const { id, name, color, icon } = event;
  if (!id) return { code: 400, msg: '缺少 id' };

  const exist = await db.collection('categories').doc(id).get().catch(() => null);
  if (!exist || !exist.data || exist.data._openid !== openid) {
    return { code: 404, msg: '分类不存在' };
  }
  if (exist.data.isSystem) {
    return { code: 400, msg: '系统分类不可修改' };
  }

  const update = {};
  if (name !== undefined) update.name = name;
  if (color !== undefined) update.color = color;
  if (icon !== undefined) update.icon = icon;

  await db.collection('categories').doc(id).update({ data: update });

  // 同步更新 todos 中的冗余字段
  if (name !== undefined || color !== undefined) {
    const syncData = {};
    if (name !== undefined) syncData.categoryName = name;
    if (color !== undefined) syncData.categoryColor = color;

    await db.collection('todos').where({
      _openid: openid, categoryId: id,
    }).update({ data: syncData });
  }

  return { code: 0, msg: '更新成功' };
}

// 删除分类：把该分类的待办归到"其他"分类
async function removeCategory(openid, event) {
  const { id } = event;
  const exist = await db.collection('categories').doc(id).get().catch(() => null);
  if (!exist || !exist.data || exist.data._openid !== openid) {
    return { code: 404, msg: '分类不存在' };
  }
  if (exist.data.isSystem) {
    return { code: 400, msg: '系统分类不可删除' };
  }

  // 找到"其他"分类
  const other = await db.collection('categories').where({
    _openid: openid, name: '其他',
  }).limit(1).get();

  const fallbackId = other.data[0] ? other.data[0]._id : '';
  await db.collection('todos').where({
    _openid: openid, categoryId: id,
  }).update({
    data: {
      categoryId: fallbackId,
      categoryName: '其他',
      categoryColor: '#9CA3AF',
    },
  });

  await db.collection('categories').doc(id).remove();

  return { code: 0, msg: '已删除' };
}

// 数据统计云函数：数据面板聚合
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, msg: '未登录' };

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const now = new Date();
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  // 1. 基础统计
  const [totalRes, completedRes, activeRes, todayRes, overdueRes] = await Promise.all([
    db.collection('todos').where({ _openid: OPENID, isDeleted: false }).count(),
    db.collection('todos').where({ _openid: OPENID, isDeleted: false, isCompleted: true }).count(),
    db.collection('todos').where({ _openid: OPENID, isDeleted: false, isCompleted: false }).count(),
    db.collection('todos').where({
      _openid: OPENID, isDeleted: false,
      dueDate: _.gte(todayStart).and(_.lte(todayEnd)),
    }).count(),
    db.collection('todos').where({
      _openid: OPENID, isDeleted: false, isCompleted: false,
      dueDate: _.lt(now).and(_.neq(null)),
    }).count(),
  ]);

  const base = {
    total: totalRes.total,
    completed: completedRes.total,
    active: activeRes.total,
    todayCount: todayRes.total,
    overdue: overdueRes.total,
  };
  const completionRate = base.total > 0
    ? Math.round((base.completed / base.total) * 100) : 0;

  // 2. 按分类统计（聚合）
  let byCategory = [];
  try {
    const catAgg = await db.collection('todos')
      .aggregate()
      .match({ _openid: OPENID, isDeleted: false })
      .group({
        _id: '$categoryName',
        count: $.sum(1),
        color: $.first('$categoryColor'),
      })
      .sort({ count: -1 })
      .end();
    byCategory = catAgg.list
      .filter(x => x._id && x._id !== '')
      .map(x => ({ name: x._id, color: x.color || '#9CA3AF', count: x.count }));
  } catch (e) {
    byCategory = [];
  }

  // 3. 近 7 天完成趋势
  const weekTrend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const dEnd = new Date(d);
    dEnd.setHours(23, 59, 59, 999);

    const [completed, created] = await Promise.all([
      db.collection('todos').where({
        _openid: OPENID, isDeleted: false, isCompleted: true,
        completedAt: _.gte(d).and(_.lte(dEnd)),
      }).count(),
      db.collection('todos').where({
        _openid: OPENID, isDeleted: false,
        createdAt: _.gte(d).and(_.lte(dEnd)),
      }).count(),
    ]);

    weekTrend.push({
      date: `${d.getMonth() + 1}-${d.getDate()}`.padStart(5, '0'),
      completed: completed.total,
      created: created.total,
    });
  }

  // 4. 优先级分布
  let byPriority = [];
  try {
    const prioAgg = await db.collection('todos')
      .aggregate()
      .match({ _openid: OPENID, isDeleted: false, isCompleted: false })
      .group({ _id: '$priority', count: $.sum(1) })
      .sort({ _id: -1 })
      .end();
    byPriority = prioAgg.list.map(x => ({ priority: x._id, count: x.count }));
  } catch (e) {
    byPriority = [];
  }

  // 5. 本月完成数
  const monthRes = await db.collection('todos').where({
    _openid: OPENID, isDeleted: false, isCompleted: true,
    completedAt: _.gte(monthStart),
  }).count();

  // 6. 连续打卡天数
  const streakDays = await calculateStreak(OPENID);

  return {
    code: 0,
    data: {
      base,
      completionRate,
      byCategory,
      weekTrend,
      byPriority,
      monthCompleted: monthRes.total,
      streakDays,
    },
  };
};

async function calculateStreak(openid) {
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const dEnd = new Date(d);
    dEnd.setHours(23, 59, 59, 999);

    const res = await db.collection('todos').where({
      _openid: openid, isDeleted: false, isCompleted: true,
      completedAt: _.gte(d).and(_.lte(dEnd)),
    }).count();

    if (res.total > 0) streak++;
    else break;
  }
  return streak;
}

// 用户云函数：登录注册、获取/更新个人信息
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 系统预设分类（首次登录自动分配给用户）
const DEFAULT_CATEGORIES = [
  { name: '学习', color: '#4F46E5', icon: 'book', sortOrder: 0 },
  { name: '工作', color: '#0EA5E9', icon: 'briefcase', sortOrder: 1 },
  { name: '生活', color: '#10B981', icon: 'home', sortOrder: 2 },
  { name: '运动', color: '#F59E0B', icon: 'activity', sortOrder: 3 },
  { name: '其他', color: '#9CA3AF', icon: 'tag', sortOrder: 4 },
];

exports.main = async (event) => {
  const { OPENID, APPID, UNIONID } = cloud.getWXContext();
  if (!OPENID) {
    return { code: 401, msg: '无法获取用户标识，请在微信客户端调用' };
  }

  const action = event.action || 'login';

  switch (action) {
    case 'login':         return doLogin(OPENID, APPID, UNIONID, event);
    case 'getProfile':    return getProfile(OPENID);
    case 'updateProfile': return updateProfile(OPENID, event);
    default:              return { code: 400, msg: `未知 action: ${action}` };
  }
};

// ============ 登录（首次自动注册） ============
async function doLogin(openid, appid, unionid, event) {
  const { nickName, avatarUrl, gender } = event || {};
  const now = new Date();

  const userRes = await db.collection('users').where({ _openid: openid }).get();

  let userDoc;
  if (userRes.data.length === 0) {
    const createRes = await db.collection('users').add({
      data: {
        _openid: openid,
        unionId: unionid || '',
        nickName: nickName || '待办达人',
        avatarUrl: avatarUrl || '',
        gender: gender || 0,
        loginCount: 1,
        totalTodoCount: 0,
        completedCount: 0,
        streakDays: 0,
        pushEnabled: true,
        theme: 'light',
        createdAt: now,
        updatedAt: now,
      },
    });

    // 首次登录自动分配系统预设分类
    const catTasks = DEFAULT_CATEGORIES.map(cat =>
      db.collection('categories').add({
        data: {
          _openid: openid,
          name: cat.name,
          color: cat.color,
          icon: cat.icon,
          isSystem: true,
          sortOrder: cat.sortOrder,
          createdAt: now,
        },
      })
    );
    await Promise.all(catTasks);

    userDoc = {
      _id: createRes._id,
      nickName: nickName || '待办达人',
      avatarUrl: avatarUrl || '',
      loginCount: 1,
      totalTodoCount: 0,
      completedCount: 0,
    };
  } else {
    userDoc = userRes.data[0];
    const updateData = { loginCount: _.inc(1), updatedAt: now };
    if (nickName && nickName !== userDoc.nickName) updateData.nickName = nickName;
    if (avatarUrl && avatarUrl !== userDoc.avatarUrl) updateData.avatarUrl = avatarUrl;

    await db.collection('users').doc(userDoc._id).update({ data: updateData });
    const latest = await db.collection('users').doc(userDoc._id).get();
    userDoc = latest.data;
  }

  return {
    code: 0,
    msg: '登录成功',
    data: {
      openid,
      appid,
      user: pickUser(userDoc),
    },
  };
}

// ============ 获取个人信息（含累计数据） ============
async function getProfile(openid) {
  const userRes = await db.collection('users').where({ _openid: openid }).get();
  if (userRes.data.length === 0) {
    return { code: 404, msg: '用户不存在，请重新登录' };
  }
  const user = userRes.data[0];

  // 实时统计总待办数 + 完成数
  const [totalRes, completedRes] = await Promise.all([
    db.collection('todos').where({ _openid: openid, isDeleted: false }).count(),
    db.collection('todos').where({ _openid: openid, isDeleted: false, isCompleted: true }).count(),
  ]);

  return {
    code: 0,
    data: {
      ...pickUser(user),
      totalTodo: totalRes.total,
      completedCount: completedRes.total,
      pushEnabled: user.pushEnabled !== false,
      theme: user.theme || 'light',
      phone: user.phone || '',
      gender: user.gender || 0,
    },
  };
}

// ============ 更新个人信息 ============
async function updateProfile(openid, event) {
  const { nickName, nickname, avatarUrl, avatar, phone, pushEnabled, theme } = event;
  const userRes = await db.collection('users').where({ _openid: openid }).get();
  if (userRes.data.length === 0) {
    return { code: 404, msg: '用户不存在' };
  }
  const userId = userRes.data[0]._id;

  const update = { updatedAt: new Date() };
  const nn = nickName || nickname;
  const av = avatarUrl || avatar;
  if (nn !== undefined) update.nickName = nn;
  if (av !== undefined) update.avatarUrl = av;
  if (phone !== undefined) update.phone = phone;
  if (pushEnabled !== undefined) update.pushEnabled = !!pushEnabled;
  if (theme !== undefined) update.theme = theme;

  await db.collection('users').doc(userId).update({ data: update });
  return { code: 0, msg: '更新成功' };
}

function pickUser(u) {
  return {
    _id: u._id,
    nickName: u.nickName || '',
    avatarUrl: u.avatarUrl || '',
    loginCount: u.loginCount || 0,
    totalTodoCount: u.totalTodoCount || 0,
    completedCount: u.completedCount || 0,
    streakDays: u.streakDays || 0,
  };
}

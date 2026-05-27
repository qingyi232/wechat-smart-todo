// 提醒云函数：
// 1. 被小程序调用：查询即将到期的提醒 / 保存订阅消息授权
// 2. 被定时触发器调用：扫描到期待办并通过订阅消息推送到微信
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// TODO: 部署前请替换为真实订阅消息模板 ID（小程序后台 -> 订阅消息 -> 公共模板库申请）
const TEMPLATE_ID = 'PLEASE_REPLACE_WITH_YOUR_TEMPLATE_ID';
// 模板示例：
// 待办标题 {{thing1.DATA}}
// 截止时间 {{time2.DATA}}
// 备注     {{thing3.DATA}}

exports.main = async (event) => {
  const { action } = event || {};

  // 1. 定时触发器触发（无 action 字段，由 triggers 定时调起）
  if (!action) {
    return scheduleScan();
  }

  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, msg: '未登录' };

  switch (action) {
    case 'upcoming':        return upcoming(OPENID);
    case 'list':            return list(OPENID);
    case 'saveSubscribe':   return saveSubscribe(OPENID, event);
    case 'scanNow':         return scheduleScan();    // 手动触发扫描（调试用）
    default:                return { code: 400, msg: `未知 action: ${action}` };
  }
};

// 即将触发的提醒（前端展示用）
async function upcoming(openid) {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const res = await db.collection('todos').where({
    _openid: openid, isDeleted: false, isCompleted: false,
    reminderEnabled: true,
    dueDate: _.gte(now).and(_.lte(in24h)),
  }).orderBy('dueDate', 'asc').limit(20).get();

  return { code: 0, data: res.data };
}

// 提醒历史记录
async function list(openid) {
  const res = await db.collection('reminders').where({ _openid: openid })
    .orderBy('scheduledAt', 'desc').limit(50).get();
  return { code: 0, data: res.data };
}

// 保存订阅消息授权（小程序端 wx.requestSubscribeMessage 成功后调用）
async function saveSubscribe(openid, event) {
  const { todoId, templateId = TEMPLATE_ID } = event;
  if (!todoId) return { code: 400, msg: '缺少 todoId' };

  // 记录用户已订阅，定时扫描到期时可直接推送
  await db.collection('subscribeQuotas').add({
    data: {
      _openid: openid,
      todoId,
      templateId,
      quota: 1,               // 每次订阅授权 1 次推送
      consumed: false,
      createdAt: new Date(),
    },
  });

  return { code: 0, msg: '订阅已保存' };
}

// 定时扫描：找到期待办，发送订阅消息
async function scheduleScan() {
  const now = new Date();
  console.log('[scan] 开始扫描到期待办', now.toISOString());

  // 查找 "reminderEnabled=true 且未发送提醒 且距离截止时间 <= reminderBefore 分钟 且未完成" 的待办
  const all = await db.collection('todos').where({
    isDeleted: false, isCompleted: false,
    reminderEnabled: true, reminderSent: false,
    dueDate: _.neq(null),
  }).limit(500).get();

  let sentCount = 0;
  let failCount = 0;

  for (const todo of all.data) {
    const due = new Date(todo.dueDate);
    const before = (todo.reminderBefore || 60) * 60 * 1000;
    const shouldSendAt = new Date(due.getTime() - before);

    // 尚未到发送时间
    if (shouldSendAt > now) continue;
    // 已经过截止时间（避免历史过期待办重复触发）
    if (due < now) continue;

    // 检查用户是否关闭了推送提醒
    const userRes = await db.collection('users').where({ _openid: todo._openid }).limit(1).get();
    if (userRes.data.length > 0 && userRes.data[0].pushEnabled === false) {
      await db.collection('todos').doc(todo._id).update({
        data: { reminderSent: true, updatedAt: new Date() },
      });
      continue;
    }

    // 查找该待办的可用订阅配额
    const quotaRes = await db.collection('subscribeQuotas').where({
      _openid: todo._openid,
      todoId: todo._id,
      consumed: false,
    }).orderBy('createdAt', 'asc').limit(1).get();

    if (quotaRes.data.length === 0) {
      // 用户没有授权订阅消息，只入库不推送
      await db.collection('reminders').add({
        data: {
          _openid: todo._openid,
          todoId: todo._id,
          scheduledAt: due,
          sentAt: now,
          status: 'no_subscribe',
          message: `待办"${todo.title}"即将到期（用户未授权微信推送）`,
          createdAt: new Date(),
        },
      });
      await db.collection('todos').doc(todo._id).update({
        data: { reminderSent: true, updatedAt: new Date() },
      });
      continue;
    }

    const quota = quotaRes.data[0];

    // 调用订阅消息推送
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: todo._openid,
        templateId: quota.templateId || TEMPLATE_ID,
        page: `pages/todoEdit/todoEdit?id=${todo._id}`,
        data: {
          thing1: { value: safeText(todo.title, 20) },
          time2: { value: formatDate(due) },
          thing3: { value: safeText(todo.description || '准时完成哦～', 20) },
        },
      });

      // 标记配额已消费 + reminderSent
      await db.collection('subscribeQuotas').doc(quota._id).update({
        data: { consumed: true, consumedAt: new Date() },
      });
      await db.collection('todos').doc(todo._id).update({
        data: { reminderSent: true, updatedAt: new Date() },
      });
      await db.collection('reminders').add({
        data: {
          _openid: todo._openid,
          todoId: todo._id,
          scheduledAt: due,
          sentAt: new Date(),
          status: 'sent',
          message: `已推送微信提醒：${todo.title}`,
          createdAt: new Date(),
        },
      });
      sentCount++;
    } catch (err) {
      failCount++;
      console.error('[scan] 推送失败', todo._id, err.errMsg || err.message);
      await db.collection('reminders').add({
        data: {
          _openid: todo._openid,
          todoId: todo._id,
          scheduledAt: due,
          sentAt: new Date(),
          status: 'failed',
          message: (err.errMsg || err.message || '推送失败').slice(0, 100),
          createdAt: new Date(),
        },
      });
    }
  }

  const summary = {
    scanAt: now.toISOString(),
    totalScanned: all.data.length,
    sent: sentCount,
    failed: failCount,
  };
  console.log('[scan] 完成', summary);
  return { code: 0, data: summary };
}

// 订阅消息的 thing 类型有字数限制（通常 20 字符内）
function safeText(text, maxLen = 20) {
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
}

function formatDate(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

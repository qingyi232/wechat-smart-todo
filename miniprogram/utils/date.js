// 日期相关工具
function pad(n) { return n < 10 ? '0' + n : '' + n; }

function formatDate(date, fmt = 'YYYY-MM-DD HH:mm') {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date.replace(' ', 'T')) : new Date(date);
  if (isNaN(d.getTime())) return date;
  const map = {
    YYYY: d.getFullYear(),
    MM: pad(d.getMonth() + 1),
    DD: pad(d.getDate()),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds()),
  };
  return fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, (k) => map[k]);
}

function relativeDate(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date.replace(' ', 'T')) : new Date(date);
  if (isNaN(d.getTime())) return date;
  const now = new Date();
  const diffMs = d - now;
  const diffMin = Math.round(diffMs / 60000);
  const diffHour = Math.round(diffMs / 3600000);
  const diffDay = Math.round(diffMs / 86400000);

  if (diffMs < 0) {
    if (diffDay === 0) return '今天 ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + '（已逾期）';
    if (diffDay === -1) return '昨天（已逾期）';
    if (diffDay > -7) return `${Math.abs(diffDay)} 天前（已逾期）`;
    return formatDate(d, 'MM-DD HH:mm') + '（已逾期）';
  }
  if (diffMin < 60) return `${diffMin} 分钟后`;
  if (diffHour < 24 && d.getDate() === now.getDate()) {
    return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (diffDay === 0) return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (diffDay === 1) return `明天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (diffDay < 7) return `${diffDay} 天后`;
  return formatDate(d, 'MM-DD HH:mm');
}

function isOverdue(date) {
  if (!date) return false;
  const d = typeof date === 'string' ? new Date(date.replace(' ', 'T')) : new Date(date);
  return d < new Date();
}

function isToday(date) {
  if (!date) return false;
  const d = typeof date === 'string' ? new Date(date.replace(' ', 'T')) : new Date(date);
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

module.exports = { formatDate, relativeDate, isOverdue, isToday };

// cron-expr: 5-field cron expression parser (minute hour dom month dow)
// Zero dependencies. CJS module. All functions are pure.

var FIELD_RANGES = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7]
];

function parseField(field, range) {
  var min = range[0], max = range[1];
  var allowed = {};
  var parts = field.split(',');
  for (var pi = 0; pi < parts.length; pi++) {
    var part = parts[pi];
    if (part === '*') {
      for (var i = min; i <= max; i++) allowed[i] = true;
      return allowed;
    }
    var stepMatch = part.match(/^(.+)\/(\d+)$/);
    var base = part;
    var step = 1;
    if (stepMatch) {
      base = stepMatch[1];
      step = parseInt(stepMatch[2], 10);
      if (step < 1) return null;
    }
    var low, high;
    if (base === '*') { low = min; high = max; }
    else if (base.indexOf('-') >= 0) {
      var parts2 = base.split('-');
      low = Number(parts2[0]); high = Number(parts2[1]);
      if (isNaN(low) || isNaN(high)) return null;
    } else {
      low = high = Number(base);
      if (isNaN(low)) return null;
    }
    if (low < min || high > max || low > high) return null;
    for (var j = low; j <= high; j += step) allowed[j] = true;
  }
  var keys = Object.keys(allowed);
  return keys.length > 0 ? allowed : null;
}

function fieldMatches(value, allowed) {
  return allowed && allowed[value] === true;
}

function isValid(expr) {
  if (typeof expr !== 'string') return false;
  var fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  for (var i = 0; i < 5; i++) {
    if (parseField(fields[i], FIELD_RANGES[i]) === null) return false;
  }
  return true;
}

function cronMatches(expr, date) {
  if (!isValid(expr)) return false;
  date = date || new Date();
  var fields = expr.trim().split(/\s+/);
  var values = [
    date.getMinutes(), date.getHours(), date.getDate(),
    date.getMonth() + 1, date.getDay()
  ];
  for (var i = 0; i < 5; i++) {
    var allowed = parseField(fields[i], FIELD_RANGES[i]);
    if (!fieldMatches(values[i], allowed)) return false;
  }
  return true;
}

function cronToHuman(expr) {
  if (!expr) return '';
  var parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  var min = parts[0], hour = parts[1], dom = parts[2], month = parts[3], dow = parts[4];
  var h = parseInt(hour, 10), m = parseInt(min, 10);
  var timeStr = pad2(h) + ':' + pad2(m);
  if (dom === '*' && month === '*') {
    if (dow === '*') return timeStr;
    var dayNames = ['周日','周一','周二','周三','周四','周五','周六'];
    if (dow === '1-5') return '工作日 ' + timeStr;
    if (/^[0-7]$/.test(dow)) return '每' + dayNames[parseInt(dow) % 7] + ' ' + timeStr;
    if (/^[0-7],[0-7]/.test(dow)) {
      var days = dow.split(',').map(function(d){return dayNames[parseInt(d) % 7]}).join('/');
      return '每周' + days + ' ' + timeStr;
    }
  }
  if (dom !== '*' && month === '*' && dow === '*') return '每月' + parseInt(dom) + '日 ' + timeStr;
  if (dom !== '*' && month !== '*' && month.indexOf(',') >= 0) {
    return month.split(',').join('/') + '月第' + parseInt(dom) + '天 ' + timeStr;
  }
  if (/^\*\/\d+$/.test(min) && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return parseInt(min.split('/')[1]) + ' 分钟/次';
  }
  return expr;
}

function timeoutToHuman(sec) {
  if (!sec) return '5 分钟';
  if (sec >= 3600) return Math.round(sec / 3600) + ' 小时';
  if (sec >= 60) return Math.round(sec / 60) + ' 分钟';
  return sec + ' 秒';
}

function pad2(n) { return String(n).padStart(2, '0'); }

module.exports = {
  isValid: isValid,
  cronMatches: cronMatches,
  cronToHuman: cronToHuman,
  timeoutToHuman: timeoutToHuman
};

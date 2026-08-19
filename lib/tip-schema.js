// lib/tip-schema.js — tips frontmatter 标准唯一真相源
// 被 routes.js (/tips 页面渲染 + 标红) 共享。校验门禁防止 type 字段再次漂移。

var fs = require('fs');
var path = require('path');

// ── type 枚举 + 展示元数据 ──

var TIP_TYPE_VALUES = ['diagnosis', 'method', 'fact', 'capability', 'feedback'];

var TIP_TYPE_META = {
  diagnosis:  { label: '诊断', code: 'DX', tip: '为什么X会这样？因果链路追踪' },
  method:     { label: '方法', code: 'MT', tip: '怎么做X？可执行的步骤序列' },
  fact:       { label: '事实', code: 'FT', tip: 'X在哪/是什么？路径、版本、架构等具体数据' },
  capability: { label: '能力', code: 'CP', tip: '我能用X在Y场景做什么' },
  feedback:   { label: '反馈', code: 'FB', tip: '用户给的行为反馈/纠正' }
};

var TYPE_LABELS = {};
TIP_TYPE_VALUES.forEach(function (t) { TYPE_LABELS[t] = TIP_TYPE_META[t].code; });

// capability 专用字段（无 source，用 tool/scenario/recipe）
var CAPABILITY_FIELDS = ['tool', 'scenario', 'recipe'];

// ── frontmatter 解析（兼容 YAML / 裸行 / **加粗** 三种历史格式） ──

function parseFrontmatter(md) {
  var fields = {};
  if (!md) return fields;
  var lines = md.split(/\r?\n/);

  if (lines[0] === '---') {
    for (var i = 1; i < lines.length; i++) {
      if (lines[i] === '---') break;
      var m = lines[i].match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
      if (m) fields[m[1]] = m[2].trim();
    }
  } else {
    for (var j = 0; j < lines.length; j++) {
      if (/^##\s/.test(lines[j])) break;
      var n = lines[j].match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/) ||
              lines[j].match(/^\*\*([a-zA-Z_][a-zA-Z0-9_-]*)\*\*:\s*(.*)$/);
      if (n) fields[n[1]] = n[2].trim();
    }
  }
  return fields;
}

// ── 单条校验 ──

function validateTip(md) {
  var errors = [];
  var warnings = [];
  var fields = parseFrontmatter(md);

  if (!fields.type) {
    errors.push('缺少必填字段 type');
  } else if (TIP_TYPE_VALUES.indexOf(fields.type) === -1) {
    errors.push('type 值无效: "' + fields.type + '"，合法值: ' + TIP_TYPE_VALUES.join('|'));
  }

  if (!fields.date) {
    errors.push('缺少必填字段 date');
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date)) {
    warnings.push('date 格式建议 YYYY-MM-DD: "' + fields.date + '"');
  }

  if (fields.type === 'capability') {
    if (!fields.tool) warnings.push('capability 建议填 tool 字段');
    if (!fields.scenario) warnings.push('capability 建议填 scenario 字段');
  } else if (!fields.source) {
    warnings.push('建议填 source（触发写入的事件/任务简述）');
  }

  return { ok: errors.length === 0, errors: errors, warnings: warnings, fields: fields };
}

// ── 全量巡检 ──

function auditTips(dir) {
  var issues = [];
  var total = 0;
  var totalErrors = 0;
  var totalWarnings = 0;
  var SKIP = ['CONSTITUTION.md', 'CHECKPOINT.md'];

  if (!fs.existsSync(dir)) return { ok: true, total: 0, errors: 0, warnings: 0, issues: [] };

  var files = fs.readdirSync(dir).filter(function (f) {
    return f.endsWith('.md') && SKIP.indexOf(f) === -1;
  }).sort();

  files.forEach(function (f) {
    total++;
    var md;
    try { md = fs.readFileSync(path.join(dir, f), 'utf8'); } catch (_) { return; }
    var r = validateTip(md);
    if (r.errors.length > 0 || r.warnings.length > 0) {
      issues.push({ file: f, type: r.fields.type || '', errors: r.errors, warnings: r.warnings });
      totalErrors += r.errors.length;
      totalWarnings += r.warnings.length;
    }
  });

  issues.sort(function (a, b) { return b.errors.length - a.errors.length || b.warnings.length - a.warnings.length; });
  return { ok: totalErrors === 0, total: total, errors: totalErrors, warnings: totalWarnings, issues: issues };
}

module.exports = {
  TIP_TYPE_VALUES: TIP_TYPE_VALUES,
  TIP_TYPE_META: TIP_TYPE_META,
  TYPE_LABELS: TYPE_LABELS,
  CAPABILITY_FIELDS: CAPABILITY_FIELDS,
  parseFrontmatter: parseFrontmatter,
  validateTip: validateTip,
  auditTips: auditTips
};

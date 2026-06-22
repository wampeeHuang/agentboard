// lib/manifest-schema.js — manifest 标准唯一真相源
// 被 tool-registry.js (写入校验) 和 mcp-server.js (巡检) 共享
// 改一处，写入+读出+巡检三面自动生效

var path = require('path');
var fs = require('fs');

// ── 字段定义 ──

var REQUIRED_ALL = ['name', 'description', 'capability', 'owner'];
var REQUIRED_SERVICE = ['startCommand', 'stopCommand'];

var OWNER_VALUES = ['自建', '外部', 'AI托管'];

var FIELD_RULES = {
  name:        { type: 'string', minLen: 1, label: '显示名称' },
  description: { type: 'string', minLen: 10, pattern: /【用途】/, label: '描述(需含【用途】)' },
  capability:  { type: 'string', minLen: 2, maxLen: 30, label: '一句话任务描述' },
  owner:       { type: 'enum', values: OWNER_VALUES, label: '所有者' },
  port:        { type: 'number', label: '端口' },
  ports:       { type: 'array', label: '多端口' },
  startCommand:{ type: 'string', minLen: 1, label: '启动命令' },
  stopCommand: { type: 'string', minLen: 1, label: '停止命令' },
  category:    { type: 'string', label: '分类' },
  url:         { type: 'string', label: '运行时URL' },
  projectPath: { type: 'string', label: '项目路径' },
  agent_notes: { type: 'string', label: 'AI踩坑笔记' }
};

// ── 校验单个 manifest ──
// 返回 { ok: boolean, errors: string[], warnings: string[] }

function validate(mf) {
  var errors = [];
  var warnings = [];

  if (!mf || typeof mf !== 'object') return { ok: false, errors: ['manifest is not an object'], warnings: [] };

  // 必填字段
  REQUIRED_ALL.forEach(function (f) {
    if (!mf[f]) errors.push('缺少必填字段: ' + f + ' (' + FIELD_RULES[f].label + ')');
  });

  // owner 枚举
  if (mf.owner && OWNER_VALUES.indexOf(mf.owner) === -1) {
    errors.push('owner 值无效: "' + mf.owner + '"，合法值: ' + OWNER_VALUES.join('|'));
  }

  // capability 长度
  if (mf.capability && mf.capability.length > 30) {
    warnings.push('capability 超长: ' + mf.capability.length + ' 字符 (建议≤30)');
  }

  // service 类型 + 有端口 → 必须可启停
  var hasPort = mf.port || (mf.ports && mf.ports.length > 0);
  if ((mf.type || 'service') === 'service' && hasPort) {
    REQUIRED_SERVICE.forEach(function (f) {
      if (!mf[f]) errors.push('service 类型缺少: ' + f + ' (' + FIELD_RULES[f].label + ')');
    });
  }

  // 端口一致性
  if ((mf.port && !/^\d+$/.test(String(mf.port))) || (mf.ports && !Array.isArray(mf.ports))) {
    errors.push('port 应为数字，ports 应为数组');
  }

  // agent_notes 建议
  if (!mf.agent_notes) warnings.push('建议填写 agent_notes（AI 踩坑笔记）');

  return { ok: errors.length === 0, errors: errors, warnings: warnings };
}

// ── 巡检所有 manifest ──
// 返回 { ok, total, errors: number, warnings: number, issues: [{ id, errors[], warnings[] }] }

function auditAll(dirs) {
  var AGENTBOARD_HOME = process.env.AGENTBOARD_HOME || path.join(require('os').homedir(), '.agentboard');
  var DEFAULT_DIR = process.env.AGENTBOARD_TOOLS_DIR || path.join(AGENTBOARD_HOME, 'tools');
  var searchDirs = (dirs && dirs.length > 0) ? dirs : [DEFAULT_DIR];

  var issues = [];
  var total = 0;
  var totalErrors = 0;
  var totalWarnings = 0;

  searchDirs.forEach(function (dir) {
    if (!fs.existsSync(dir)) return;
    var entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.forEach(function (e) {
      if (!e.isDirectory() || e.name.startsWith('.')) return;
      var mfPath = path.join(dir, e.name, 'manifest.json');
      if (!fs.existsSync(mfPath)) return;
      total++;
      var mf;
      try { mf = JSON.parse(fs.readFileSync(mfPath, 'utf8')); } catch (_) {
        issues.push({ id: e.name, errors: ['manifest.json 不是合法 JSON'], warnings: [] });
        totalErrors++;
        return;
      }
      var result = validate(mf);
      if (result.errors.length > 0 || result.warnings.length > 0) {
        issues.push({ id: e.name, name: mf.name || '', errors: result.errors, warnings: result.warnings });
        totalErrors += result.errors.length;
        totalWarnings += result.warnings.length;
      }
    });
  });

  issues.sort(function (a, b) { return b.errors.length - a.errors.length || b.warnings.length - a.warnings.length; });
  return { ok: totalErrors === 0, total: total, errors: totalErrors, warnings: totalWarnings, issues: issues };
}

module.exports = {
  REQUIRED_ALL: REQUIRED_ALL,
  REQUIRED_SERVICE: REQUIRED_SERVICE,
  OWNER_VALUES: OWNER_VALUES,
  FIELD_RULES: FIELD_RULES,
  validate: validate,
  auditAll: auditAll
};

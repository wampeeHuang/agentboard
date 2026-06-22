// lib/manifest-schema.js — manifest 标准唯一真相源
// 被 tool-registry.js (写入校验) 和 mcp-server.js (巡检) 共享
// 改一处，写入+读出+巡检三面自动生效
//
// 唯一真相源原则：
//   - 字段规则 → 本文件的 FIELD_RULES
//   - 声明态 → tools/*/manifest.json
//   - 存在性 → 文件系统 fs.existsSync
//   - 进程态 → netstat 端口表（由调用方传入）
//   audit 不产生新数据，只对照以上真相源报告差异

var path = require('path');
var fs = require('fs');
var child_process = require('child_process');

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

// ── 运行时漂移检测 ──
// 对照文件系统/进程表，检查 manifest 声明是否与实际情况一致
// 真相源：文件系统（存在性）、netstat（端口）、where（PATH）

var PLATFORM = process.platform;

// shell builtin / PowerShell cmdlet，不是磁盘上的可执行文件，跳过检查
var SHELL_BUILTINS = [
  'cd', 'chdir', 'dir', 'echo', 'set', 'rem', 'md', 'mkdir', 'rd', 'rmdir',
  'del', 'erase', 'copy', 'move', 'ren', 'rename', 'type', 'cls', 'exit',
  'pushd', 'popd', 'call', 'start', 'title', 'path', 'prompt', 'color',
  'date', 'time', 'verify', 'vol', 'label', 'subst', 'if', 'for', 'goto'
];

// PowerShell cmdlet 模式：Verb-Noun（如 Start-Process、Stop-Process）
var PS_CMDLET_RE = /^[A-Z][a-zA-Z]+-[A-Z][a-zA-Z]+$/;

function isShellBuiltin(exe) {
  if (SHELL_BUILTINS.indexOf(exe.toLowerCase()) >= 0) return true;
  if (PS_CMDLET_RE.test(exe)) return true;
  return false;
}

// 展开 Windows 环境变量 %VAR%
function expandEnvVars(p) {
  if (!p) return p;
  return p.replace(/%([^%]+)%/g, function (_, name) {
    return process.env[name] || '%' + name + '%';
  });
}

function winPath(p) {
  if (!p) return p;
  p = expandEnvVars(p);
  var m = p.match(/^\/([a-zA-Z])\//);
  return m ? m[1].toUpperCase() + ':\\' + p.slice(3) : p;
}

// 从 startCommand/stopCommand 中提取主可执行文件名
// "cd /d D:\path && python main.py --port 8080" → "python"
// "npx kill-port 8080" → "npx"
function parseMainExe(cmd) {
  if (!cmd) return null;
  // 按命令分隔符拆开，取最后一段（跳过 cd / set 等前置操作）
  var parts = cmd.split(/&&|\|\||\|/);
  var last = parts[parts.length - 1].trim();
  // 提取第一个 token（支持引号包裹）
  var match = last.match(/^"([^"]+)"|^(\S+)/);
  if (!match) return null;
  var exe = match[1] || match[2];
  if (!exe || isShellBuiltin(exe)) return null;
  return exe;
}

// 检查可执行文件是否存在（绝对路径 → 项目目录相对 → PATH）
function checkExeExists(exe, projectPathWin) {
  // 展开环境变量
  var exeExpanded = expandEnvVars(exe);
  // 绝对路径
  if (fs.existsSync(exeExpanded)) return true;
  // 相对项目目录
  if (projectPathWin) {
    var absInProject = path.join(projectPathWin, exeExpanded);
    if (fs.existsSync(absInProject)) return true;
    if (!path.extname(exeExpanded) && fs.existsSync(absInProject + '.exe')) return true;
  }
  // 查 PATH
  try {
    var whichCmd = PLATFORM === 'win32' ? 'where' : 'which';
    child_process.execSync(whichCmd + ' "' + exeExpanded.replace(/"/g, '\\"') + '"', {
      timeout: 3000, encoding: 'utf8', windowsHide: true
    });
    return true;
  } catch (_) {
    return false;
  }
}

// 巡检声明态 vs 运行态漂移
// listeningPorts: Set<number> — 来自 netstat 的端口集合（可选，不传则跳过端口检查）
function auditRuntime(dirs, listeningPorts) {
  var AGENTBOARD_HOME = process.env.AGENTBOARD_HOME || path.join(require('os').homedir(), '.agentboard');
  var DEFAULT_DIR = process.env.AGENTBOARD_TOOLS_DIR || path.join(AGENTBOARD_HOME, 'tools');
  var searchDirs = (dirs && dirs.length > 0) ? dirs : [DEFAULT_DIR];

  var issues = [];
  var total = 0;
  var totalErrors = 0;
  var totalWarnings = 0;

  searchDirs.forEach(function (dir) {
    if (!fs.existsSync(dir)) return;

    var entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }

    entries.forEach(function (e) {
      if (!e.isDirectory() || e.name.startsWith('.')) return;

      var mfPath = path.join(dir, e.name, 'manifest.json');
      var hasManifest = fs.existsSync(mfPath);

      // ── 孤儿目录：有目录无 manifest ──
      if (!hasManifest) {
        issues.push({
          id: e.name, name: e.name,
          errors: ['孤儿目录: 工具目录存在但无 manifest.json'],
          warnings: []
        });
        totalErrors++;
        total++;
        return;
      }

      total++;

      var mf;
      try { mf = JSON.parse(fs.readFileSync(mfPath, 'utf8')); } catch (_) {
        // JSON 解析失败 — 已在 auditAll 中报告，不重复
        return;
      }

      var errors = [];
      var warnings = [];

      // ── projectPath 存在性 ──
      if (mf.projectPath) {
        var ppWin = winPath(mf.projectPath);
        if (!fs.existsSync(ppWin)) {
          errors.push('projectPath 不存在: ' + mf.projectPath);
        }
      }

      // ── startCommand 可执行文件存在性 ──
      if (mf.startCommand) {
        var exe = parseMainExe(mf.startCommand);
        if (exe) {
          var ppWin = mf.projectPath ? winPath(mf.projectPath) : null;
          if (!checkExeExists(exe, ppWin)) {
            errors.push('startCommand 可执行文件缺失: ' + exe + ' (不在 PATH 也不在项目目录)');
          }
        }
      }

      // ── stopCommand 可执行文件存在性 ──
      if (mf.stopCommand) {
        var stopExe = parseMainExe(mf.stopCommand);
        if (stopExe && stopExe !== parseMainExe(mf.startCommand || '')) {
          var ppWin = mf.projectPath ? winPath(mf.projectPath) : null;
          if (!checkExeExists(stopExe, ppWin)) {
            warnings.push('stopCommand 可执行文件缺失: ' + stopExe);
          }
        }
      }

      // ── 端口监听检查 ──
      if (listeningPorts && listeningPorts.size > 0) {
        var ports = mf.ports || (mf.port ? [mf.port] : []);
        ports.forEach(function (p) {
          if (!listeningPorts.has(p)) {
            warnings.push('声明端口 ' + p + ' 未在监听 (工具可能已停止)');
          }
        });
      }

      if (errors.length > 0 || warnings.length > 0) {
        issues.push({
          id: e.name, name: mf.name || e.name,
          errors: errors, warnings: warnings
        });
        totalErrors += errors.length;
        totalWarnings += warnings.length;
      }
    });
  });

  issues.sort(function (a, b) {
    return b.errors.length - a.errors.length || b.warnings.length - a.warnings.length;
  });
  return {
    ok: totalErrors === 0,
    total: total,
    errors: totalErrors,
    warnings: totalWarnings,
    issues: issues
  };
}

module.exports = {
  REQUIRED_ALL: REQUIRED_ALL,
  REQUIRED_SERVICE: REQUIRED_SERVICE,
  OWNER_VALUES: OWNER_VALUES,
  FIELD_RULES: FIELD_RULES,
  validate: validate,
  auditAll: auditAll,
  auditRuntime: auditRuntime
};

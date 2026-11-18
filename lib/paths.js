// lib/paths.js — 应用层 / 数据层唯一路径边界
// APP_ROOT  = 代码、web、docs、examples（可随仓库/安装包走）
// DATA_ROOT = tools/apps/tips/principles/state/_runtime/config/archive/skills（用户数据，不进源码仓库）
var fs = require('fs');
var os = require('os');
var path = require('path');

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.indexOf('~/') === 0 || p.indexOf('~\\') === 0) return path.join(os.homedir(), p.slice(2));
  return p;
}

var APP_ROOT = path.resolve(__dirname, '..');
var DATA_ROOT = path.resolve(expandHome(
  process.env.AGENTBOARD_HOME || process.env.AGENTBOARD_DATA_DIR || path.join(os.homedir(), '.agentboard')
));

var TOOLS_DIR = path.resolve(expandHome(process.env.AGENTBOARD_TOOLS_DIR || path.join(DATA_ROOT, 'tools')));
var APPS_DIR = path.resolve(expandHome(process.env.AGENTBOARD_APPS_REGISTRY || path.join(DATA_ROOT, 'apps')));
var TIPS_DIR = path.resolve(expandHome(process.env.AGENTBOARD_TIPS_DIR || path.join(DATA_ROOT, 'tips')));
var PRINCIPLES_DIR = path.resolve(expandHome(process.env.AGENTBOARD_PRINCIPLES_DIR || path.join(DATA_ROOT, 'principles')));
var STATE_DIR = path.resolve(expandHome(process.env.AGENTBOARD_STATE_DIR || path.join(DATA_ROOT, 'state')));
var RUNTIME_DIR = path.resolve(expandHome(process.env.AGENTBOARD_RUNTIME_DIR || path.join(DATA_ROOT, '_runtime')));
var CONFIG_DIR = path.resolve(expandHome(process.env.AGENTBOARD_CONFIG_DIR || path.join(DATA_ROOT, 'config')));
var ARCHIVE_DIR = path.resolve(expandHome(process.env.AGENTBOARD_ARCHIVE_DIR || path.join(DATA_ROOT, 'archive')));
var LOCAL_SKILLS_DIR = path.resolve(expandHome(process.env.AGENTBOARD_LOCAL_SKILLS_DIR || path.join(DATA_ROOT, 'skills')));
var GLOBAL_SKILLS_DIR = path.resolve(expandHome(process.env.AGENTBOARD_SKILLS_DIR || path.join(os.homedir(), '.claude', 'skills')));

var DATA_DIRS = [TOOLS_DIR, APPS_DIR, TIPS_DIR, PRINCIPLES_DIR, STATE_DIR, RUNTIME_DIR, CONFIG_DIR, ARCHIVE_DIR, LOCAL_SKILLS_DIR];

function ensureDataDirs() {
  DATA_DIRS.forEach(function (dir) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  });
}

function dataPath() {
  return path.join.apply(path, [DATA_ROOT].concat(Array.prototype.slice.call(arguments)));
}

function isInsideData(p) {
  var resolved = path.resolve(p);
  return resolved === DATA_ROOT || resolved.indexOf(DATA_ROOT + path.sep) === 0;
}

function describe() {
  return {
    appRoot: APP_ROOT,
    dataRoot: DATA_ROOT,
    dirs: {
      tools: TOOLS_DIR, apps: APPS_DIR, tips: TIPS_DIR, principles: PRINCIPLES_DIR,
      state: STATE_DIR, runtime: RUNTIME_DIR, config: CONFIG_DIR, archive: ARCHIVE_DIR,
      localSkills: LOCAL_SKILLS_DIR, globalSkills: GLOBAL_SKILLS_DIR
    }
  };
}

module.exports = {
  APP_ROOT: APP_ROOT,
  DATA_ROOT: DATA_ROOT,
  TOOLS_DIR: TOOLS_DIR,
  APPS_DIR: APPS_DIR,
  TIPS_DIR: TIPS_DIR,
  PRINCIPLES_DIR: PRINCIPLES_DIR,
  STATE_DIR: STATE_DIR,
  RUNTIME_DIR: RUNTIME_DIR,
  CONFIG_DIR: CONFIG_DIR,
  ARCHIVE_DIR: ARCHIVE_DIR,
  LOCAL_SKILLS_DIR: LOCAL_SKILLS_DIR,
  GLOBAL_SKILLS_DIR: GLOBAL_SKILLS_DIR,
  ensureDataDirs: ensureDataDirs,
  dataPath: dataPath,
  isInsideData: isInsideData,
  describe: describe
};

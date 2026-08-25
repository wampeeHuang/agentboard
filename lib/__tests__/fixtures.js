// fixtures.js — 造临时 AGENTBOARD_HOME，隔离真实 tools/tips/apps-registry
const fs = require('fs');
const os = require('os');
const path = require('path');

function makeManifest(over) {
  return Object.assign({
    name: '测试工具',
    icon: '🌐',
    version: '1.2.3',
    category: '创作',
    owner: '自建',
    type: 'service',
    port: 65530,
    ports: [65530],
    startCommand: 'node server.js',
    stopCommand: 'taskkill /F /IM node.exe',
    projectPath: '',
    description: '【用途】测试工具\n【何时用】测试时',
    capability: '测试工具能力',
    runtime: { language: 'node', version: '20', manager: 'npm', note: '' }
  }, over || {});
}

const TIP_ALPHA = [
  '---',
  'type: diagnosis',
  'date: 2026-08-20',
  'source: 测试源',
  '---',
  '',
  '# 富日志测试',
  '',
  '首段描述。',
  '',
  '## 现象',
  'xx',
  '',
  '## 根因',
  'yy',
  '',
  '## 修复',
  'zz',
  '',
  '## 预防',
  'ww',
  ''
].join('\n');

const TIP_BETA = [
  '---',
  'type: inference',
  'date: 2026-08-21',
  '---',
  '',
  '# 简单日志',
  '',
  '只有一段描述。',
  ''
].join('\n');

const CONSTITUTION = [
  '---',
  'type: constitution',
  'date: 2026-01-01',
  '---',
  '',
  '# 测试宪法',
  '',
  '这是 CONSTITUTION 测试内容。',
  ''
].join('\n');

function makeAppsRegistry(apps) {
  return {
    description: 'test registry',
    updated: '2026-01-01T00:00',
    apps: apps || [
      { id: 'a.example.com', name: '测试应用A', url: 'https://a.example.com', description: 'descA', host: 'test', category: '网站', status: 'live' },
      { id: 'b.example.com', name: '测试应用B', url: 'https://b.example.com', description: 'descB', host: 'test', category: '网站', status: 'live' }
    ]
  };
}

// 建临时 home，返回 { home, appsFile }；调用方负责 finally 清理
function makeHome(opts) {
  opts = opts || {};
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentboard-test-'));
  const toolsDir = path.join(home, 'tools');
  const tipsDir = path.join(home, 'tips');
  const principlesDir = path.join(home, 'principles');
  const runtimeDir = path.join(home, '_runtime');
  fs.mkdirSync(toolsDir, { recursive: true });
  fs.mkdirSync(tipsDir, { recursive: true });
  fs.mkdirSync(principlesDir, { recursive: true });
  fs.mkdirSync(runtimeDir, { recursive: true });

  // 有效工具：端口未监听 → running false
  fs.mkdirSync(path.join(toolsDir, 'webapp'), { recursive: true });
  fs.writeFileSync(path.join(toolsDir, 'webapp', 'manifest.json'), JSON.stringify(makeManifest({ name: 'Web 测试', id: 'webapp' }), null, 2), 'utf8');
  // 无端口工具 → running null
  fs.mkdirSync(path.join(toolsDir, 'folder1'), { recursive: true });
  fs.writeFileSync(path.join(toolsDir, 'folder1', 'manifest.json'), JSON.stringify(makeManifest({ name: '目录型', port: null, ports: [], type: 'folder' }), null, 2), 'utf8');
  // orphan：目录无 manifest
  fs.mkdirSync(path.join(toolsDir, 'orphantool'), { recursive: true });
  // broken：坏 JSON
  fs.mkdirSync(path.join(toolsDir, 'broken'), { recursive: true });
  fs.writeFileSync(path.join(toolsDir, 'broken', 'manifest.json'), '{ not json', 'utf8');
  // 非对象缺 name
  fs.mkdirSync(path.join(toolsDir, 'noname'), { recursive: true });
  fs.writeFileSync(path.join(toolsDir, 'noname', 'manifest.json'), '{"port": 1}', 'utf8');

  fs.writeFileSync(path.join(tipsDir, 'alpha.md'), TIP_ALPHA, 'utf8');
  fs.writeFileSync(path.join(tipsDir, 'beta.md'), TIP_BETA, 'utf8');
  fs.writeFileSync(path.join(tipsDir, 'CONSTITUTION.md'), CONSTITUTION, 'utf8');
  fs.writeFileSync(path.join(tipsDir, 'CHECKPOINT.md'), '# CHECKPOINT\n', 'utf8');
  fs.writeFileSync(path.join(principlesDir, 'p1.md'), '# 原则一\n', 'utf8');

  const appsFile = path.join(home, 'apps-registry.json');
  fs.writeFileSync(appsFile, JSON.stringify(makeAppsRegistry(opts.apps), null, 2), 'utf8');

  return { home: home, appsFile: appsFile, toolsDir: toolsDir, tipsDir: tipsDir };
}

function rmrf(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {}
}

module.exports = { makeHome, makeManifest, makeAppsRegistry, rmrf, TIP_ALPHA, TIP_BETA };

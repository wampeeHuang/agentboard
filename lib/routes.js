// routes.js — REST API + content routes (tools, catalog, skills, tips, principles, registry, health)
var express = require('express');
var fs = require('fs');
var path = require('path');
var http = require('http');
var os = require('os');
var tipSchema = require('./tip-schema');
var appSchema = require('./apps-schema');
var principleSchema = require('./principle-schema');
var schemaDef = require('./manifest-schema');
var brandAudit = require('./brand-drift');
var treeAudit = require('./tree-drift');

function writeTextAtomic(p, content) {
  var tmp = p + '.tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, p); // 同盘 rename 原子
}
function safeTipName(fname) {
  if (!fname || path.basename(fname) !== fname || !/\.md$/.test(fname)) return null;
  return fname;
}
function appUrlFromDomain(raw) {
  var r = String(raw || '').trim().toLowerCase();
  if (!r) return null;
  if (r.indexOf('://') >= 0) return r;
  return (/^localhost(:\d+)?$/.test(r) ? 'http://' : 'https://') + r;
}

// 从 lib/manifest-schema.js（真源）生成 Schema 文档，供 /api/registry（AI 面）
function schemaToMarkdown() {
  var s = schemaDef;
  var L = [];
  L.push('# Manifest Schema');
  L.push('');
  L.push('> 唯一真相源：`lib/manifest-schema.js`。tool-registry.js（写入校验）与 mcp-http.js（巡检）共享同一份定义，本页由它生成。');
  L.push('');
  L.push('## 必填字段');
  L.push('- 所有卡片：`' + s.REQUIRED_ALL.join('`、`') + '`');
  L.push('- `type: "service"` 且声明端口时追加：`' + s.REQUIRED_SERVICE.join('`、`') + '`');
  L.push('');
  L.push('## 字段规则');
  L.push('');
  L.push('| 字段 | 类型 | 说明 |');
  L.push('|------|------|------|');
  Object.keys(s.FIELD_RULES).forEach(function(k) {
    var r = s.FIELD_RULES[k];
    L.push('| `' + k + '` | ' + r.type + ' | ' + r.label + ' |');
  });
  L.push('');
  L.push('## 枚举');
  L.push('- owner：`' + s.OWNER_VALUES.join('` / `') + '`');
  L.push('- type：`' + s.TYPE_VALUES.join('` / `') + '`');
  L.push('- category：`' + s.CATEGORY_VALUES.join('` / `') + '`');
  var lp = s.FIELD_RULES.runtime.props;
  L.push('- runtime.language：`' + lp.language.values.join('` / `') + '`');
  L.push('- runtime.manager：`' + lp.manager.values.join('` / `') + '`');
  L.push('');
  L.push('## 分类定义（赋 category 前必读）');
  L.push('');
  Object.keys(s.CATEGORY_DEFINITIONS).forEach(function(c) {
    var d = s.CATEGORY_DEFINITIONS[c];
    L.push('### ' + c);
    L.push(d.desc);
    L.push('- 命中词：' + d.scent.join('、'));
    L.push('- 反例：' + d.anti);
    L.push('');
  });
  return L.join('\n');
}

// 治理真相源索引：每条治理主题只有一个家，这里是索引不是内容
var SOURCES_MD = [
  '# 治理真相源索引',
  '',
  '每条治理主题只有一个家，改了自动生效。本索引只读不存，内容指向文件。',
  '',
  '| 主题 | 唯一真相源 |',
  '|------|-----------|',
  '| 治理宪法（原则/骨件边界） | `AGENT.md` |',
  '| 设计语言（配色/字体/组件/场景） | `~/.claude/skills/vivi-design-system/`（SKILL.md + brand-dna.md + references/） |',
  '| Manifest Schema（字段/枚举/校验） | `lib/manifest-schema.js` |',
  '| 落盘规则 | `~/.claude/CLAUDE.md` §文件纪律、§落盘位置约定 |',
  '| 操作日志格式/分类 | `tips/CONSTITUTION.md` |',
  '| 网站注册表格式 | `apps/CONSTITUTION.md` |',
  '| 备份与恢复 | `F:\\warehouse\\inbox\\CLAUDE.md` |',
  '| 文件边界/架构 | `AGENT.md` §架构 |',
  '| 技术选型 | `package.json`（以实际依赖为准） |',
  ''
].join('\n');

function registerRoutes(app, ctx) {
  var { read, esc, monogram, listDirs, openFolder, safeResolve, getChineseName, scanAllSkills, parseSkill, moveSkillDir, trashSkill, renderMarkdown, scanTools, findManifest, startTool, stopTool, createTool, updateTool, getHealth, apiHTML, registry, TOOLS_DIR, SKILLS_DIR, TIPS_DIR, PRINCIPLES_DIR, LOCAL_SKILLS_DIR, PROJECT_DIR, AGENTBOARD_HOME, apiLog, apiCounts, commands } = ctx;

  // 测试钩子：apps/ 真相源目录可被 env 覆盖（默认仓库根）
  var APPS_DIR = process.env.AGENTBOARD_APPS_REGISTRY || path.join(__dirname, '..', 'apps');
  function appPath(id) { return path.join(APPS_DIR, id + '.json'); }
  function readAllApps() {
    var out = [];
    if (!fs.existsSync(APPS_DIR)) return out;
    var files = fs.readdirSync(APPS_DIR).filter(function(f) { return f.endsWith('.json'); });
    files.forEach(function(f) {
      try {
        var a = JSON.parse(fs.readFileSync(path.join(APPS_DIR, f), 'utf8'));
        if (a && a.id) out.push(a);
      } catch (e) { console.error('[apps] broken file: ' + f + ' — ' + e.message); }
    });
    out.sort(function(x, y) {
      var xo = (x.order === undefined ? Infinity : x.order);
      var yo = (y.order === undefined ? Infinity : y.order);
      return (xo - yo) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
    });
    return out;
  }

  app.get('/api', function(req, res) {
    var data = {
      name: 'Agentboard',
      version: '1.0.0',
      description: 'Filesystem-as-registry toolchain control plane for AI agents',
      endpoints: {
        // ── 服务发现 Discovery ──
        'GET /api': {
          description: 'API discovery document — all endpoints with metadata, manifest schema, full tools list',
          category: '服务发现',
          curl: 'curl http://localhost:3099/api',
          response: '{ name, version, description, endpoints, manifestSchema, tools, toolsDir, skillsDir }'
        },
        // ── 工具管理 Tool Mgmt ──
        'GET /api/tools': {
          description: 'List all registered tools with running status, conflicts, and agent_notes',
          category: '工具管理',
          curl: 'curl http://localhost:3099/api/tools',
          response: '{ ok: true, tools: [...] }',
          note: '每次操作工具前必调——读取 conflicts 和 agent_notes 字段'
        },
        'GET /api/tools/:id': {
          description: 'Get a single tool by id',
          category: '工具管理',
          curl: 'curl http://localhost:3099/api/tools/minicpm-v',
          response: '{ ok: true, tool: {...} }'
        },
        'POST /api/tools/start/:id': {
          description: 'Start a tool by id (executes startCommand from manifest)',
          category: '工具管理',
          curl: 'curl -X POST http://localhost:3099/api/tools/start/ace-step',
          body: 'Path param: :id = 工具目录名 / tool directory name',
          response: '{ ok: true } 或 { ok: false, error: "..." }'
        },
        'POST /api/tools/stop/:id': {
          description: 'Stop a tool by id (executes stopCommand from manifest)',
          category: '工具管理',
          curl: 'curl -X POST http://localhost:3099/api/tools/stop/ace-step',
          body: 'Path param: :id = 工具目录名 / tool directory name',
          response: '{ ok: true } 或 { ok: false, error: "..." }'
        },
        'POST /api/tools/reorder': {
          description: 'Reorder tools — writes new order values to manifest files',
          category: '工具管理',
          curl: 'curl -X POST http://localhost:3099/api/tools/reorder -H "Content-Type: application/json" -d \'{"items":[{"id":"ace-step","order":1}]}\'',
          body: 'JSON: { items: [{ id: "tool-id", order: <number> }, ...] }',
          response: '[{ id, ok: true|false, error? }]'
        },
        'POST /api/tools': {
          description: 'Create a new tool — makes ~/.agentboard/tools/{id}/manifest.json',
          category: '工具管理',
          curl: 'curl -X POST http://localhost:3099/api/tools -H "Content-Type: application/json" -d \'{"id":"my-tool","name":"My Tool","category":"创作","startCommand":"node server.js","stopCommand":"npx kill-port 3000","port":3000}\'',
          body: 'JSON: { id (lowercase a-z, 0-9, -, _), name, description?, icon?, version?, category?, order?, port?, ports?, projectPath?, url?, startCommand?, stopCommand?, publicUrl?, owner?, apiBase?, type?, trigger?, agent_notes? }',
          response: '201 { ok: true, tool: {...} }'
        },
        'PUT /api/tools/:id': {
          description: 'Update a tool manifest — partial update, only send fields to change',
          category: '工具管理',
          curl: 'curl -X PUT http://localhost:3099/api/tools/my-tool -H "Content-Type: application/json" -d \'{"category":"推理","description":"Updated description"}\'',
          body: 'JSON: any subset of writable fields (id cannot be changed). Fields: name, description, icon, version, category, order, port, ports, projectPath, url, startCommand, stopCommand, publicUrl, owner, apiBase, type, trigger, agent_notes, conflicts, children',
          response: '{ ok: true, tool: {...updated...} }'
        },
        'DELETE /api/tools/:id': {
          description: 'Delete a tool manifest and its directory. REQUIRES ?confirm=true',
          category: '工具管理',
          curl: 'curl -X DELETE "http://localhost:3099/api/tools/my-tool?confirm=true"',
          body: 'Query: confirm=true (required). Deletes entire ~/.agentboard/tools/{id}/ directory.',
          response: '{ ok: true, deleted: "my-tool" }',
          note: '红线操作——删除整个工具目录，不可逆。无 confirm=true 返回 400'
        },
        // ── 统计 Stats ──
        'GET /api/stats': {
          description: 'API call statistics — total calls, by caller (agent/browser), by action, top tools',
          category: '统计',
          curl: 'curl http://localhost:3099/api/stats',
          response: '{ ok: true, totalCalls, todayCalls, byCaller: {all, today}, byAction: {all, today}, byTool: [...] }'
        },
        // ── 联邦巡检 Loop Monitor ──
        'GET /api/loop/health': {
          description: 'Scan all loop projects for health.json status',
          category: '联邦巡检',
          curl: 'curl http://localhost:3099/api/loop/health',
          response: '{ projects: [...], updated: "ISO8601" }'
        },
        // ── 文件操作 ──
        'GET /api/open-folder': {
          description: 'Open a folder in Windows Explorer (?path= absolute path)',
          category: '文件操作',
          curl: 'curl "http://localhost:3099/api/open-folder?path=D:/workspace"',
          body: 'Query: path=<absolute path>. Only works within declared workspace roots.',
          response: '{ ok: true, path: "..." }'
        },
        'GET /open-dir/:name': {
          description: 'Open a skill directory in Explorer by name (e.g. /open-dir/perspective-router)',
          category: '文件操作',
          curl: 'curl http://localhost:3099/open-dir/perspective-router',
          body: 'Path param: :name = skill directory name under ~/.claude/skills/',
          response: '{ ok: true, path: "..." }'
        }
      },
      manifestSchema: {
        id: 'string — directory name under TOOLS_DIR (lowercase a-z 0-9 - _)',
        name: 'string — display name',
        description: 'string — 用途/何时用/何时不用/返回/延迟/端口 等',
        icon: 'string — emoji or single character',
        version: 'string — semver',
        category: 'string — 模型|Agent|设施|获取|查阅|创作|职能',
        order: 'number — sort order in dashboard grid',
        port: 'number — single port the tool listens on',
        ports: 'number[] — multiple ports',
        projectPath: 'string — working directory on disk',
        url: 'string — browser URL when running',
        startCommand: 'string — shell command to start the tool',
        stopCommand: 'string — shell command to stop the tool',
        publicUrl: 'string — public domain (e.g. https://gallery.evopearl.com/)',
        owner: 'string — 自建|外部 (可选)',
        apiBase: 'string — API base URL for external services',
        type: 'string — service|cli|folder|group',
        trigger: 'string — CLI trigger string (shown on card)',
        agent_notes: 'string — AI 踩坑笔记 (DeepSeek 盲区/前置条件)',
        conflicts: 'string[] — conflicting tool IDs (GPU互斥/端口冲突)',
        children: 'array — sub-items for group-type tools'
      },
      tools: (function() { try { return scanTools(); } catch(e) { return []; } })(),
      toolsDir: TOOLS_DIR,
      skillsDir: SKILLS_DIR
    };
    if (req.headers.accept && req.headers.accept.indexOf('text/html') !== -1) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(apiHTML(data));
    } else {
      res.json(data);
    }
  });

  // --- Cron state proxy → scheduler :3100 ---
  app.get('/api/cron/state', function(req, res) {
    var opts = { hostname: '127.0.0.1', port: 3100, path: '/api/cron/state', method: 'GET', timeout: 5000 };
    var proxy = http.request(opts, function(upstream) {
      if (upstream.statusCode !== 200) {
        if (!res.headersSent) res.status(502).json({ ok: false, error: 'scheduler returned ' + upstream.statusCode });
        return;
      }
      var body = '';
      upstream.on('data', function(c) { body += c; });
      upstream.on('end', function() {
        if (!res.headersSent) { res.type('json'); res.send(body); }
      });
    });
    proxy.on('error', function() { if (!res.headersSent) res.json({ ok: false, error: 'scheduler unreachable' }); });
    proxy.on('timeout', function() { proxy.destroy(); if (!res.headersSent) res.json({ ok: false, error: 'scheduler timeout' }); });
    proxy.end();
  });

  // --- Tools API ---
  app.get('/api/tools', function(req, res) {
    var tools = scanTools();
    // Individual cron task cards suppressed — consolidated under cron-scheduler card
    res.json({ ok: true, tools: tools });
  });

  // 表单字段契约（前端表单从这里派生渲染，禁止手写字段副本）
  app.get('/api/tools/schema', function(req, res) {
    res.json({
      ok: true,
      schema: {
        fields: schemaDef.TOOL_FIELDS,
        formTypes: schemaDef.FORM_TYPES,
        categoryValues: schemaDef.CATEGORY_VALUES,
        categoryDefinitions: schemaDef.CATEGORY_DEFINITIONS,
        catSuggest: schemaDef.CAT_SUGGEST,
        runtimeValues: schemaDef.FIELD_RULES.runtime.props.language.values
      }
    });
  });

  app.get('/api/apps', function(req, res) {
    try {
      res.json({ ok: true, apps: readAllApps() });
    } catch (e) {
      res.json({ ok: false, error: 'apps unreadable: ' + e.message });
    }
  });

  // 表单字段契约（前端表单从这里派生渲染，禁止手写字段副本）
  app.get('/api/apps/schema', function(req, res) {
    res.json({
      ok: true,
      schema: {
        fields: appSchema.APP_FIELDS,
        required: appSchema.APP_REQUIRED,
        optional: appSchema.APP_OPTIONAL
      }
    });
  });

  // ── 应用写回（apps/ 一个应用一个 {id}.json） ──
  app.post('/api/apps', express.json(), function(req, res) {
    var b = req.body || {};
    var name = String(b.name || '').trim();
    var domain = String(b.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '');
    if (!name) return res.status(400).json({ ok: false, error: 'name required' });
    if (!domain) return res.status(400).json({ ok: false, error: 'domain required' });
    var host = b.host === '__custom__' ? String(b.hostCustom || '').trim() : String(b.host || '');
    var app = {
      id: domain,
      name: name,
      url: appUrlFromDomain(domain),
      description: String(b.description || '').trim(),
      status: 'live',
      host: host
    };
    // 高级字段透传（面板 + agent 都用；空值跳过）
    ['localDev', 'devTool', 'endpoints', 'agentNote', 'logo'].forEach(function (k) {
      if (b[k] !== undefined && b[k] !== null && String(b[k]).trim() !== '') app[k] = b[k];
    });
    try {
      if (fs.existsSync(appPath(domain))) return res.status(409).json({ ok: false, error: 'app exists: ' + domain });
      var existing = readAllApps();
      var maxOrder = existing.length ? Math.max.apply(null, existing.map(function(a) { return a.order === undefined ? -1 : a.order; })) : -1;
      app.order = (b.order !== undefined && b.order !== '') ? Number(b.order) : (maxOrder + 1);
      var v = appSchema.validateApp(app);
      if (!v.ok) return res.status(400).json({ ok: false, error: 'schema: ' + v.errors.join('; ') });
      registry.writeManifestAtomic(appPath(domain), app);
    } catch (e) { return res.status(500).json({ ok: false, error: 'write failed: ' + e.message }); }
    res.json({ ok: true, app: app });
  });

  // 拖拽排序批量写 order（body {ids:[...]}，按数组序写 0..n；真相源 = apps/{id}.json）
  app.post('/api/apps/reorder', express.json(), function(req, res) {
    var ids = (req.body && req.body.ids) || [];
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ ok: false, error: 'ids required' });
    try {
      ids.forEach(function(id, idx) {
        var file = appPath(id);
        if (!fs.existsSync(file)) return;
        var a = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (a.order !== idx) { a.order = idx; registry.writeManifestAtomic(file, a); }
      });
    } catch (e) { return res.status(500).json({ ok: false, error: 'reorder failed: ' + e.message }); }
    res.json({ ok: true, reordered: ids.length });
  });

  app.put('/api/apps/:id', express.json(), function(req, res) {
    var b = req.body || {};
    var file = appPath(req.params.id);
    var app;
    try {
      if (!fs.existsSync(file)) return res.status(404).json({ ok: false, error: 'app not found: ' + req.params.id });
      app = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (b.name !== undefined) app.name = String(b.name);
      if (b.description !== undefined) app.description = String(b.description);
      if (b.host !== undefined) app.host = String(b.host);
      if (b.localDev !== undefined) app.localDev = String(b.localDev);
      if (b.devTool !== undefined) app.devTool = String(b.devTool);
      if (b.endpoints !== undefined) app.endpoints = b.endpoints;
      if (b.agentNote !== undefined) app.agentNote = String(b.agentNote);
      if (b.logo !== undefined) app.logo = String(b.logo);
      if (b.order !== undefined && b.order !== '') app.order = Number(b.order);
      var v = appSchema.validateApp(app);
      if (!v.ok) return res.status(400).json({ ok: false, error: 'schema: ' + v.errors.join('; ') });
      if (b.domain !== undefined) {
        var dom = String(b.domain).trim().toLowerCase().replace(/^https?:\/\//, '');
        if (!dom) return res.status(400).json({ ok: false, error: 'domain required' });
        if (dom !== app.id && fs.existsSync(appPath(dom))) return res.status(409).json({ ok: false, error: 'app exists: ' + dom });
        if (dom !== app.id) {
          app.id = dom;
          app.url = appUrlFromDomain(dom);
          registry.writeManifestAtomic(appPath(dom), app);
          fs.unlinkSync(file);
        } else {
          registry.writeManifestAtomic(file, app);
        }
      } else {
        registry.writeManifestAtomic(file, app);
      }
    } catch (e) { return res.status(500).json({ ok: false, error: 'write failed: ' + e.message }); }
    res.json({ ok: true, app: app });
  });

  app.delete('/api/apps/:id', function(req, res) {
    var file = appPath(req.params.id);
    try {
      if (!fs.existsSync(file)) return res.status(404).json({ ok: false, error: 'app not found: ' + req.params.id });
      fs.unlinkSync(file);
    } catch (e) { return res.status(500).json({ ok: false, error: 'delete failed: ' + e.message }); }
    res.json({ ok: true, removed: req.params.id });
  });

  app.get('/api/tips', function(req, res) {
    try {
      var files = fs.readdirSync(TIPS_DIR).filter(function(f) { return f.endsWith('.md') && f !== 'CONSTITUTION.md' && f !== 'CHECKPOINT.md'; }).sort();
      var tips = files.map(function(f) {
        var tip = parseTipFile(path.join(TIPS_DIR, f));
        return tip ? { file: f, title: tip.title, desc: tip.desc, type: tip.type || 'reference' } : null;
      }).filter(Boolean);
      res.json({ ok: true, tips: tips });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  // 表单字段契约（前端表单从这里派生渲染，禁止手写字段副本）
  app.get('/api/principles/schema', function(req, res) {
    res.json({
      ok: true,
      schema: {
        fields: principleSchema.PRINCIPLE_FIELDS,
        typeValues: principleSchema.PRINCIPLE_TYPE_VALUES
      }
    });
  });

  app.get('/api/principles', function(req, res) {
    try {
      var files = fs.readdirSync(PRINCIPLES_DIR).filter(function(f) { return f.endsWith('.md') && f !== 'CONSTITUTION.md'; }).sort();
      var items = files.map(function(f) {
        var p = parsePrincipleFile(path.join(PRINCIPLES_DIR, f));
        return p ? { file: f, title: p.title, desc: p.desc, what: p.what || p.desc, type: p.type || 'review' } : null;
      }).filter(Boolean);
      res.json({ ok: true, principles: items });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  var PRINC_SECTIONS = [['what', '是什么'], ['how', '怎么用'], ['case', '案例'], ['edge', '边界']];
  function principleSectionsBody(title, s) {
    var body = '# ' + title + '\n';
    PRINC_SECTIONS.forEach(function(p) {
      var v = String(s[p[0]] || '').trim();
      if (v) body += '\n## ' + p[1] + '\n\n' + v + '\n';
    });
    return body;
  }
  function principleFrontmatter(type, date, source) {
    var lines = [];
    if (type) lines.push('type: ' + type);
    if (date) lines.push('date: ' + date);
    if (source) lines.push('source: ' + source);
    return '---\n' + lines.join('\n') + '\n---\n\n';
  }
  function principleSectionFields(b) {
    return {
      what: String(b.what || '').trim(),
      how: String(b.how || '').trim(),
      case: String(b.case || '').trim(),
      edge: String(b.edge || '').trim()
    };
  }

  app.get('/api/principles/:file', function(req, res) {
    var fname = safeTipName(req.params.file);
    if (!fname) return res.status(400).json({ ok: false, error: 'invalid file name' });
    if (fname === 'CONSTITUTION.md') return res.status(403).json({ ok: false, error: 'protected: ' + fname });
    var file = path.join(PRINCIPLES_DIR, fname);
    if (!fs.existsSync(file)) return res.status(404).json({ ok: false, error: 'principle not found: ' + fname });
    res.type('text/plain').send(read(file));
  });

  app.post('/api/principles', express.json(), function(req, res) {
    var b = req.body || {};
    var title = String(b.title || '').trim();
    var type = String(b.type || '').trim();
    var date = String(b.date || '').trim();
    var source = String(b.source || '').trim();
    var sec = principleSectionFields(b);
    if (!title) return res.status(400).json({ ok: false, error: 'title required' });
    if (!type) return res.status(400).json({ ok: false, error: 'type required' });
    if (!sec.what || !sec.how) return res.status(400).json({ ok: false, error: '是什么 / 怎么用 必填' });
    var now = new Date();
    var stamp = now.getFullYear() + p2(now.getMonth() + 1) + p2(now.getDate()) + '-' + p2(now.getHours()) + p2(now.getMinutes());
    var fname = 'principle-' + stamp + '.md';
    if (fs.existsSync(path.join(PRINCIPLES_DIR, fname))) fname = 'principle-' + stamp + p2(now.getSeconds()) + '.md';
    try { writeTextAtomic(path.join(PRINCIPLES_DIR, fname), principleFrontmatter(type, date, source) + principleSectionsBody(title, sec)); }
    catch (e) { return res.status(500).json({ ok: false, error: 'write failed: ' + e.message }); }
    res.json({ ok: true, file: fname });
  });

  app.put('/api/principles/:file', express.json(), function(req, res) {
    var fname = safeTipName(req.params.file);
    if (!fname) return res.status(400).json({ ok: false, error: 'invalid file name' });
    if (fname === 'CONSTITUTION.md') return res.status(403).json({ ok: false, error: 'protected: ' + fname });
    var b = req.body || {};
    var title = String(b.title || '').trim();
    var type = String(b.type || '').trim();
    var date = String(b.date || '').trim();
    var source = String(b.source || '').trim();
    var sec = principleSectionFields(b);
    if (!title) return res.status(400).json({ ok: false, error: 'title required' });
    if (!type) return res.status(400).json({ ok: false, error: 'type required' });
    if (!sec.what || !sec.how) return res.status(400).json({ ok: false, error: '是什么 / 怎么用 必填' });
    var file = path.join(PRINCIPLES_DIR, fname);
    if (!fs.existsSync(file)) return res.status(404).json({ ok: false, error: 'principle not found: ' + fname });
    var existing = read(file) || '';
    var fmLines = [];
    var fm = existing.match(/^---\n([\s\S]*?)\n---\n?/);
    if (fm) fmLines = fm[1].split('\n');
    // 保留未知 frontmatter 行，type/date/source 以本次提交为准（空则删）
    var kept = fmLines.filter(function(line) { return !/^(type|date|source):/.test(line); });
    if (type) kept.push('type: ' + type);
    if (date) kept.push('date: ' + date);
    if (source) kept.push('source: ' + source);
    var content = '---\n' + kept.join('\n') + '\n---\n\n' + principleSectionsBody(title, sec);
    try { writeTextAtomic(file, content); }
    catch (e) { return res.status(500).json({ ok: false, error: 'write failed: ' + e.message }); }
    res.json({ ok: true, file: fname });
  });

  app.delete('/api/principles/:file', function(req, res) {
    var fname = safeTipName(req.params.file);
    if (!fname) return res.status(400).json({ ok: false, error: 'invalid file name' });
    if (fname === 'CONSTITUTION.md') return res.status(403).json({ ok: false, error: 'protected: ' + fname });
    var file = path.join(PRINCIPLES_DIR, fname);
    if (!fs.existsSync(file)) return res.status(404).json({ ok: false, error: 'principle not found: ' + fname });
    try { fs.unlinkSync(file); }
    catch (e) { return res.status(500).json({ ok: false, error: 'delete failed: ' + e.message }); }
    res.json({ ok: true, removed: fname });
  });

  // ── 日志写回（tips/*.md 真相源） ──
  app.get('/api/tips/const', function(req, res) {
    var p = path.join(TIPS_DIR, 'CONSTITUTION.md');
    if (!fs.existsSync(p)) return res.status(404).json({ ok: false, error: 'CONSTITUTION.md not found' });
    res.type('text/plain').send(read(p));
  });

  app.get('/api/tips/:file', function(req, res) {
    var fname = safeTipName(req.params.file);
    if (!fname) return res.status(400).json({ ok: false, error: 'invalid file name' });
    if (fname === 'CONSTITUTION.md' || fname === 'CHECKPOINT.md') return res.status(403).json({ ok: false, error: 'protected: ' + fname });
    var file = path.join(TIPS_DIR, fname);
    if (!fs.existsSync(file)) return res.status(404).json({ ok: false, error: 'tip not found: ' + fname });
    res.type('text/plain').send(read(file));
  });

  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function localDate(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function tipBody(type, title, desc, source, tool, scenario) {
    var lines = ['type: ' + type, 'date: ' + localDate(new Date())];
    if (source) lines.push('source: ' + source);
    if (tool) lines.push('tool: ' + tool);
    if (scenario) lines.push('scenario: ' + scenario);
    return '---\n' + lines.join('\n') + '\n---\n\n# ' + title + '\n\n' + desc + '\n';
  }

  app.post('/api/tips', express.json(), function(req, res) {
    var b = req.body || {};
    var title = String(b.title || '').trim();
    var type = String(b.type || '').trim();
    var desc = String(b.desc || '').trim();
    var source = String(b.source || '').trim();
    var tool = String(b.tool || '').trim();
    var scenario = String(b.scenario || '').trim();
    if (!title) return res.status(400).json({ ok: false, error: 'title required' });
    if (!type) return res.status(400).json({ ok: false, error: 'type required' });
    var now = new Date();
    var stamp = now.getFullYear() + p2(now.getMonth() + 1) + p2(now.getDate()) + '-' + p2(now.getHours()) + p2(now.getMinutes());
    var fname = 'tip-' + stamp + '.md';
    if (fs.existsSync(path.join(TIPS_DIR, fname))) fname = 'tip-' + stamp + p2(now.getSeconds()) + '.md';
    try { writeTextAtomic(path.join(TIPS_DIR, fname), tipBody(type, title, desc, source, tool, scenario)); }
    catch (e) { return res.status(500).json({ ok: false, error: 'write failed: ' + e.message }); }
    res.json({ ok: true, file: fname });
  });

  app.put('/api/tips/:file', express.json(), function(req, res) {
    var fname = safeTipName(req.params.file);
    if (!fname) return res.status(400).json({ ok: false, error: 'invalid file name' });
    if (fname === 'CONSTITUTION.md' || fname === 'CHECKPOINT.md') return res.status(403).json({ ok: false, error: 'protected: ' + fname });
    var b = req.body || {};
    var title = String(b.title || '').trim();
    var type = String(b.type || '').trim();
    var desc = String(b.desc || '').trim();
    // source 三态：undefined=保留原值；''=删除；非空=更新
    var srcBody = b.source === undefined ? null : String(b.source).trim();
    // tool/scenario 同款三态
    var toolBody = b.tool === undefined ? null : String(b.tool).trim();
    var scenBody = b.scenario === undefined ? null : String(b.scenario).trim();
    if (!title) return res.status(400).json({ ok: false, error: 'title required' });
    if (!type) return res.status(400).json({ ok: false, error: 'type required' });
    var file = path.join(TIPS_DIR, fname);
    if (!fs.existsSync(file)) return res.status(404).json({ ok: false, error: 'tip not found: ' + fname });
    var existing = read(file) || '';
    var fmLines = [];
    var fm = existing.match(/^---\n([\s\S]*?)\n---\n?/);
    if (fm) fmLines = fm[1].split('\n');
    var hasType = false, hasDate = false, hasSource = false, hasTool = false, hasScenario = false;
    var kept = fmLines.map(function(line) {
      if (/^type:/.test(line)) { hasType = true; return 'type: ' + type; }
      if (/^date:/.test(line)) { hasDate = true; return line; }
      if (/^source:/.test(line)) { hasSource = true; return srcBody === null ? line : (srcBody ? 'source: ' + srcBody : null); }
      if (/^tool:/.test(line)) { hasTool = true; return toolBody === null ? line : (toolBody ? 'tool: ' + toolBody : null); }
      if (/^scenario:/.test(line)) { hasScenario = true; return scenBody === null ? line : (scenBody ? 'scenario: ' + scenBody : null); }
      return line;
    }).filter(function(l) { return l !== null; });
    if (!hasType) kept.push('type: ' + type);
    if (!hasDate) kept.push('date: ' + localDate(new Date()));
    if (srcBody && !hasSource) kept.push('source: ' + srcBody);
    if (toolBody && !hasTool) kept.push('tool: ' + toolBody);
    if (scenBody && !hasScenario) kept.push('scenario: ' + scenBody);
    var content = '---\n' + kept.join('\n') + '\n---\n\n# ' + title + '\n\n' + desc + '\n';
    try { writeTextAtomic(file, content); }
    catch (e) { return res.status(500).json({ ok: false, error: 'write failed: ' + e.message }); }
    res.json({ ok: true, file: fname });
  });

  app.delete('/api/tips/:file', function(req, res) {
    var fname = safeTipName(req.params.file);
    if (!fname) return res.status(400).json({ ok: false, error: 'invalid file name' });
    if (fname === 'CONSTITUTION.md' || fname === 'CHECKPOINT.md') return res.status(403).json({ ok: false, error: 'protected: ' + fname });
    var file = path.join(TIPS_DIR, fname);
    if (!fs.existsSync(file)) return res.status(404).json({ ok: false, error: 'tip not found: ' + fname });
    try { fs.unlinkSync(file); }
    catch (e) { return res.status(500).json({ ok: false, error: 'delete failed: ' + e.message }); }
    res.json({ ok: true, removed: fname });
  });

  // AI 面系统规范：治理宪法 + Manifest Schema + 真相源索引（三篇都从真源生成，不维护第二份拷贝）
  app.get('/api/registry', function(req, res) {
    try {
      var governance = read(path.join(PROJECT_DIR, 'AGENT.md'));
      var DOCS = [
        ['governance', '治理宪法', 'AGENT.md', governance || ''],
        ['schema', 'Manifest Schema', 'lib/manifest-schema.js', schemaToMarkdown()],
        ['sources', '真相源索引', '(生成)', SOURCES_MD]
      ];
      res.json({ ok: true, docs: DOCS.map(function(d) {
        return { key: d[0], title: d[1], file: d[2], markdown: d[3] };
      }) });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  // 说明书：工具架自己的手册 docs/使用说明书.html（唯一真相源，iframe 引用）
  // no-cache：iframe 每次都重新校验，避免改文档后浏览器还吐旧版
  app.get('/manual', function(req, res) {
    var p = path.join(PROJECT_DIR, 'docs', '使用说明书.html');
    if (!fs.existsSync(p)) return res.status(404).send('manual not found');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.type('html').send(read(p));
  });

  app.get('/api/tools/:id', function(req, res) {
    var tools = scanTools();
    var tool = null;
    for (var i = 0; i < tools.length; i++) {
      if (tools[i].id === req.params.id) { tool = tools[i]; break; }
    }
    if (!tool) return res.status(404).json({ ok: false, error: 'tool not found' });
    res.json({ ok: true, tool: tool });
  });

  app.post('/api/tools/start/:id', function(req, res) {
    var result = startTool(req.params.id);
    res.json(result);
  });

  app.post('/api/tools/stop/:id', function(req, res) {
    var result = stopTool(req.params.id);
    if (!result.ok) return res.status(500).json(result);
    res.json(result);
  });

  app.get('/api/tools/:id/start-failed', function(req, res) {
    var d = registry.readStartFailed(req.params.id);
    if (!d) return res.status(404).json({ ok: false, error: 'no start-failed record within TTL' });
    res.json({ ok: true, tool: req.params.id, record: d });
  });

  app.post('/api/tools/reorder', function(req, res) {
    var items = req.body && req.body.items;
    if (!Array.isArray(items)) return res.status(400).json({ ok: false, error: 'items array required' });
    var results = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var mfPath = findManifest(item.id);
      if (!mfPath) { results.push({ id: item.id, ok: false, error: 'not found' }); continue; }
      try {
        var mf = JSON.parse(read(mfPath));
        mf.order = item.order;
        registry.writeManifestAtomic(mfPath, mf);
        results.push({ id: item.id, ok: true });
      } catch(e) {
        results.push({ id: item.id, ok: false, error: e.message });
      }
    }
    res.json({ ok: true, results: results });
  });

  // ── Manifest CRUD ──

  // Create a new tool manifest
  app.post('/api/tools', express.json(), function(req, res) {
    var result = createTool(req.body);
    if (!result.ok) {
      var status = result.error && result.error.indexOf('already exists') !== -1 ? 409 : 400;
      return res.status(status).json(result);
    }
    res.status(201).json(result);
  });

  // Update an existing tool manifest (partial update)
  app.put('/api/tools/:id', express.json(), function(req, res) {
    var result = updateTool(req.params.id, req.body);
    if (!result.ok) {
      var status = result.error && result.error.indexOf('not found') !== -1 ? 404 : 400;
      return res.status(status).json(result);
    }
    res.json(result);
  });

  // Delete a tool manifest (requires explicit confirmation)
  app.delete('/api/tools/:id', function(req, res) {
    if (req.query.confirm !== 'true') {
      return res.status(400).json({ ok: false, error: 'Pass ?confirm=true to delete. This action removes the entire tool directory.' });
    }

    var mfPath = findManifest(req.params.id);
    if (!mfPath || !fs.existsSync(mfPath)) {
      return res.status(404).json({ ok: false, error: 'tool not found: ' + req.params.id });
    }

    var toolDir = path.dirname(mfPath);
    // Safety: only delete directories under TOOLS_DIR
    if (!toolDir.startsWith(path.resolve(TOOLS_DIR) + path.sep)) {
      return res.status(403).json({ ok: false, error: 'refusing to delete directory outside TOOLS_DIR' });
    }

    try {
      fs.rmSync(toolDir, { recursive: true, force: true });
      res.json({ ok: true, deleted: req.params.id });
    } catch(e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Open skill folder in file explorer
  app.get('/open-dir/:name', function(req, res) {
    var name = req.params.name;
    // Validate: only allow perspective-* or known skill names
    if (!/^[a-zA-Z][-a-zA-Z0-9_.]*$/.test(name)) return res.status(400).send('invalid name');
    var dir = path.join(SKILLS_DIR, name);
    if (!fs.existsSync(dir)) dir = path.join(SKILLS_DIR, '_disabled', name);
    if (!fs.existsSync(dir)) return res.status(404).send('directory not found');
    var cmd = 'start "" "' + dir + '"';
    require('child_process').exec(cmd);
    res.json({ ok: true, path: dir });
  });

  // 技能拖拽排序：顺序落盘 agentboard state（skill-order.json，agentboard 自有视图状态），按数组序生效
  var skillOrderPath = path.join(AGENTBOARD_HOME, 'state', 'skill-order.json');
  function readSkillOrder() {
    try { return JSON.parse(fs.readFileSync(skillOrderPath, 'utf8')); } catch (_) { return []; }
  }
  function writeSkillOrder(names) {
    fs.mkdirSync(path.dirname(skillOrderPath), { recursive: true });
    writeTextAtomic(skillOrderPath, JSON.stringify(names));
  }
  app.post('/api/skills/reorder', express.json(), function(req, res) {
    var names = (req.body && req.body.names) || [];
    if (!Array.isArray(names) || !names.length) return res.status(400).json({ ok: false, error: 'names required' });
    var known = {};
    scanAllSkills().forEach(function(s) { known[s.name] = true; });
    var clean = names.filter(function(n) { return known[n]; });
    if (!clean.length) return res.status(400).json({ ok: false, error: 'no valid names' });
    try { writeSkillOrder(clean); } catch (e) { return res.status(500).json({ ok: false, error: 'reorder failed: ' + e.message }); }
    res.json({ ok: true, reordered: clean.length });
  });

  // Catalog 数据 API: 技能 + 架构图 + 命令 + 全局宪法（dashboard 能力地图页前端渲染数据源）
  app.get('/api/catalog/data', function(req, res) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    var skills = scanAllSkills();
    var orderIdx = {};
    readSkillOrder().forEach(function(n, i) { orderIdx[n] = i; });
    skills.sort(function(a, b) {
      var ia = orderIdx[a.name], ib = orderIdx[b.name];
      if (ia === undefined && ib === undefined) return 0;
      if (ia === undefined) return 1;
      if (ib === undefined) return -1;
      return ia - ib;
    });

    // 未注册候选：skills/ 下存在但还不是卡片的目录（无 SKILL.md）——新增技能下拉的可选项
    var unregistered = [];
    listDirs(SKILLS_DIR).forEach(function(name) {
      if (name.charAt(0) === '_') return;
      if (!parseSkill(name, SKILLS_DIR, false)) {
        unregistered.push({ name: name, displayName: getChineseName(name) });
      }
    });

    var diagrams = [];
    var seen = {};
    var dDirs = [LOCAL_SKILLS_DIR, SKILLS_DIR];
    dDirs.forEach(function(dir) {
      if (!fs.existsSync(dir)) return;
      listDirs(dir).forEach(function(name) {
        if (seen[name]) return;
        seen[name] = true;
        var fp = path.join(dir, name, 'references', 'system-diagram.html');
        if (!fs.existsSync(fp)) return;
        diagrams.push({ skill: name, file: 'system-diagram.html', displayName: getChineseName(name) });
      });
    });
    diagrams.sort(function(a, b) { return a.displayName.localeCompare(b.displayName, 'zh-CN'); });

    var globalMdPath = path.join(os.homedir(), '.claude', 'CLAUDE.md');
    var globalMd = read(globalMdPath) || '';
    var global = { path: globalMdPath, lines: globalMd ? globalMd.split('\n').length : 0, html: globalMd ? renderMarkdown(globalMd) : '<p>CLAUDE.md 未找到</p>' };

    var capLinks = [
      { label: '飞书文档', desc: '技能状态管理', url: 'https://fcn7dgp1xcm8.feishu.cn/base/FwEBbTrINardRbsqqHHcdgGInYg?table=tblit8CLakw8CvDm&view=vewAHpeOnc' }
    ];

    res.json({ skills: skills, unregistered: unregistered, diagrams: diagrams, commands: commands.buildRows(), global: global, links: capLinks });
  });

  // 命令二次加构：标注（分类/中文名/中文说明）或补录提取漏检命令
  var CMD_NAME_RE = /^[A-Za-z0-9-]+$/;
  var COMMAND_CATS = ['会话控制', '配置管理', '项目管理', '代码分析', '记忆系统', 'IDE 集成', '账户认证', '诊断帮助'];
  app.post('/api/commands', express.json(), function(req, res) {
    var body = req.body || {};
    var name = String(body.name || '').trim();
    if (!CMD_NAME_RE.test(name)) return res.status(400).json({ ok: false, error: '非法命令名（仅字母数字 -）' });
    var category = String(body.category || '').trim();
    if (category && COMMAND_CATS.indexOf(category) < 0) return res.status(400).json({ ok: false, error: '非法分类' });
    try {
      commands.upsertCommand({ name: name, category: category, displayName: String(body.displayName || '').trim(), description: String(body.description || '').trim() });
    } catch (e) {
      return res.status(500).json({ ok: false, error: '保存失败: ' + e.message });
    }
    res.json({ ok: true, name: name });
  });

  // 删除命令：注册表命令移除；未标注命令进 dismissed 不再显示
  app.delete('/api/commands/:name', function(req, res) {
    var name = req.params.name;
    if (!CMD_NAME_RE.test(name)) return res.status(400).json({ ok: false, error: '非法命令名' });
    try { commands.removeCommand(name); } catch (e) { return res.status(500).json({ ok: false, error: '删除失败: ' + e.message }); }
    res.json({ ok: true, name: name });
  });

  // /catalog 旧 URL → 能力地图 dashboard 页
  app.get('/catalog', function(req, res) {
    res.redirect(302, '/#capabilities/skills');
  });

  // 技能启停：目录移入/移出 ~/.claude/skills/_disabled/（真停用，Claude Code 不再发现）
  app.post('/api/skills/:name/disable', function(req, res) {
    var r = moveSkillDir(req.params.name, true);
    res.status(r.status || 200).json(r);
  });
  app.post('/api/skills/:name/enable', function(req, res) {
    var r = moveSkillDir(req.params.name, false);
    res.status(r.status || 200).json(r);
  });

  // 编辑技能：改中文名 / 改分类——重写 SKILL.md frontmatter 的 display_name / category 字段
  app.post('/api/skills/:name', express.json(), function(req, res) {
    var name = req.params.name;
    if (!/^[A-Za-z0-9_-]+$/.test(name)) return res.status(400).json({ ok: false, error: '非法技能名' });
    var body = req.body || {};
    var category = String(body.category || '').trim();
    if (category && ['视觉与设计', '写作与文档', '文件与格式', '开发与工具', '思维与方法', '其他'].indexOf(category) < 0) {
      return res.status(400).json({ ok: false, error: '非法分类' });
    }
    var displayName = String(body.displayName || '').trim();
    var icon = String(body.icon || '').trim();
    if (!category && !displayName && !icon) return res.status(400).json({ ok: false, error: '无修改字段' });
    var dir = safeResolve(SKILLS_DIR, name) || safeResolve(path.join(SKILLS_DIR, '_disabled'), name);
    if (!dir) return res.status(400).json({ ok: false, error: '路径越界' });
    var p = path.join(dir, 'SKILL.md');
    if (!fs.existsSync(p)) return res.status(404).json({ ok: false, error: 'SKILL.md 不存在' });
    var s = fs.readFileSync(p, 'utf8');
    var re = /^---\r?\n([\s\S]*?)\r?\n---/;
    function setFm(field, value) {
      var m = s.match(re);
      if (!m) return false;
      var fm = m[1];
      var out = new RegExp('^' + field + '\\s*:.*$', 'm').test(fm)
        ? fm.replace(new RegExp('^' + field + '\\s*:.*$', 'm'), field + ': ' + value)
        : fm.replace(/^name\s*:.*$/m, '$&\n' + field + ': ' + value);
      s = s.replace(re, '---\n' + out + '\n---');
      return true;
    }
    if (category && !setFm('category', category)) return res.status(400).json({ ok: false, error: 'SKILL.md 无 frontmatter' });
    if (displayName && !setFm('display_name', displayName)) return res.status(400).json({ ok: false, error: 'SKILL.md 无 frontmatter' });
    if (icon && !setFm('icon', icon)) return res.status(400).json({ ok: false, error: 'SKILL.md 无 frontmatter' });
    fs.writeFileSync(p, s, 'utf8');
    res.json({ ok: true, name: name, category: category || undefined, displayName: displayName || undefined, icon: icon || undefined });
  });

  // 注册技能：写 ~/.claude/skills/<name>/SKILL.md。已有无 SKILL.md 的目录 → 补写入；已注册 → 409
  app.post('/api/skills', express.json(), function(req, res) {
    var body = req.body || {};
    var name = String(body.name || '').trim();
    if (!/^[A-Za-z0-9_-]+$/.test(name)) return res.status(400).json({ ok: false, error: '非法技能名（仅字母数字 _ -）' });
    var dir = safeResolve(SKILLS_DIR, name);
    if (!dir) return res.status(400).json({ ok: false, error: '路径越界' });
    if (fs.existsSync(path.join(dir, 'SKILL.md'))) return res.status(409).json({ ok: false, error: '技能已注册' });
    var category = String(body.category || '').trim();
    if (category && ['视觉与设计', '写作与文档', '文件与格式', '开发与工具', '思维与方法', '其他'].indexOf(category) < 0) {
      return res.status(400).json({ ok: false, error: '非法分类' });
    }
    var displayName = String(body.displayName || '').trim();
    var icon = String(body.icon || '').trim();
    var fmLines = ['---', 'name: ' + name];
    if (displayName) fmLines.push('display_name: ' + displayName);
    if (category) fmLines.push('category: ' + category);
    if (icon) fmLines.push('icon: ' + icon);
    fmLines.push('---', '');
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: false });
      fs.writeFileSync(path.join(dir, 'SKILL.md'), fmLines.join('\n'), 'utf8');
    } catch (e) {
      return res.status(500).json({ ok: false, error: '创建失败: ' + e.message });
    }
    res.json({ ok: true, name: name });
  });

  // 回收技能：目录移到 ~/.claude/skills/_trash/（回收区，区别于停用）
  app.post('/api/skills/:name/trash', function(req, res) {
    var r = trashSkill(req.params.name);
    res.status(r.status || 200).json(r);
  });

  // Workspace sub-page — scan project directories
  function scanWorkspace(basePath) {
    if (!fs.existsSync(basePath)) return [];
    var projects = [];
    var entries = fs.readdirSync(basePath);
    entries.forEach(function(name) {
      var fullPath = path.join(basePath, name);
      var stat = fs.statSync(fullPath);
      if (!stat.isDirectory()) return;
      if (name.startsWith('.') || name.startsWith('_')) return;
      if (name === 'node_modules') return;

      var meta = {};
      var raw = read(path.join(fullPath, '.project.json'));
      if (raw) { try { var parsed = JSON.parse(raw); if (parsed) meta = parsed; } catch(_) {} }
      var created = stat.birthtime;
      var daysAgo = Math.floor((Date.now() - created.getTime()) / 86400000);
      var recency = daysAgo <= 7 ? 'week' : (daysAgo <= 15 ? 'halfMonth' : (daysAgo <= 30 ? 'month' : 'older'));
      var recencyLabel = daysAgo <= 7 ? '7天内' : (daysAgo <= 15 ? '15天内' : (daysAgo <= 30 ? '30天内' : '超过30天'));

      var status = meta.status || 'undefined';
      var statusLabel = status === 'active' ? '活跃' : (status === 'archived' ? '已归档' : (status === 'abandoned' ? '已放弃' : '待定义'));
      var statusDot = status === 'active' ? 'on' : (status === 'archived' ? 'warn' : (status === 'abandoned' ? 'off' : 'none'));

      projects.push({
        dir: name,
        name: meta.name || name,
        description: meta.description || '',
        status: status,
        statusLabel: statusLabel,
        statusDot: statusDot,
        recency: recency,
        recencyLabel: recencyLabel,
        daysAgo: daysAgo
      });
    });

    var statusOrder = {active:0, undefined:1, archived:2, abandoned:3};
    projects.sort(function(a,b) {
      if (a.daysAgo !== b.daysAgo) return a.daysAgo - b.daysAgo;
      return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
    });
    return projects;
  }

  function walkDir(dir, cb) {
    var entries = fs.readdirSync(dir);
    for (var i = 0; i < entries.length; i++) {
      var p = path.join(dir, entries[i]);
      try {
        var s = fs.statSync(p);
        if (s.isDirectory()) {
          if (entries[i] === 'node_modules' || entries[i] === '.git' || entries[i] === '_runtime') continue;
          walkDir(p, cb);
        } else { cb(p); }
      } catch(_) {}
    }
  }

  function workspaceHTML(projects, meta) {
    var catCounts = {all: projects.length};
    projects.forEach(function(p) {
      catCounts[p.status] = (catCounts[p.status] || 0) + 1;
      catCounts[p.recency] = (catCounts[p.recency] || 0) + 1;
    });

    var statusBar = '<div class="cat-bar-group"><span class="cat-bar-label">状态</span><div class="cat-bar" id="status-bar">' +
      '<button class="cat-pill active" data-filter="all" onclick="setFilter(\'all\')" title="显示所有状态">全部<span class="count">' + projects.length + '</span></button>' +
      '<button class="cat-pill" data-filter="active" onclick="setFilter(\'active\')" title="正在推进的项目">🟢 活跃<span class="count">' + (catCounts.active || 0) + '</span></button>' +
      '<button class="cat-pill" data-filter="archived" onclick="setFilter(\'archived\')" title="已完成或暂停，保留备查">🟡 已归档<span class="count">' + (catCounts.archived || 0) + '</span></button>' +
      '<button class="cat-pill" data-filter="abandoned" onclick="setFilter(\'abandoned\')" title="不再维护的项目">⚫ 已放弃<span class="count">' + (catCounts.abandoned || 0) + '</span></button>' +
      '<button class="cat-pill" data-filter="undefined" onclick="setFilter(\'undefined\')" title="尚未定义状态的项目">⚪ 待定义<span class="count">' + (catCounts.undefined || 0) + '</span></button>' +
      '</div></div>';

    var recencyBar = '<div class="cat-bar-group"><span class="cat-bar-label">时间</span><div class="cat-bar" id="recency-bar">' +
      '<button class="cat-pill" data-filter="all" onclick="setRecencyFilter(\'all\')" title="显示所有时间">全部<span class="count">' + projects.length + '</span></button>' +
      '<button class="cat-pill" data-filter="week" onclick="setRecencyFilter(\'week\')" title="最近7天内有文件修改">⏱ 7天内<span class="count">' + (catCounts.week || 0) + '</span></button>' +
      '<button class="cat-pill" data-filter="halfMonth" onclick="setRecencyFilter(\'halfMonth\')" title="最近15天内有文件修改">📅 15天内<span class="count">' + (catCounts.halfMonth || 0) + '</span></button>' +
      '<button class="cat-pill" data-filter="month" onclick="setRecencyFilter(\'month\')" title="最近30天内有文件修改">🗓 30天内<span class="count">' + (catCounts.month || 0) + '</span></button>' +
      '<button class="cat-pill" data-filter="older" onclick="setRecencyFilter(\'older\')" title="超过30天未修改">🏛 超过30天<span class="count">' + (catCounts.older || 0) + '</span></button>' +
      '</div></div>';

    var cards = projects.map(function(p) {
      var daysText = p.daysAgo === 0 ? '今天' : (p.daysAgo + '天前');
      return '<div class="proj-card" data-status="' + p.status + '" data-recency="' + p.recency + '">' +
        '<div class="card-body">' +
          '<div class="card-mono">' + esc(monogram(p.name)) + '</div>' +
          '<div class="card-info">' +
            '<div class="card-name">' +
              '<span class="status-dot ' + p.statusDot + '"></span>' +
              esc(p.name) +
              '<span class="status-tag tag-' + p.status + '">' + p.statusLabel + '</span>' +
            '</div>' +
            '<div class="card-dir">' + esc(p.dir) + '</div>' +
            (p.description ? '<div class="card-desc">' + esc(p.description) + '</div>' : '<div class="card-desc" style="color:var(--text-muted);font-style:italic">暂无简介 · 添加 .project.json 描述此项目</div>') +
            '<div class="card-meta">' +
              '<span class="recency-badge badge-' + p.recency + '">' + p.recencyLabel + ' · ' + daysText + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="card-actions">' +
          '<button class="btn go" onclick="fetch(\'/workspace/' + encodeURIComponent(meta.id) + '/' + encodeURIComponent(p.dir) + '\')">打开文件夹</button>' +
        '</div>' +
      '</div>';
    }).join('\n');

    return '<style>\n' +
      '.cat-bar-group{display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap}\n' +
      '.cat-bar-label{font-size:11px;font-weight:500;font-family:"Cascadia Code","Consolas","SF Mono",monospace;color:var(--text-muted);letter-spacing:.05em;min-width:32px;flex-shrink:0}\n' +
      '.cat-bar{display:flex;flex-wrap:wrap;gap:6px;flex:1}\n' +
      '.cat-bar .cat-pill{flex:1;min-width:80px;justify-content:center;padding:5px 12px;font-size:12px;font-weight:400;font-family:"Cascadia Code","Consolas","SF Mono",monospace;letter-spacing:.03em;background:var(--paper-tint);border:1px solid var(--border);color:var(--text-secondary);cursor:pointer;transition:all .12s;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}\n' +
      '.cat-bar .cat-pill:hover{background:var(--paper-tint);color:var(--text)}\n' +
      '.proj-grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:12px;margin-top:8px}\n' +
      '.proj-card{background:var(--paper);padding:20px;display:flex;flex-direction:column;gap:6px;transition:transform .15s,box-shadow .15s;box-shadow:var(--shadow-border),var(--shadow-card)}\n' +
      '.proj-card:hover{transform:translateY(-1px);box-shadow:var(--shadow-border),var(--shadow-card-hover)}\n' +
      '.card-body{display:flex;align-items:flex-start;gap:12px;flex:1}\n' +
      '.card-mono{flex-shrink:0;width:40px;height:40px;background:var(--green);color:var(--on-brand);display:flex;align-items:center;justify-content:center;font-family:"Cascadia Code","Consolas","SF Mono",monospace;font-size:13px;font-weight:500}\n' +
      '.card-info{flex:1;min-width:0}\n' +
      '.card-name{font-size:15px;font-weight:400;letter-spacing:-0.01em;line-height:1.4;display:flex;align-items:center;gap:8px;flex-wrap:wrap}\n' +
      '.card-dir{font-size:10px;font-family:"Cascadia Code","Consolas","SF Mono",monospace;color:var(--text-muted);margin-top:1px}\n' +
      '.card-desc{font-size:11px;color:var(--text-secondary);font-weight:300;line-height:1.45;margin-top:6px}\n' +
      '.card-meta{margin-top:4px}\n' +
      '.card-actions{margin-top:4px}\n' +
      '.status-dot{width:7px;height:7px;flex-shrink:0;border-radius:50%}\n' +
      '.status-dot.on{background:var(--status-on);animation:pulse 2s ease-in-out infinite}\n' +
      '.status-dot.warn{background:#D97706}\n' +
      '.status-dot.off{background:var(--status-off)}\n' +
      '.status-dot.none{background:var(--border)}\n' +
      '.status-tag{font-size:10px;padding:1px 6px;font-weight:400;font-family:"Cascadia Code","Consolas","SF Mono",monospace}\n' +
      '.tag-active{color:var(--status-on);background:rgba(26,138,63,.08)}\n' +
      '.tag-archived{color:#D97706;background:rgba(217,119,6,.08)}\n' +
      '.tag-abandoned{color:var(--text-muted);background:rgba(153,153,153,.08)}\n' +
      '.tag-undefined{color:var(--text-muted);background:var(--paper-tint)}\n' +
      '.recency-badge{font-size:10px;padding:1px 6px;font-weight:400}\n' +
      '.badge-week{color:#1A8A3F;background:rgba(26,138,63,.08)}\n' +
      '.badge-halfMonth{color:#8B5CF6;background:rgba(139,92,246,.08)}\n' +
      '.badge-month{color:#D97706;background:rgba(217,119,6,.08)}\n' +
      '.badge-older{color:var(--text-muted);background:var(--paper-tint)}\n' +
      '.back-link{display:inline-block;margin-bottom:20px;font-size:13px;font-weight:300;color:var(--text-secondary);text-decoration:none;border:1px solid var(--border);padding:6px 16px;transition:all .15s}\n' +
      '.back-link:hover{border-color:var(--green);color:var(--green)}\n' +
      '.page h1{font-size:28px;font-weight:200;letter-spacing:-0.02em;color:var(--green);margin-bottom:4px}\n' +
      '.page .ws-subtitle{font-size:13px;color:var(--text-muted);font-weight:300;margin-bottom:20px;font-family:"Cascadia Code","Consolas","SF Mono",monospace}\n' +
    '</style>\n' +
    '<h1>' + esc(meta.name) + '</h1>\n' +
    '<div class="ws-subtitle">' + esc(meta.projectPath) + ' · ' + projects.length + ' 个子项目</div>\n' +
    statusBar + recencyBar +
    '<div class="proj-grid">' + cards + '</div>' +
    '<script>\n' +
    'var currentStatus = "all"; var currentRecency = "all";\n' +
    'function applyFilters() {\n' +
    '  document.querySelectorAll(".proj-card").forEach(function(c) {\n' +
    '    var s = currentStatus === "all" || c.dataset.status === currentStatus;\n' +
    '    var r = currentRecency === "all" || c.dataset.recency === currentRecency;\n' +
    '    c.style.display = (s && r) ? "flex" : "none";\n' +
    '  });\n' +
    '}\n' +
    'function setFilter(t) {\n' +
    '  currentStatus = t;\n' +
    '  document.querySelectorAll("#status-bar .cat-pill").forEach(function(p){p.classList.toggle("active", p.dataset.filter === t);});\n' +
    '  applyFilters();\n' +
    '}\n' +
    'function setRecencyFilter(t) {\n' +
    '  currentRecency = t;\n' +
    '  document.querySelectorAll("#recency-bar .cat-pill").forEach(function(p){p.classList.toggle("active", p.dataset.filter === t);});\n' +
    '  applyFilters();\n' +
    '}' +
    '<\/script>';

    // Also serve /open-dir for workspace subdirs via existing /open-dir route
  }

  // Multi-section info page for tools that have files, not sub-projects
  function toolInfoHTML(meta) {
    var pp = meta.projectPath.replace(/%([^%]+)%/g, function(_, n){ return process.env[n] || '%'+n+'%'; });
    var whitelist = meta.whitelist || [];
    var architecture = meta.architecture || '';

    // ── CSS ──
    var style = '<style>\n' +
      '.info-section{margin-top:36px}\n' +
      '.info-section h2{font-size:18px;font-weight:500;color:var(--text);margin-bottom:12px;padding-top:16px;border-top:1px solid var(--border)}\n' +
      '.sig-table{width:100%;border-collapse:collapse;font-size:13px}\n' +
      '.sig-table th{text-align:left;padding:8px 12px;background:var(--paper-tint);font-weight:500;font-size:12px;font-family:"Cascadia Code","Consolas","SF Mono",monospace;color:var(--text-secondary);border:1px solid var(--border)}\n' +
      '.sig-table td{padding:8px 12px;border:1px solid var(--border);vertical-align:top;line-height:1.6}\n' +
      '.sig-table .sig-symptom{font-weight:500;color:var(--text);font-size:14px}\n' +
      '.sig-table .sig-cause{color:var(--text-secondary);font-size:13px}\n' +
      '.wl-grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));gap:12px;margin-top:8px}\n' +
      '.wl-card{background:var(--paper);padding:20px;box-shadow:var(--shadow-border),var(--shadow-card)}\n' +
      '.wl-card .wl-name{font-size:15px;font-weight:500;margin-bottom:8px}\n' +
      '.wl-card .wl-domains{font-family:"Cascadia Code","Consolas","SF Mono",monospace;font-size:11px;color:var(--text-muted);line-height:1.8;word-break:break-all}\n' +
      '.wl-card .wl-meta{font-size:11px;color:var(--text-muted);margin-top:8px;font-family:"Cascadia Code","Consolas","SF Mono",monospace}\n' +
      '.fix-steps{font-size:14px;line-height:2;color:var(--text-secondary);padding-left:20px}\n' +
      '.fix-steps li{margin-bottom:4px}\n' +
      '.fix-steps code{font-family:"Cascadia Code","Consolas","SF Mono",monospace;font-size:12px;background:var(--paper-tint);padding:1px 5px}\n' +
      '.arch-block{font-family:"Cascadia Code","Consolas","SF Mono",monospace;font-size:12px;line-height:1.8;color:var(--text-secondary);background:var(--paper-tint);padding:16px 20px;white-space:pre-wrap}\n' +
      '.proj-grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));gap:10px;margin-top:8px}\n' +
      '.proj-card{background:var(--paper);padding:16px;display:flex;flex-direction:column;gap:4px;box-shadow:var(--shadow-border),var(--shadow-card)}\n' +
      '.proj-card:hover{transform:translateY(-1px);box-shadow:var(--shadow-border),var(--shadow-card-hover)}\n' +
      '.card-body{display:flex;align-items:flex-start;gap:10px;flex:1}\n' +
      '.card-mono{flex-shrink:0;width:36px;height:36px;background:var(--green);color:var(--on-brand);display:flex;align-items:center;justify-content:center;font-family:"Cascadia Code","Consolas","SF Mono",monospace;font-size:11px;font-weight:500}\n' +
      '.card-info{flex:1;min-width:0}\n' +
      '.card-name{font-size:13px;font-weight:400;line-height:1.4}\n' +
      '.card-dir{font-size:10px;font-family:"Cascadia Code","Consolas","SF Mono",monospace;color:var(--text-muted);margin-top:2px}\n' +
      '.card-actions{margin-top:4px}\n' +
      '.btn{display:inline-block;padding:4px 10px;font-size:11px;font-family:"Cascadia Code","Consolas","SF Mono",monospace;border:1px solid var(--border);background:var(--paper-tint);color:var(--text-secondary);cursor:pointer;text-decoration:none;transition:all .12s}\n' +
      '.btn.go{border-color:var(--green);color:var(--green)}\n' +
      '.btn:hover{background:var(--green);color:var(--on-brand);border-color:var(--green)}\n' +
    '<\/style>\n';

    // ── 1. 故障信号 ──
    var signalsHTML = '<div class="info-section">\n<h2>⚡ 故障信号</h2>\n';
    if (whitelist.length > 0) {
      signalsHTML += '<table class="sig-table"><thead><tr><th style="width:35%">症状</th><th>根因</th></tr></thead><tbody>';
      whitelist.forEach(function(w) {
        signalsHTML += '<tr><td class="sig-symptom">' + esc(w.symptom) + '</td>' +
          '<td class="sig-cause">SakuraCat 推送覆盖了 fake-ip-filter，<code>' + esc(w.domains[0]) + '</code> 等域名 DNS 被劫持到 198.18.0.1/16 假 IP，直连失败</td></tr>';
      });
      signalsHTML += '<tr><td class="sig-symptom" style="color:var(--text-muted)">其他国内服务突然不通</td>' +
        '<td class="sig-cause">同上 —— 查目标域名是否已在下方白名单中，不在就补上</td></tr>';
      signalsHTML += '</tbody></table>';
    } else {
      signalsHTML += '<p style="color:var(--text-muted)">暂无记录。新服务断连后添加到白名单。</p>';
    }
    signalsHTML += '</div>\n';

    // ── 2. 白名单注册表 ──
    var wlHTML = '<div class="info-section">\n<h2>📋 白名单注册表 <span style="font-weight:300;font-size:13px;color:var(--text-muted)">(fake-ip-filter)</span></h2>\n';
    if (whitelist.length > 0) {
      wlHTML += '<div class="wl-grid">';
      whitelist.forEach(function(w) {
        var domainsJoined = w.domains.join(', ');
        wlHTML += '<div class="wl-card">' +
          '<div class="wl-name">' + esc(w.service) + '</div>' +
          '<div class="wl-domains">' + esc(domainsJoined) + '</div>' +
          '<div class="wl-meta">添加于 ' + esc(w.since) + '</div>' +
        '</div>';
      });
      wlHTML += '</div>';
    }
    wlHTML += '<p style="margin-top:12px;font-size:12px;color:var(--text-muted)">新增服务：编辑此工具的 <code>manifest.json</code> → <code>whitelist</code> 数组，追加新条目。下次断连时这里就是检查清单。</p>';
    wlHTML += '</div>\n';

    // ── 3. 修复步骤 ──
    var fixSteps = meta.fix_steps;
    var fixHTML = '<div class="info-section">\n<h2>🔧 修复步骤</h2>\n';
    if (fixSteps && fixSteps.length > 0) {
      fixHTML += '<ol class="fix-steps">';
      fixSteps.forEach(function(s) {
        fixHTML += '<li>' + esc(s.text);
        if (s.code) {
          fixHTML += '<br><pre><code>' + esc(s.code) + '</code></pre>';
        }
        fixHTML += '</li>';
      });
      fixHTML += '</ol>';
    } else {
      fixHTML += '<ol class="fix-steps">' +
        '<li>打开 <code>' + esc(pp) + '\\config.yaml</code>，搜目标域名，不在 <code>fake-ip-filter</code> 中就补上（参考上方白名单的域名列表）</li>' +
        '<li>关 SakuraCat → 删同目录 <code>cache.db</code></li>' +
        '<li>重启 SakuraCat</li>' +
        '<li>验证：<code>nslookup &lt;目标域名&gt; 127.0.0.1</code> 应返回真实 IP 而非 198.18.x.x</li>' +
      '</ol>';
    }
    fixHTML += '</div>\n';

    // ── 3.5. 已知踩坑 ──
    var pitfalls = meta.pitfalls;
    if (pitfalls && pitfalls.length > 0) {
      fixHTML += '<div class="info-section">\n<h2>⚠️ 已知踩坑</h2>\n';
      pitfalls.forEach(function(p) {
        fixHTML += '<div style="margin-bottom:16px">' +
          '<strong style="color:var(--text)">' + esc(p.title) + '</strong>' +
          '<p style="margin:4px 0;font-size:13px;color:var(--text-secondary)">' + esc(p.problem) + '</p>' +
          '<p style="margin:4px 0;font-size:13px;color:var(--text-secondary)">✅ ' + esc(p.fix) + '</p>' +
        '</div>';
      });
      fixHTML += '</div>\n';
    }

    // ── 4. 配置文件 ──
    var filesHTML = '<div class="info-section">\n<h2>🗂 配置文件</h2>\n';
    if (fs.existsSync(pp)) {
      var entries = fs.readdirSync(pp, { withFileTypes: true });
      var dirs = entries.filter(function(e) { return e.isDirectory() && !e.name.startsWith('.'); });
      var fileList = entries.filter(function(e) { return e.isFile(); })
        .map(function(f) { var s = fs.statSync(path.join(pp, f.name)); return { name: f.name, size: s.size, mtime: s.mtime }; })
        .sort(function(a, b) { return b.mtime - a.mtime; });

      var fcards = '';
      dirs.forEach(function(d) {
        fcards += '<div class="proj-card">' +
          '<div class="card-body">' +
            '<div class="card-mono">' + esc(d.name.substring(0, 2).toUpperCase()) + '</div>' +
            '<div class="card-info">' +
              '<div class="card-name">📁 ' + esc(d.name) + '</div>' +
              '<div class="card-dir">' + esc(path.join(pp, d.name)) + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="card-actions">' +
            '<button class="btn go" onclick="fetch(\'/workspace/' + encodeURIComponent(meta.id) + '/' + encodeURIComponent(d.name) + '\').then(function(){location.reload()})">在资源管理器打开</button>' +
          '</div>' +
        '</div>';
      });
      fileList.forEach(function(f) {
        var sizeText = f.size < 1024 ? f.size + ' B' : (f.size < 1048576 ? (f.size / 1024).toFixed(1) + ' KB' : (f.size / 1048576).toFixed(1) + ' MB');
        var daysAgo = Math.floor((Date.now() - f.mtime.getTime()) / 86400000);
        var mtimeText = daysAgo === 0 ? '今天' : daysAgo + '天前';
        var ext = f.name.split('.').pop().toUpperCase().substring(0, 3);
        fcards += '<div class="proj-card">' +
          '<div class="card-body">' +
            '<div class="card-mono">' + esc(ext) + '</div>' +
            '<div class="card-info">' +
              '<div class="card-name">' + esc(f.name) + '</div>' +
              '<div class="card-dir">' + sizeText + ' · ' + mtimeText + '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
      });
      filesHTML += '<div class="proj-grid">' + fcards + '</div>';
    } else {
      filesHTML += '<p style="color:var(--text-muted)">目录不存在: ' + esc(pp) + '</p>';
    }
    filesHTML += '</div>\n';

    // ── 5. 代理架构 ──
    var archHTML = '<div class="info-section">\n<h2>🏗 代理架构</h2>\n';
    if (architecture) {
      archHTML += '<div class="arch-block">' + esc(architecture) + '</div>';
    }
    archHTML += '</div>\n';

    return style +
      '<h1>' + esc(meta.name) + '</h1>' +
      '<div class="ws-subtitle">' + esc(pp) + '</div>' +
      signalsHTML + wlHTML + fixHTML + filesHTML + archHTML;
  }

  // Workspace sub-page
  app.get('/workspace/:id', function(req, res) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    var mfPath = findManifest(req.params.id);
    if (!mfPath) return res.status(404).send('找不到工作区');
    var mf = JSON.parse(read(mfPath));
    if (!mf.projectPath) return res.status(400).send('该工具不是工作区');
    var projects = scanWorkspace(mf.projectPath);
    var body = projects.length > 0 ? workspaceHTML(projects, mf) : toolInfoHTML(mf);
    res.send(pageShell(mf.name, mf.projectPath, body, 'workspace', projects.length + ' 个子项目'));
  });

  // Open workspace sub-directory
  app.get('/workspace/:id/:subdir', function(req, res) {
    var mfPath = findManifest(req.params.id);
    if (!mfPath) return res.status(404).send('not found');
    var mf = JSON.parse(read(mfPath));
    if (!mf.projectPath) return res.status(400).send('not a workspace');
    var dir = path.join(mf.projectPath, req.params.subdir);
    if (!fs.existsSync(dir)) return res.status(404).send('directory not found');
    openFolder(dir);
    res.json({ok:true,opened:dir});
  });

  // Individual skill system-diagram
  app.get('/skills/:name', function(req, res) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    var filePath = safeResolve(LOCAL_SKILLS_DIR, req.params.name, 'references', 'system-diagram.html');
    if (filePath) {
      var html = read(filePath);
      if (html) return res.send(html);
    }
    filePath = safeResolve(SKILLS_DIR, req.params.name, 'references', 'system-diagram.html');
    if (!filePath) return res.status(403).send('forbidden');
    var html2 = read(filePath);
    if (!html2) return res.status(404).send('diagram not found');
    res.send(html2);
  });

  // Serve individual HTML from skill references/
  app.get('/skill-html/:skill/:file', function(req, res) {
    var fp = safeResolve(SKILLS_DIR, req.params.skill, 'references', req.params.file);
    if (!fp || !fs.existsSync(fp)) { fp = safeResolve(LOCAL_SKILLS_DIR, req.params.skill, 'references', req.params.file); }
    if (!fp || !fs.existsSync(fp)) return res.status(404).send('not found');
    res.type('html').send(read(fp));
  });

  // Shared parser: tips and principles use the same markdown frontmatter extraction
  function parseTipFile(filePath) {
    var md = read(filePath);
    if (!md) return null;
    var h1 = md.match(/^#\s+(.+)/m);
    var title = h1 ? h1[1] : path.basename(filePath, '.md');

    // Extract description: frontmatter > first non-heading paragraph > first ## heading
    var desc = '';
    var fmMatch = md.match(/^description:\s*(.+)/m);
    if (fmMatch) {
      desc = fmMatch[1];
    } else {
      // Find first meaningful text line after # title, before any ## heading
      var lines = md.split('\n');
      var pastTitle = false;
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line.startsWith('# ') && !pastTitle) { pastTitle = true; continue; }
        if (!pastTitle) continue;
        if (!line || line.startsWith('#') || line.startsWith('>') || line.startsWith('```') || line.startsWith('---')) continue;
        if (line.startsWith('- ') || line.length < 10) continue;
        // Skip code/English-only lines: require at least one CJK char
        if (!/[一-鿿]/.test(line)) continue;
        if (/[()]/.test(line) && !/[一-鿿]/.test(line)) continue;
        desc = line.replace(/[*_`]/g, '').substring(0, 80);
        break;
      }
    }
    if (!desc) {
      var h2m = md.match(/^##\s+(.+)/m);
      desc = h2m ? h2m[1] : '';
    }

    var fm = tipSchema.parseFrontmatter(md);
    var tipType = fm.type || '';

    return { title: title, desc: desc, body: md, type: tipType };
  }

  // Tips (操作日志)
  if (fs.existsSync(TIPS_DIR)) {
    app.get('/tips', function(req, res) {
      var files = fs.readdirSync(TIPS_DIR).filter(function(f) { return f.endsWith('.md') && f !== 'CONSTITUTION.md' && f !== 'CHECKPOINT.md'; }).sort();
      var items = files.map(function(f) {
        var tip = parseTipFile(path.join(TIPS_DIR, f));
        return tip ? { file: f, title: tip.title, desc: tip.desc, type: tip.type || 'diagnosis' } : null;
      }).filter(Boolean);

      var typeMeta = tipSchema.TIP_TYPE_META;
      var typeLabels = tipSchema.TYPE_LABELS;

      var cats = {};
      items.forEach(function(item) { var t = item.type || 'reference'; cats[t] = (cats[t] || 0) + 1; });

      var allCount = items.length;

      var cardsHtml = items.map(function(item) {
        var words = item.title.replace(/[^一-鿿a-zA-Z]/g, ' ').split(/\s+/).filter(function(w) { return w.length > 0; });
        var mono = words.length >= 2
          ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
          : item.title.substring(0, 2).toUpperCase();
        var tp = item.type || 'reference';
        var invalid = tipSchema.TIP_TYPE_VALUES.indexOf(tp) === -1;
        return '<div class="card-wrap" data-tip="' + item.file + '" data-type="' + tp + '">' +
          '<a href="/tips/' + encodeURIComponent(item.file) + '" target="_blank" class="card">' +
            '<span class="card-grip" draggable="true">⋮⋮</span>' +
            '<div class="card-mono">' + esc(mono) + '</div>' +
            '<div class="card-body">' +
              '<div class="card-name">' + esc(item.title) + '</div>' +
              (item.desc ? '<div class="card-sub">' + esc(item.desc) + '</div>' : '') +
              '<span class="card-type-tag ' + (invalid ? 'tag-invalid' : 'tag-' + tp) + '">' + (typeLabels[tp] || tp) + '</span>' +
            '</div>' +
          '</a>' +
        '</div>';
      }).join('\n');

      var html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>操作日志 · Tips</title>\n' +
        '<link rel="icon" type="image/svg+xml" href="/logo.svg">\n' +
        '<link rel="stylesheet" href="/_tokens.css">\n' +
        '<style>\n' +
        '  *{margin:0;padding:0;box-sizing:border-box}\n' +
        '  body{font-family:var(--font-body);background:var(--paper);color:var(--text);min-height:100vh;font-weight:300;font-size:16px}\n' +
        '  .hero{background:var(--green);color:var(--on-brand);padding:56px 32px 48px}\n' +
        '  .hero-inner{max-width:1080px;margin:0 auto}\n' +
        '  .hero-mono{font-family:"Cascadia Code","Consolas","SF Mono","SF Mono","Consolas",monospace;font-size:10px;font-weight:500;letter-spacing:.08em;opacity:.45;margin-bottom:10px}\n' +
        '  .hero h1{font-size:min(3.6vw,4.4vh);font-weight:200;letter-spacing:-0.02em;line-height:1.15}\n' +
        '  .hero .tagline{font-size:15px;font-weight:300;opacity:.7;margin-top:10px;line-height:1.6;max-width:520px;letter-spacing:-0.01em}\n' +
        '  .content{margin:0 auto;padding:6px 32px 32px}\n' +
        '  .cat-bar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}\n' +
        '  .cat-pill{padding:6px 14px;font-size:12px;font-weight:400;font-family:"Cascadia Code","Consolas","SF Mono","SF Mono","Consolas",monospace;letter-spacing:.03em;background:var(--paper-tint);border:1px solid var(--border);color:var(--text-secondary);cursor:pointer;transition:all .12s;display:inline-flex;align-items:center;gap:6px}\n' +
        '  .cat-pill:hover{background:var(--paper-tint);color:var(--text)}\n' +
        '  .cat-pill.active{background:var(--green);border-color:var(--green);color:var(--on-brand)}\n' +
        '  .cat-pill .count{font-size:10px;opacity:.7}\n' +
        '  .grid{display:flex;flex-wrap:wrap;gap:12px;justify-content:flex-start}\n' +
        '  .card-wrap{flex:0 0 480px;position:relative;user-select:text;-webkit-user-select:text}\n' +
        '  .card-wrap.hidden-card{display:none}\n' +
        '  .card-wrap.dragging{opacity:.35}\n' +
        '  .card-wrap.drag-over::before{content:"";position:absolute;inset:0;border:2px solid var(--green);z-index:2;pointer-events:none}\n' +
        '  .card{display:flex;align-items:flex-start;gap:28px;background:var(--paper);padding:22px 28px;text-decoration:none;color:inherit;transition:background .15s,box-shadow .15s;height:180px;overflow:hidden;border:1px solid var(--border);box-shadow:var(--shadow-card);position:relative}\n' +
        '  .card:hover{background:var(--paper-tint)}\n' +
        '  .card-grip{position:absolute;top:12px;right:12px;color:var(--text-muted);font-family:"Cascadia Code","Consolas","SF Mono","SF Mono","Consolas",monospace;font-size:14px;opacity:.35;line-height:1;cursor:grab;user-select:none;-webkit-user-select:none;z-index:1}\n' +
        '  .card-grip:active{cursor:grabbing}\n' +
        '  .card-mono{flex-shrink:0;width:52px;height:52px;background:var(--green);color:var(--on-brand);display:flex;align-items:center;justify-content:center;font-family:"Cascadia Code","Consolas","SF Mono","SF Mono","Consolas",monospace;font-size:18px;font-weight:500;letter-spacing:.02em;margin-top:2px}\n' +
        '  .card-body{display:flex;flex-direction:column;gap:10px;min-width:0;position:relative}\n' +
        '  .card-name{font-size:18px;font-weight:300;letter-spacing:-0.01em}\n' +
        '  .card-sub{font-size:13px;font-weight:300;color:var(--text-secondary);line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}\n' +
        '  .card-type-tag{position:absolute;bottom:2px;right:0;font-size:9px;font-weight:500;font-family:"Cascadia Code","Consolas","SF Mono","SF Mono","Consolas",monospace;letter-spacing:.04em;padding:2px 6px;opacity:.55}\n' +
        '  .tag-diagnosis{color:var(--green);background:rgba(var(--green-rgb),.08)}\n' +
        '  .tag-method{color:#1A8A3F;background:rgba(26,138,63,.06)}\n' +
        '  .tag-fact{color:var(--text-muted);background:rgba(var(--ink-rgb),.05)}\n' +
        '  .tag-invalid{color:#C0392B;background:rgba(192,57,43,.08)}\n' +
        '  .footer{max-width:1080px;margin:0 auto;padding:36px 32px;border-top:1px solid var(--border)}\n' +
        '  .phil-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1px;background:var(--border);margin-bottom:0}\n' +
        '  .phil-card{background:var(--paper);padding:24px 20px}\n' +
        '  .phil-num{font-family:"Cascadia Code","Consolas","SF Mono","SF Mono","Consolas",monospace;font-size:10px;font-weight:500;color:var(--green);opacity:.45;margin-bottom:10px;letter-spacing:.04em}\n' +
        '  .phil-title{font-size:15px;font-weight:500;color:var(--text);margin-bottom:6px;letter-spacing:-0.01em;line-height:1.4}\n' +
        '  .phil-body{font-size:12px;font-weight:300;color:var(--text-secondary);line-height:1.6}\n' +
        '  .phil-body strong{font-weight:500;color:var(--text)}\n' +
        '</style>\n</head>\n<body>\n' +
        '<div class="hero"><div class="hero-inner"><a href="/" style="color:inherit;text-decoration:none;font-size:13px;font-family:\"Cascadia Code\",\"Consolas\",\"SF Mono\",monospace;opacity:.5;letter-spacing:.04em">← 工具架</a><div class="hero-mono" style="margin-top:10px">OPERATIONS LOG</div><h1>操作日志</h1><div class="tagline">人+AI 共享操作记录。踩坑即记，分类即检索。</div></div></div>\n' +
        '<div class="content">\n' +
        '<div class="cat-bar" id="catBar">' +
          '<button class="cat-pill active" data-type="all" onclick="setTipFilter(\'all\')">全部<span class="count">' + allCount + '</span></button>' +
          Object.keys(typeMeta).map(function(t) {
            if (!cats[t]) return '';
            return '<button class="cat-pill" data-type="' + t + '" onclick="setTipFilter(\'' + t + '\')">' + typeMeta[t].label + '<span class="count">' + (cats[t] || 0) + '</span></button>';
          }).join('') +
        '</div>\n' +
        '<div class="grid">' + cardsHtml + '</div></div>\n' +
        '<div class="footer">\n' +
        '  <div class="phil-grid">\n' +
        '    <div class="phil-card">\n' +
        '      <div class="phil-num">01</div>\n' +
        '      <div class="phil-title">踩坑即记录</div>\n' +
        '      <div class="phil-body">遇到坑立刻写，不等"完美的笔记"。<strong>半成品笔记 > 没写的记录。</strong>文件落盘即上线。</div>\n' +
        '    </div>\n' +
        '    <div class="phil-card">\n' +
        '      <div class="phil-num">02</div>\n' +
        '      <div class="phil-title">分类找得着</div>\n' +
        '      <div class="phil-body">diagnosis / method / fact / capability / feedback 五种类型。<strong>翻不动的那天，就是该分类的那天。</strong></div>\n' +
        '    </div>\n' +
        '    <div class="phil-card">\n' +
        '      <div class="phil-num">03</div>\n' +
        '      <div class="phil-title">人+AI 共享</div>\n' +
        '      <div class="phil-body">人发现坑，人+AI 一起写笔记。<strong>AI 不踩坑，但 AI 擅长结构化复盘。</strong>每个 tip 是互操作产物。</div>\n' +
        '    </div>\n' +
        '    <div class="phil-card">\n' +
        '      <div class="phil-num">04</div>\n' +
        '      <div class="phil-title">单一真相源</div>\n' +
        '      <div class="phil-body"><strong>~/.agentboard/tips/ 是唯一位置。</strong>不重复存 memory，不复制到项目。agentboard 直接渲染。</div>\n' +
        '    </div>\n' +
        '  </div>\n' +
        '</div>\n' +
        '<div style="max-width:1080px;margin:0 auto;padding:0 32px 24px;font-size:11px;opacity:.35;font-family:\"Cascadia Code\",\"Consolas\",\"SF Mono\",monospace">\n' +
        '  <a href="/tips/CONSTITUTION.md" style="color:inherit">写入标准 → CONSTITUTION.md</a>（五问 &middot; 格式 &middot; 分类）\n' +
        '</div>\n' +
        '<script>\n' +
        'var tipFilter="all";\n' +
        'function setTipFilter(t){\n' +
        '  tipFilter=t;\n' +
        '  document.querySelectorAll(".cat-pill").forEach(function(p){p.classList.remove("active");});\n' +
        '  document.querySelectorAll(".cat-pill").forEach(function(p){if(p.dataset.type===tipFilter)p.classList.add("active");});\n' +
        '  document.querySelectorAll(".card-wrap").forEach(function(c){\n' +
        '    if(tipFilter==="all"||c.dataset.type===tipFilter){c.classList.remove("hidden-card");}\n' +
        '    else{c.classList.add("hidden-card");}\n' +
        '  });\n' +
        '}\n' +
        '(function(){\n' +
        '  var grid=document.querySelector(".grid");\n' +
        '  var dragSrc=null;\n' +
        '  var KEY="tips-order";\n' +
        '  var saved=null;\n' +
        '  try{saved=JSON.parse(localStorage[KEY]||"[]");}catch(e){}\n' +
        '  if(saved&&saved.length){\n' +
        '    var cards=[].slice.call(grid.querySelectorAll(".card-wrap"));\n' +
        '    cards.sort(function(a,b){\n' +
        '      var ai=saved.indexOf(a.dataset.tip);\n' +
        '      var bi=saved.indexOf(b.dataset.tip);\n' +
        '      if(ai===-1)return 1;if(bi===-1)return -1;\n' +
        '      return ai-bi;\n' +
        '    });\n' +
        '    cards.forEach(function(c){grid.appendChild(c);});\n' +
        '  }\n' +
        '  function saveOrder(){\n' +
        '    var order=[].slice.call(grid.querySelectorAll(".card-wrap")).map(function(c){return c.dataset.tip;});\n' +
        '    try{localStorage[KEY]=JSON.stringify(order);}catch(e){}\n' +
        '  }\n' +
        '  grid.addEventListener("dragstart",function(e){\n' +
        '    if(!e.target.classList.contains("card-grip")){e.preventDefault();return;}\n' +
        '    var wrap=e.target.closest(".card-wrap");\n' +
        '    if(!wrap)return;\n' +
        '    dragSrc=wrap;\n' +
        '    wrap.classList.add("dragging");\n' +
        '    e.dataTransfer.effectAllowed="move";\n' +
        '  });\n' +
        '  grid.addEventListener("dragend",function(e){\n' +
        '    var wrap=e.target.closest(".card-wrap");\n' +
        '    if(wrap)wrap.classList.remove("dragging");\n' +
        '    dragSrc=null;\n' +
        '    [].slice.call(grid.querySelectorAll(".drag-over")).forEach(function(c){c.classList.remove("drag-over");});\n' +
        '  });\n' +
        '  grid.addEventListener("dragover",function(e){\n' +
        '    e.preventDefault();\n' +
        '    var wrap=e.target.closest(".card-wrap");\n' +
        '    if(!wrap||wrap===dragSrc)return;\n' +
        '    e.dataTransfer.dropEffect="move";\n' +
        '    wrap.classList.add("drag-over");\n' +
        '  });\n' +
        '  grid.addEventListener("dragleave",function(e){\n' +
        '    var wrap=e.target.closest(".card-wrap");\n' +
        '    if(wrap)wrap.classList.remove("drag-over");\n' +
        '  });\n' +
        '  grid.addEventListener("drop",function(e){\n' +
        '    e.preventDefault();\n' +
        '    var wrap=e.target.closest(".card-wrap");\n' +
        '    if(!wrap||wrap===dragSrc)return;\n' +
        '    wrap.classList.remove("drag-over");\n' +
        '    var children=[].slice.call(grid.querySelectorAll(".card-wrap"));\n' +
        '    var si=children.indexOf(dragSrc);\n' +
        '    var di=children.indexOf(wrap);\n' +
        '    if(si<di){grid.insertBefore(dragSrc,wrap.nextSibling);}\n' +
        '    else{grid.insertBefore(dragSrc,wrap);}\n' +
        '    saveOrder();\n' +
        '  });\n' +
        '  document.querySelectorAll(".card").forEach(function(card){\n' +
        '    var sel=false;\n' +
        '    card.addEventListener("mousedown",function(){sel=false;});\n' +
        '    card.addEventListener("mousemove",function(){sel=!!window.getSelection().toString();});\n' +
        '    card.addEventListener("click",function(e){if(sel){e.preventDefault();e.stopPropagation();sel=false;}});\n' +
        '  });\n' +
        '})();\n' +
        '</script>\n</body>\n</html>';
      res.send(html);
    });

    app.get('/tips/:name', function(req, res) {
      var filePath = safeResolve(TIPS_DIR, req.params.name);
      if (!filePath) return res.status(403).send('forbidden');
      var tip = parseTipFile(filePath);
      if (!tip) return res.status(404).send('tip not found');

      var html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>' + tip.title + ' · Tips</title>\n' +
        '<link rel="icon" type="image/svg+xml" href="/logo.svg">\n' +
        '<link rel="stylesheet" href="/_tokens.css">\n' +
        '<style>\n' +
        '  *{margin:0;padding:0;box-sizing:border-box}\n' +
        '  body{font-family:var(--font-body);background:var(--paper);color:var(--text);min-height:100vh;font-weight:300;font-size:16px;line-height:1.7}\n' +
        '  .hero{background:var(--green);color:var(--on-brand);padding:40px 32px 36px}\n' +
        '  .hero-inner{max-width:720px;margin:0 auto}\n' +
        '  .hero a{color:inherit;text-decoration:none;font-size:13px;font-family:"Cascadia Code","Consolas","SF Mono","SF Mono","Consolas",monospace;opacity:.6;letter-spacing:.04em}\n' +
        '  .hero a:hover{opacity:1}\n' +
        '  .hero h1{font-size:min(2.8vw,3.6vh);font-weight:200;letter-spacing:-0.02em;line-height:1.2;margin-top:8px}\n' +
        '  .content{max-width:720px;margin:0 auto;padding:32px}\n' +
        '  .content h2{font-size:20px;font-weight:400;margin:32px 0 10px;color:var(--text);letter-spacing:-0.01em}\n' +
        '  .content h3{font-size:17px;font-weight:400;margin:24px 0 8px;color:var(--text)}\n' +
        '  .content p{margin:8px 0;color:var(--text)}\n' +
        '  .content ul{margin:8px 0;padding-left:24px}\n' +
        '  .content li{margin:4px 0;color:var(--text);font-size:15px}\n' +
        '  .content code{font-family:"Cascadia Code","Consolas","SF Mono","SF Mono","Consolas",monospace;font-size:13px;background:var(--paper-tint);padding:1px 6px}\n' +
        '  .content pre{background:var(--ink);color:var(--on-brand);padding:16px 20px;margin:12px 0;overflow-x:auto;font-size:13px;line-height:1.55}\n' +
        '  .content pre code{background:none;padding:0;color:inherit}\n' +
        '  .content a{color:var(--green);text-decoration:none}\n' +
        '  .content a:hover{text-decoration:underline}\n' +
        '  .content strong{font-weight:500;color:var(--text)}\n' +
        '</style>\n</head>\n<body>\n' +
        '<div class="hero"><div class="hero-inner"><a href="/tips">← 返回列表</a><h1>' + tip.title + '</h1></div></div>\n' +
        '<div class="content">' + renderMarkdown(tip.body) + '</div>\n</body>\n</html>';
      res.send(html);
    });
  }



  // ── Principles ─────────────────────────────────────────────

  function parsePrincipleFile(filePath) {
    var p = parseTipFile(filePath); // same parser: title, type, desc, body
    if (!p) return null;
    var m = p.body.match(/^## 是什么\n+([\s\S]*?)(?=\n## |\n*$)/m);
    var what = '';
    if (m) {
      var para = m[1].split('\n\n')[0].replace(/^#+\s*/gm, '').trim();
      if (para) what = para;
    }
    p.what = what || p.desc;
    return p;
  }

  app.get('/principles', function(req, res) {
    var files = [];
    try {
      files = fs.readdirSync(PRINCIPLES_DIR).filter(function(f) { return f.endsWith('.md') && f !== 'CONSTITUTION.md'; }).sort();
    } catch(_) { files = []; }

    var items = files.map(function(f) {
      var p = parsePrincipleFile(path.join(PRINCIPLES_DIR, f));
      return p ? { file: f, title: p.title, desc: p.desc, type: p.type || 'review' } : null;
    }).filter(Boolean);

    var typeMeta = {
      review: { label: '审查方法', tip: '怎么审查一个方案？' },
      design: { label: '设计原则', tip: '怎么做设计决策？' },
      architecture: { label: '架构决策', tip: '怎么做架构决策？' },
      governance: { label: '治理', tip: '怎么定治理制度？' },
      engineering: { label: '工程', tip: '怎么做工程决策？' },
      communication: { label: '沟通', tip: '怎么协作沟通？' }
    };
    var typeLabels = { review: 'RV', design: 'DS', architecture: 'AR', governance: 'GV', engineering: 'EN', communication: 'CM' };

    var cats = {};
    items.forEach(function(item) { var t = item.type || 'review'; cats[t] = (cats[t] || 0) + 1; });

    var allCount = items.length;

    var cardsHtml = items.map(function(item) {
      var words = item.title.replace(/[^一-鿿a-zA-Z]/g, ' ').split(/\s+/).filter(function(w) { return w.length > 0; });
      var mono = words.length >= 2
        ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
        : item.title.substring(0, 2).toUpperCase();
      var tp = item.type || 'review';
      return '<div class="card-wrap" data-tip="' + item.file + '" data-type="' + tp + '">' +
        '<a href="/principles/' + encodeURIComponent(item.file) + '" target="_blank" class="card">' +
          '<span class="card-grip" draggable="true">⋮⋮</span>' +
          '<div class="card-mono">' + esc(mono) + '</div>' +
          '<div class="card-body">' +
            '<div class="card-name">' + esc(item.title) + '</div>' +
            (item.desc ? '<div class="card-sub">' + esc(item.desc) + '</div>' : '') +
            '<span class="card-type-tag tag-' + tp + '">' + (typeLabels[tp] || tp) + '</span>' +
          '</div>' +
        '</a>' +
      '</div>';
    }).join('\n');

    var html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>原则库 · Principles</title>\n' +
      '<link rel="icon" href="data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#74A63F"/><text x="16" y="22" text-anchor="middle" font-family="Inter,sans-serif" font-size="16" font-weight="600" fill="white">PR</text></svg>') + '">\n' +
      '<link rel="stylesheet" href="/_tokens.css">\n' +
      '<style>\n' +
      '  *{margin:0;padding:0;box-sizing:border-box}\n' +
      '  body{font-family:var(--font-body);background:var(--paper);color:var(--text);min-height:100vh;font-weight:300;font-size:16px}\n' +
      '  .hero{background:var(--green);color:var(--on-brand);padding:56px 32px 48px}\n' +
      '  .hero-inner{max-width:1080px;margin:0 auto}\n' +
      '  .hero-mono{font-family:"Cascadia Code","Consolas","SF Mono",monospace;font-size:10px;font-weight:500;letter-spacing:.08em;opacity:.45;margin-bottom:10px}\n' +
      '  .hero h1{font-size:min(3.6vw,4.4vh);font-weight:200;letter-spacing:-0.02em;line-height:1.15}\n' +
      '  .hero .tagline{font-size:15px;font-weight:300;opacity:.7;margin-top:10px;line-height:1.6;max-width:520px;letter-spacing:-0.01em}\n' +
      '  .content{margin:0 auto;padding:6px 32px 32px}\n' +
      '  .cat-bar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}\n' +
      '  .cat-pill{padding:6px 14px;font-size:12px;font-weight:400;font-family:"Cascadia Code","Consolas","SF Mono",monospace;letter-spacing:.03em;background:var(--paper-tint);border:1px solid var(--border);color:var(--text-secondary);cursor:pointer;transition:all .12s;display:inline-flex;align-items:center;gap:6px}\n' +
      '  .cat-pill:hover{background:var(--paper-tint);color:var(--text)}\n' +
      '  .cat-pill.active{background:var(--green);border-color:var(--green);color:var(--on-brand)}\n' +
      '  .cat-pill .count{font-size:10px;opacity:.7}\n' +
      '  .grid{display:flex;flex-wrap:wrap;gap:12px;justify-content:flex-start}\n' +
      '  .card-wrap{flex:0 0 480px;position:relative;user-select:text;-webkit-user-select:text}\n' +
      '  .card-wrap.hidden-card{display:none}\n' +
      '  .card{display:flex;align-items:flex-start;gap:28px;background:var(--paper);padding:22px 28px;text-decoration:none;color:inherit;transition:background .15s,box-shadow .15s;height:180px;overflow:hidden;border:1px solid var(--border);box-shadow:var(--shadow-card);position:relative}\n' +
      '  .card:hover{background:var(--paper-tint)}\n' +
      '  .card-grip{position:absolute;top:12px;right:12px;color:var(--text-muted);font-family:"Cascadia Code","Consolas","SF Mono",monospace;font-size:14px;opacity:.35;line-height:1;cursor:grab;user-select:none;-webkit-user-select:none;z-index:1}\n' +
      '  .card-grip:active{cursor:grabbing}\n' +
      '  .card-mono{flex-shrink:0;width:52px;height:52px;background:var(--green);color:var(--on-brand);display:flex;align-items:center;justify-content:center;font-family:"Cascadia Code","Consolas","SF Mono",monospace;font-size:18px;font-weight:500;letter-spacing:.02em;margin-top:2px}\n' +
      '  .card-body{display:flex;flex-direction:column;gap:10px;min-width:0;position:relative}\n' +
      '  .card-name{font-size:18px;font-weight:300;letter-spacing:-0.01em}\n' +
      '  .card-sub{font-size:13px;font-weight:300;color:var(--text-secondary);line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}\n' +
      '  .card-type-tag{position:absolute;bottom:2px;right:0;font-size:9px;font-weight:500;font-family:"Cascadia Code","Consolas","SF Mono",monospace;letter-spacing:.04em;padding:2px 6px;opacity:.55}\n' +
      '  .tag-review{color:var(--green);background:rgba(var(--green-rgb),.06)}\n' +
      '  .tag-design{color:#1A8A3F;background:rgba(26,138,63,.06)}\n' +
      '  .tag-architecture{color:var(--green);background:rgba(var(--green-rgb),.08)}\n' +
      '  .tag-governance{color:#1A8A3F;background:rgba(26,138,63,.08)}\n' +
      '  .tag-engineering{color:var(--green);background:rgba(var(--green-rgb),.06)}\n' +
      '  .tag-communication{color:#1A8A3F;background:rgba(26,138,63,.06)}\n' +
      '  .footer{max-width:1080px;margin:0 auto;padding:36px 32px;border-top:1px solid var(--border)}\n' +
      '  .phil-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1px;background:var(--border)}\n' +
      '  .phil-card{background:var(--paper);padding:24px 20px}\n' +
      '  .phil-num{font-family:"Cascadia Code","Consolas","SF Mono",monospace;font-size:10px;font-weight:500;color:var(--green);opacity:.45;margin-bottom:10px;letter-spacing:.04em}\n' +
      '  .phil-title{font-size:15px;font-weight:500;color:var(--text);margin-bottom:6px;letter-spacing:-0.01em;line-height:1.4}\n' +
      '  .phil-body{font-size:12px;font-weight:300;color:var(--text-secondary);line-height:1.6}\n' +
      '  .phil-body strong{font-weight:500;color:var(--text)}\n' +
      '</style>\n</head>\n<body>\n' +
      '<div class="hero"><div class="hero-inner"><a href="/" style="color:inherit;text-decoration:none;font-size:13px;font-family:\"Cascadia Code\",\"Consolas\",\"SF Mono\",monospace;opacity:.5;letter-spacing:.04em">← 工具架</a><div class="hero-mono" style="margin-top:10px">PRINCIPLES</div><h1>原则库</h1><div class="tagline">决策框架，不是踩坑记录。做决定前主动调用，不是出问题后查阅。</div></div></div>\n' +
      '<div class="content">\n' +
      '<div class="cat-bar" id="catBar">' +
        '<button class="cat-pill active" data-type="all" onclick="setTipFilter(\'all\')">全部<span class="count">' + allCount + '</span></button>' +
        Object.keys(typeMeta).map(function(t) {
          if (!cats[t]) return '';
          return '<button class="cat-pill" data-type="' + t + '" onclick="setTipFilter(\'' + t + '\')">' + typeMeta[t].label + '<span class="count">' + (cats[t] || 0) + '</span></button>';
        }).join('') +
      '</div>\n' +
      '<div class="grid">' + cardsHtml + '</div></div>\n' +
      '<div class="footer">\n' +
      '  <div class="phil-grid">\n' +
      '    <div class="phil-card">\n' +
      '      <div class="phil-num">01</div>\n' +
      '      <div class="phil-title">四问入库</div>\n' +
      '      <div class="phil-body">可复现 · 可操作 · 反直觉 · 跨领域。<strong>四条全过才落盘，一条不过就放弃。</strong></div>\n' +
      '    </div>\n' +
      '    <div class="phil-card">\n' +
      '      <div class="phil-num">02</div>\n' +
      '      <div class="phil-title">决策框架，不是鸡汤</div>\n' +
      '      <div class="phil-body">每个原则含具体检查步骤。<strong>不说"保持简单"，说"拆到原子逐条验证"。</strong></div>\n' +
      '    </div>\n' +
      '    <div class="phil-card">\n' +
      '      <div class="phil-num">03</div>\n' +
      '      <div class="phil-title">主动调用，非事后查阅</div>\n' +
      '      <div class="phil-body">Tip 告诉你"别踩这个坑"。<strong>原则告诉你"怎么想到这里有坑"。</strong></div>\n' +
      '    </div>\n' +
      '    <div class="phil-card">\n' +
      '      <div class="phil-num">04</div>\n' +
      '      <div class="phil-title">20条上限</div>\n' +
      '      <div class="phil-body">超过时强制审查：<strong>最弱的淘汰，保证库的锐度。</strong>5条高质量 &gt; 30条标语。</div>\n' +
      '    </div>\n' +
      '  </div>\n' +
      '</div>\n' +
      '<div style="max-width:1080px;margin:0 auto;padding:0 32px 24px;font-size:11px;opacity:.35;font-family:\"Cascadia Code\",\"Consolas\",\"SF Mono\",monospace">\n' +
      '  <a href="/principles/CONSTITUTION.md" style="color:inherit">写入标准 → CONSTITUTION.md</a>（四问 &middot; 格式 &middot; 分类）\n' +
      '</div>\n' +
      '<script>\n' +
      'var tipFilter="all";\n' +
      'function setTipFilter(t){\n' +
      '  tipFilter=t;\n' +
      '  document.querySelectorAll(".cat-pill").forEach(function(p){p.classList.remove("active");});\n' +
      '  document.querySelectorAll(".cat-pill").forEach(function(p){if(p.dataset.type===tipFilter)p.classList.add("active");});\n' +
      '  document.querySelectorAll(".card-wrap").forEach(function(c){\n' +
      '    if(tipFilter==="all"||c.dataset.type===tipFilter){c.classList.remove("hidden-card");}\n' +
      '    else{c.classList.add("hidden-card");}\n' +
      '  });\n' +
      '}\n' +
      '</script>\n</body>\n</html>';
    res.send(html);
  });

  app.get('/principles/:name', function(req, res) {
    var filePath = safeResolve(PRINCIPLES_DIR, req.params.name);
    if (!filePath) return res.status(403).send('forbidden');
    var p = parsePrincipleFile(filePath);
    if (!p) return res.status(404).send('principle not found');

    var html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>' + p.title + ' · Principles</title>\n' +
      '<link rel="icon" href="data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#74A63F"/><text x="16" y="22" text-anchor="middle" font-family="Inter,sans-serif" font-size="16" font-weight="600" fill="white">PR</text></svg>') + '">\n' +
      '<link rel="stylesheet" href="/_tokens.css">\n' +
      '<style>\n' +
      '  *{margin:0;padding:0;box-sizing:border-box}\n' +
      '  body{font-family:var(--font-body);background:var(--paper);color:var(--text);min-height:100vh;font-weight:300;font-size:16px;line-height:1.7}\n' +
      '  .hero{background:var(--green);color:var(--on-brand);padding:40px 32px 36px}\n' +
      '  .hero-inner{max-width:720px;margin:0 auto}\n' +
      '  .hero a{color:inherit;text-decoration:none;font-size:13px;font-family:"Cascadia Code","Consolas","SF Mono",monospace;opacity:.6;letter-spacing:.04em}\n' +
      '  .hero a:hover{opacity:1}\n' +
      '  .hero h1{font-size:min(2.8vw,3.6vh);font-weight:200;letter-spacing:-0.02em;line-height:1.2;margin-top:8px}\n' +
      '  .content{max-width:720px;margin:0 auto;padding:32px}\n' +
      '  .content h2{font-size:20px;font-weight:400;margin:32px 0 10px;color:var(--text);letter-spacing:-0.01em}\n' +
      '  .content h3{font-size:17px;font-weight:400;margin:24px 0 8px;color:var(--text)}\n' +
      '  .content p{margin:8px 0;color:var(--text)}\n' +
      '  .content ul{margin:8px 0;padding-left:24px}\n' +
      '  .content li{margin:4px 0;color:var(--text);font-size:15px}\n' +
      '  .content code{font-family:"Cascadia Code","Consolas","SF Mono",monospace;font-size:13px;background:var(--paper-tint);padding:1px 6px}\n' +
      '  .content pre{background:var(--ink);color:var(--on-brand);padding:16px 20px;margin:12px 0;overflow-x:auto;font-size:13px;line-height:1.55}\n' +
      '  .content pre code{background:none;padding:0;color:inherit}\n' +
      '  .content a{color:var(--green);text-decoration:none}\n' +
      '  .content a:hover{text-decoration:underline}\n' +
      '  .content strong{font-weight:500;color:var(--text)}\n' +
      '</style>\n</head>\n<body>\n' +
      '<div class="hero"><div class="hero-inner"><a href="/principles">← 返回列表</a><h1>' + p.title + '</h1></div></div>\n' +
      '<div class="content">' + renderMarkdown(p.body) + '</div>\n</body>\n</html>';
    res.send(html);
  });



  app.get('/api/stats', function(req, res) {
    var now = new Date();
    var today = now.toISOString().slice(0, 10);

    // aggregates
    var total = apiLog.length;
    var byCaller = { agent: 0, browser: 0, unknown: 0 };
    var byAction = { list: 0, detail: 0, control: 0, admin: 0 };
    var byTool = {}; // { toolId: calls }
    var todayByCaller = { agent: 0, browser: 0, unknown: 0 };
    var todayByAction = { list: 0, detail: 0, control: 0, admin: 0 };
    var todayCount = 0;

    for (var i = 0; i < apiLog.length; i++) {
      var e = apiLog[i];
      var c = e.caller || 'unknown';
      var a = e.action || 'admin';
      if (byCaller.hasOwnProperty(c)) byCaller[c]++; else byCaller[c] = 1;
      byAction[a] = (byAction[a]||0) + 1;
      if (e.target) byTool[e.target] = (byTool[e.target]||0) + 1;

      if ((e.ts||'').slice(0,10) === today) {
        todayCount++;
        if (todayByCaller.hasOwnProperty(c)) todayByCaller[c]++; else todayByCaller[c] = 1;
        todayByAction[a] = (todayByAction[a]||0) + 1;
      }
    }

    // sort tools by call count desc, top 10
    var toolRank = Object.keys(byTool).sort(function(a,b){ return byTool[b] - byTool[a]; }).slice(0,10).map(function(k){ return { id: k, calls: byTool[k] }; });

    res.json({
      ok: true,
      since: apiLog.length ? apiLog[0].ts : null,
      totalCalls: total,
      todayCalls: todayCount,
      byCaller: { all: byCaller, today: todayByCaller },
      byAction: { all: byAction, today: todayByAction },
      byTool: toolRank,
      // backward compat
      byEndpoint: apiCounts
    });
  });

  // Registry page: tabs for startup items + static docs
  app.get('/registry', function(req, res) {
    // --- Startup items ---
    var toolLookup = {};
    try {
      var allTools = scanTools();
      allTools.forEach(function(t) {
        var key = t.id.toLowerCase().replace(/[^a-z0-9]/g, '');
        toolLookup[key] = { name: t.name, desc: (t.description || '').split('【')[0].trim() };
      });
    } catch(_) {}
    var manualMeta = {
      'agentboard':       { name: 'Agentboard 服务',  desc: '工具架后台服务 (端口 3099)', group: '核心服务' },
      'start-agentboard': { name: 'Agentboard 启动器', desc: '开机时启动工具架服务', group: '核心服务' },
      'claude-startup':   { name: 'Claude 自启动',    desc: '启动 Claude Code 终端', group: '核心服务' },
      'lark-channel-bridge': { name: '飞书通道桥接',  desc: '飞书消息 ↔ Agent 双向桥接', group: '通道' },
      'launch':           { name: 'Agentboard 启动器', desc: 'Agentboard 备用启动脚本', group: '核心服务' },
      'Snap':             { name: 'Snap 截图',         desc: '截图小工具', group: '工具' },
      'Snipaste':         { name: 'Snipaste',          desc: '截图贴图工具', group: '工具' },
      'paseo-daemon':     { name: 'Paseo 远程Agent编排', desc: '手机遥控桌面 Claude Code 的 Agent 编排服务 (:6767)', group: '核心服务' },
      'tailscale-ensure': { name: 'Tailscale 组网隧道', desc: 'WireGuard 加密组网，手机和桌面在同一虚拟局域网', group: '核心服务' }
    };
    var groupOrder = { '核心服务': 0, '通道': 1, 'Agent': 2, '工具': 3, '其他': 9 };
    var startupDir = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    var items = [];
    try {
      var files = fs.readdirSync(startupDir);
      files.forEach(function(f) {
        if (f === 'desktop.ini') return;
        var fp = path.join(startupDir, f);
        var stat = fs.statSync(fp);
        var rawName = f.replace(/\.(lnk|bat|vbs|ps1|cmd)$/i, '');
        var key = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
        var meta = manualMeta[rawName] || toolLookup[key] || null;
        var group = (meta && meta.group) ? meta.group : '其他';
        items.push({
          name: rawName,
          displayName: (meta && meta.name) ? meta.name : rawName,
          desc: (meta && meta.desc) ? meta.desc : '',
          group: group,
          file: f, path: fp, source: '启动文件夹', size: stat.size, mtime: stat.mtime.toISOString()
        });
      });
    } catch(_) {}
    try {
      var abs = ['.bat', '.vbs', '.ps1'];
      var agentFiles = fs.readdirSync(PROJECT_DIR).filter(function(f) { return abs.indexOf(path.extname(f).toLowerCase()) !== -1; });
      agentFiles.forEach(function(f) {
        var fp = path.join(PROJECT_DIR, f);
        var stat = fs.statSync(fp);
        var rawName = f.replace(/\.(bat|vbs|ps1)$/i, '');
        var key = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
        var meta = manualMeta[rawName] || toolLookup[key] || null;
        var group = (meta && meta.group) ? meta.group : '其他';
        items.push({
          name: rawName,
          displayName: (meta && meta.name) ? meta.name : rawName,
          desc: (meta && meta.desc) ? meta.desc : '',
          group: group,
          file: f, path: fp, source: 'Agentboard', size: stat.size, mtime: stat.mtime.toISOString()
        });
      });
    } catch(_) {}
    items.sort(function(a, b) {
      var ga = groupOrder[a.group] != null ? groupOrder[a.group] : 9;
      var gb = groupOrder[b.group] != null ? groupOrder[b.group] : 9;
      if (ga !== gb) return ga - gb;
      return a.displayName.localeCompare(b.displayName, 'zh-CN');
    });
    var startupRows = items.map(function(item) {
      var ext = path.extname(item.file).toLowerCase();
      var typeLabel = ext === '.lnk' ? '快捷方式' : ext === '.bat' ? '批处理' : ext === '.vbs' ? 'VBScript' : ext === '.ps1' ? 'PowerShell' : ext === '.cmd' ? 'CMD' : '文件';
      var descCell = item.desc ? '<td style="font-size:11px;color:var(--text-muted);max-width:280px">' + esc(item.desc) + '</td>' : '<td></td>';
      return '<tr><td><strong>' + esc(item.displayName) + '</strong><br><span style="font-size:10px;color:var(--text-muted)">' + esc(item.name) + '</span></td>' + descCell + '<td><code>' + typeLabel + '</code></td><td style="font-size:11px;color:var(--text-muted)">' + esc(item.source) + '</td><td style="font-family:"Cascadia Code","Consolas","SF Mono",monospace;font-size:11px">' + esc(item.file) + '</td></tr>';
    }).join('');
    var startupHtml = '<p class="sub">开机自启动的应用和脚本。添加：把 .bat/.vbs 快捷方式放入 <code>Startup</code> 文件夹。Agentboard 启动脚本放 <code>~/.agentboard/</code>。</p>' +
      (items.length ? '<table><tr><th>名称</th><th>简介</th><th>类型</th><th>来源</th><th>文件</th></tr>' + startupRows + '</table>' : '<p>暂无启动项</p>');

    // --- Static docs ---
    var designMd = read(path.join(PROJECT_DIR, 'archive', 'design-spec.md')) || '';
    var repoMd = read(path.join(PROJECT_DIR, 'archive', 'repo-spec.md')) || '';

    var tabs = [
      { id: 'startup', label: '自启动', meta: items.length + '项' },
      { id: 'design', label: '设计规范', meta: (designMd ? designMd.split('\n').length + '行' : '缺失') },
      { id: 'repo', label: '工程规范', meta: (repoMd ? repoMd.split('\n').length + '行' : '缺失') }
    ];

    var body = '<style>.tabs{display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:24px}.tab-btn{padding:10px 20px;font-size:13px;font-family:inherit;background:none;border:none;border-bottom:2px solid transparent;margin-bottom:-2px;cursor:pointer;color:var(--text-muted);transition:color .15s,border-color .15s}.tab-btn:hover{color:var(--text)}.tab-btn.active{color:var(--green);border-bottom-color:var(--green);font-weight:500}.tab-btn .badge{font-size:10px;margin-left:6px;padding:1px 6px;border-radius:10px;background:var(--paper-tint);color:var(--text-muted)}.tab-btn.active .badge{background:rgba(var(--green-rgb),0.1);color:var(--green)}.tab-panel{display:none}.tab-panel.active{display:block}</style>\n' +
      '<div class="tabs">' + tabs.map(function(t, i) {
        return '<button class="tab-btn' + (i === 0 ? ' active' : '') + '" onclick="switchTab(\'' + t.id + '\',this)">' + esc(t.label) + '<span class="badge">' + t.meta + '</span></button>';
      }).join('') + '</div>\n' +
      '<div class="tab-panel active" id="tab-startup">' + startupHtml + '</div>\n' +
      '<div class="tab-panel" id="tab-design">' + (designMd ? '<div class="line-count">' + designMd.split('\n').length + ' 行</div>' + renderMarkdown(designMd) : '<p>design-spec.md 缺失</p>') + '</div>\n' +
      '<div class="tab-panel" id="tab-repo">' + (repoMd ? '<div class="line-count">' + repoMd.split('\n').length + ' 行</div>' + renderMarkdown(repoMd) : '<p>repo-spec.md 缺失</p>') + '</div>\n' +
      '<script>function switchTab(id,btn){document.querySelectorAll(".tab-btn").forEach(function(b){b.classList.remove("active")});btn.classList.add("active");document.querySelectorAll(".tab-panel").forEach(function(p){p.classList.remove("active")});document.getElementById("tab-"+id).classList.add("active");window.location.hash=id}</script>\n' +
      '<script>var h=window.location.hash.replace("#","");if(h){var b=document.querySelector(".tab-btn[onclick*=\'"+h+"\']");if(b)switchTab(h,b)}</script>';

    var full = pageShell('注册表', '注册表', body, 'registry', null);
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.type('html').send(full);
  });

  function pageShell(title, heading, body, active, lines) {
    var lineHtml = lines != null ? '<div class="line-count">' + lines + ' 行</div>\n' : '';
    return '<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\">\n<title>' + esc(title) + ' · Agentboard</title>\n<link rel=\"icon\" type=\"image/svg+xml\" href=\"/logo.svg\">\n<link rel=\"stylesheet\" href=\"/_tokens.css\">\n<style>\n*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{min-height:100vh;font-weight:300}.header{background:var(--green);padding:14px 32px;display:flex;align-items:center;gap:24px}.header-brand{font-family:\'Cascadia Code\',\'Consolas\',\'SF Mono\',monospace;font-size:12px;font-weight:500;letter-spacing:.06em;color:var(--on-brand);text-decoration:none;white-space:nowrap;opacity:.9}.header-back{font-family:\'Cascadia Code\',\'Consolas\',\'SF Mono\',monospace;font-size:11px;font-weight:400;color:var(--on-brand);text-decoration:none;opacity:.7;margin-left:auto;transition:opacity .15s}.header-back:hover{opacity:1}.page{max-width:1080px;margin:0 auto;padding:40px 32px 80px}.page h1{font-size:28px;font-weight:200;letter-spacing:-0.02em;color:var(--green);margin-bottom:24px}.page h2{font-size:18px;font-weight:500;color:var(--text);margin:36px 0 12px;padding-top:16px;border-top:1px solid var(--border)}.page h3{font-size:15px;font-weight:500;color:var(--text);margin:24px 0 8px}.page p,.page li{font-size:14px;line-height:1.8;color:var(--text-secondary);margin:6px 0}.page ul,.page ol{padding-left:20px;margin:8px 0}.page strong{font-weight:500;color:var(--text)}.page code{font-family:\'Cascadia Code\',\'Consolas\',\'SF Mono\',monospace;font-size:12px;background:var(--paper-tint);padding:1px 5px}.page pre{background:var(--paper-tint);padding:16px;overflow-x:auto;font-size:12px;line-height:1.6;margin:12px 0}.page pre code{background:none;padding:0}.page table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}.page th,.page td{padding:8px 12px;border:1px solid var(--border);text-align:left;font-size:13px}.page th{background:var(--paper-tint);font-weight:500;font-size:12px}.page blockquote{border-left:3px solid var(--green);margin:12px 0;padding:4px 16px;color:var(--text-secondary);font-size:13px}.page hr{border:none;border-top:1px solid var(--border);margin:24px 0}.page em{color:var(--text-secondary)}.line-count{font-size:11px;color:var(--text-muted);margin-bottom:20px;font-family:\'Cascadia Code\',\'Consolas\',\'SF Mono\',monospace}.back-link{display:inline-block;margin-top:40px;font-size:13px;color:var(--green);text-decoration:none;border:1px solid var(--border);padding:6px 16px}.back-link:hover{border-color:var(--green)}\n</style>\n</head>\n<body>\n<div class=\"header\"><a class=\"header-brand\" href=\"/\">AGENTBOARD</a><a class=\"header-back\" href=\"/\">&#8592; 返回工具架</a></div>\n<div class=\"page\">' + lineHtml + body + '\n</div>\n</body>\n</html>';
  }

  app.get('/health', function(req, res) {
    var h = getHealth();
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(h);
  });

  // Loop联邦巡检 — aggregate health from inspector projects + scheduler + agentboard
  app.get('/api/loop/health', function(req, res) {
    var projectsDir = path.join(os.homedir(), '.inspector', '_runtime', 'projects');
    var schedulerStatePath = path.join(os.homedir(), '.scheduler', 'data', 'scheduler-state.json');
    var projects = [];

    // Inspector project results
    try {
      var files = fs.readdirSync(projectsDir).filter(function(f) { return f.endsWith('.json'); });
      files.forEach(function(f) {
        try {
          var d = JSON.parse(fs.readFileSync(path.join(projectsDir, f), 'utf8'));
          projects.push({ id: d.project || f.replace('.json', ''), bone: d.bone || false, ok: d.ok,
            score: d.score || '', ts: d.ts, checks: (d.checks || []).map(function(c) {
              return { id: c.id, label: c.label, pass: c.pass };
            }) });
        } catch(_) {}
      });
    } catch(_) {}

    // Agentboard self-health (live — overwrite inspector's stale snapshot if exists)
    var abHealth = getHealth();
    var abIdx = -1;
    for (var pi = 0; pi < projects.length; pi++) {
      if (projects[pi].id === 'agentboard') { abIdx = pi; break; }
    }
    var abEntry = { id: 'agentboard', bone: true, ok: abHealth.status === 'ok',
      uptime: abHealth.uptime, crashes24h: abHealth.crashes24h };
    if (abIdx >= 0) projects[abIdx] = abEntry;
    else projects.push(abEntry);

    // Scheduler job health summary
    try {
      var ss = JSON.parse(fs.readFileSync(schedulerStatePath, 'utf8'));
      var tasks = ss.tasks || {};
      var jobSummary = { id: 'scheduler-jobs', bone: true, jobs: {} };
      var ok = true;
      Object.keys(tasks).forEach(function(jid) {
        var t = tasks[jid];
        var status = t.lastStatus || 'pending';
        if (status === 'error' || status === 'fatal_error') ok = false;
        jobSummary.jobs[jid] = { status: status, lastRun: t.lastRun || null, consecutiveErrors: t.consecutiveErrors || 0 };
      });
      jobSummary.ok = ok;
      projects.push(jobSummary);
    } catch(_) {}

    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({ projects: projects, updated: new Date().toISOString() });
  });

  // 治理审计三合一 — schema(manifest 契约) + brand(vivi 黄绿白) + tree(三树一致性)
  // schema 段并入 auditRuntime(孤儿目录/startCommand 可执行文件/projectPath 存在性)——删了 manifest 或启动文件必须可见，不允许静默漏报
  app.get('/api/audit', async function(req, res) {
    var schemaRes = schemaDef.auditAll();
    var runtimeRes;
    try { runtimeRes = schemaDef.auditRuntime(); } catch (e) { runtimeRes = { issues: [{ id: 'audit-runtime', name: '运行时漂移检查', errors: ['运行时检查失败: ' + e.message], warnings: [] }] }; }
    var brandRes, treeRes;
    try { brandRes = await brandAudit.auditBrand(); } catch (e) { brandRes = { ok: false, error: e.message }; }
    try { treeRes = await treeAudit.auditTree(); } catch (e) { treeRes = { ok: false, error: e.message }; }

    var items = schemaRes.items.slice();
    var byId = {};
    items.forEach(function(it) { byId[it.id] = it; });
    (runtimeRes.issues || []).forEach(function(ri) {
      var it = byId[ri.id];
      if (it) {
        ri.errors.forEach(function(er) { if (it.errors.indexOf(er) < 0) it.errors.push(er); });
        ri.warnings.forEach(function(w) { if (it.warnings.indexOf(w) < 0) it.warnings.push(w); });
      } else {
        var nu = { id: ri.id, name: ri.name, errors: ri.errors.slice(), warnings: ri.warnings.slice() };
        byId[ri.id] = nu;
        items.push(nu);
      }
    });
    var totalErrors = 0, totalWarnings = 0;
    items.forEach(function(it) { totalErrors += it.errors.length; totalWarnings += it.warnings.length; });

    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({
      updated: new Date().toISOString(),
      schema: {
        ok: totalErrors === 0,
        total: items.length,
        errors: totalErrors,
        warnings: totalWarnings,
        issues: items.filter(function(it) { return it.errors.length > 0 || it.warnings.length > 0; }),
        items: items
      },
      brand: brandRes,
      tree: treeRes
    });
  });

}

module.exports = registerRoutes;

// static.js — home route + static serve (web/)
var fs = require('fs');
var os = require('os');
var path = require('path');
var express = require('express');

function registerStatic(app, ctx) {
  var { read, PROJECT_DIR, apiLog, listDirs, TOOLS_DIR, SKILLS_DIR, BUILTIN_COMMANDS, TIPS_DIR, PRINCIPLES_DIR } = ctx;

  app.get('/', function(req, res) {
    var html = read(path.join(PROJECT_DIR, 'web', 'index.html'));
    if (!html) return res.status(500).send('index.html missing');
    var now = new Date();
    var today = now.toISOString().slice(0, 10);
    var tc = { agent: 0, browser: 0, unknown: 0 };
    var ta = { list: 0, detail: 0, control: 0, admin: 0 };
    var tdy = 0;
    for (var i = 0; i < apiLog.length; i++) {
      var e = apiLog[i];
      if ((e.ts||'').slice(0,10) === today) {
        tdy++;
        if (tc.hasOwnProperty(e.caller)) tc[e.caller]++; else tc[e.caller] = 1;
        ta[e.action] = (ta[e.action]||0) + 1;
      }
    }
    var assetToolCount = listDirs(TOOLS_DIR).length;
    var assetSkillCount = fs.existsSync(SKILLS_DIR) ? listDirs(SKILLS_DIR).length : 0;
    var assetCommandCount = BUILTIN_COMMANDS.length;
    var assetTipCount = fs.existsSync(TIPS_DIR) ? fs.readdirSync(TIPS_DIR).filter(function(f){ return f.endsWith('.md'); }).length : 0;
    var assetPrincipleCount = fs.existsSync(PRINCIPLES_DIR) ? fs.readdirSync(PRINCIPLES_DIR).filter(function(f){ return f.endsWith('.md') && f !== 'CONSTITUTION.md'; }).length : 0;
    var apiEndpoints = 0;
    try { app._router.stack.forEach(function(r){ if (r.route && r.route.path && r.route.path.indexOf('/api/') === 0) apiEndpoints++; }); } catch(_) {}
    var cronTasks = (function(){
      try { var schedSt = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.scheduler', 'scheduler-state.json'), 'utf8')); return Object.keys(schedSt.tasks || {}).length; } catch(_) { return 0; }
    })();
    var snap = JSON.stringify({
      todayCalls: tdy,
      byCaller: { agent: tc.agent||0, browser: tc.browser||0, unknown: tc.unknown||0 },
      byAction: { list: ta.list||0, control: (ta.control||0)+(ta.detail||0), admin: ta.admin||0 },
      assets: { tools: assetToolCount, skills: assetSkillCount, commands: assetCommandCount, tips: assetTipCount, principles: assetPrincipleCount, api: apiEndpoints, cron: cronTasks, registry: 1 }
    });
    html = html.replace('<!--STATS_SNAPSHOT-->', '<script>window.__stats=' + snap + '</script>');
    res.type('html').send(html);
  });

  app.use(express.static(path.join(PROJECT_DIR, 'web')));

  // 只读代理 vivi skill 文档（http 页面禁跳 file://，且说明书有 ../assets 相对资源，需目录级挂载）
  app.use('/skill-docs/vivi', express.static(path.join(os.homedir(), '.claude', 'skills', 'vivi-design-system')));
}

module.exports = registerStatic;

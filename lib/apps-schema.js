// lib/apps-schema.js — apps/ 注册表字段标准唯一真相源
// 被 routes.js (/api/apps 写入校验) + web/_script.js (表单渲染) 共享。
// 表单字段集 = APP_FIELDS，dashboard 表单从 /api/apps/schema 派生渲染，禁止前端手写字段副本。
// 对齐 apps/CONSTITUTION.md §二 字段表。

// ── 表单字段契约（唯一真相源：dashboard 表单从这里渲染，禁止手写副本） ──
// formOnly=true：只出现在表单，不落盘（domain 派生 id/url）
// custom=true：select 额外渲染「自定义…」选项 + 隐藏输入框（值写入该字段）
// dynamic=true：options 由前端运行时填充（devTool 从 /api/tools 拉工具 id）
// 不在表单里的持久化字段：order（拖拽排序写，不手填）、localDev（旧数据兼容，新卡用 devTool 派生）
var APP_FIELDS = [
  { key: 'name', label: '名称', type: 'text', required: true, placeholder: '例：版式画廊' },
  { key: 'domain', label: '域名', type: 'text', required: true, placeholder: '例：gallery.evopearl.com', formOnly: true },
  { key: 'description', label: '描述', type: 'textarea', required: true, placeholder: '一句话说明这个站', rows: 2 },
  { key: 'host', label: '托管', type: 'select', required: true, options: ['腾讯云 DNSPod → Vercel', 'Cloudflare → Vercel', 'Vercel（直连）'], custom: true, customPlaceholder: '输入托管链路（如：阿里云 → Netlify）' },
  { key: 'devTool', label: '本地开发服务', type: 'select', options: [], dynamic: true, placeholder: '本地开发地址从所选工具卡端口派生' },
  { key: 'agentNote', label: 'Agent 笔记', type: 'textarea', placeholder: '给 AI agent 的使用注意事项', rows: 2 }
];

// 必填字段（持久化契约，从 APP_FIELDS 派生，永不与表单漂移）
var APP_REQUIRED = APP_FIELDS
  .filter(function (f) { return f.required && !f.formOnly; })
  .map(function (f) { return f.key; });

// 可选字段（表单可写 + agent 可扩展；endpoints/logo 通常 agent 维护）
// order 由拖拽写（/api/apps/reorder），不手填；localDev 保留兼容旧卡，新卡用 devTool 从工具卡派生
var APP_OPTIONAL = ['status', 'localDev', 'devTool', 'endpoints', 'agentNote', 'order', 'logo'];

// ── 单条校验（未知字段不拦——agent 可自由扩展，校验只管必填 + 已知枚举） ──

function validateApp(app) {
  var errors = [];
  var warnings = [];
  if (!app || typeof app !== 'object') {
    return { ok: false, errors: ['app is not an object'], warnings: [], fields: app || {} };
  }

  APP_REQUIRED.forEach(function (k) {
    var v = app[k];
    if (v === undefined || v === null || String(v).trim() === '') {
      errors.push('缺少必填字段 ' + k);
    }
  });

  if (app.status !== undefined && app.status !== 'live' && app.status !== 'down') {
    warnings.push('status 建议为 live|down: "' + app.status + '"');
  }
  if (app.order !== undefined && (typeof app.order !== 'number' || app.order < 0)) {
    warnings.push('order 建议为非负整数: ' + app.order);
  }

  return { ok: errors.length === 0, errors: errors, warnings: warnings, fields: app };
}

module.exports = {
  APP_FIELDS: APP_FIELDS,
  APP_REQUIRED: APP_REQUIRED,
  APP_OPTIONAL: APP_OPTIONAL,
  validateApp: validateApp
};

// timer-dashboard: pure cron task scheduler UI
// CJS module. Returns full HTML page.
// API: GET/POST /api/cron/tasks, PUT/DELETE /api/cron/tasks/:id, POST /api/cron/tasks/:id/run

function render() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>定时任务</title>
<style>
:root{
  --bg:#faf5f0; --card:#fff; --border:#e8e6e0;
  --accent:#b8804a; --accent-hover:#c9955e;
  --text:#2d2b28; --text2:#808087; --text3:#a1a1aa;
  --on:#00b894; --off:#d8c3ad; --fail:#e17055; --running:#0984e3;
  --font:system-ui,-apple-system,"Noto Sans SC",sans-serif;
  --mono:"JetBrains Mono","Consolas",monospace;
  font-family:var(--font); color:var(--text); background:var(--bg)
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;display:flex;flex-direction:column}
/* header */
.hd{padding:18px 24px 14px;background:var(--card);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.hd-left h1{font-size:20px;font-weight:500;letter-spacing:.02em}
.hd-left p{font-size:11px;color:var(--text3);margin-top:2px}
.hd-right{display:flex;align-items:center;gap:12px}
.hd-stat{font-size:11px;color:var(--text3)}
.hd-stat b{font-weight:500;color:var(--text)}
.btn-add{padding:7px 16px;background:var(--accent);color:#fff;border:none;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
.btn-add:hover{background:var(--accent-hover)}
/* main */
.main{flex:1;display:flex;max-width:1100px;margin:0 auto;width:100%}
.panel-l{width:340px;flex-shrink:0;border-right:1px solid var(--border)}
.panel-r{flex:1;min-width:0}
.panel-head{padding:12px 18px 8px;font-size:11px;font-weight:500;color:var(--text2);letter-spacing:.04em;text-transform:uppercase;border-bottom:1px solid var(--border)}
.task-list{overflow-y:auto;padding:4px 8px;flex:1}
/* card */
.card{padding:12px 14px;margin:3px 0;border-radius:6px;cursor:pointer;background:var(--card);border:1px solid transparent;transition:all .1s}
.card:hover{border-color:var(--border)}
.card.sel{border-color:var(--accent)}
.card-row{display:flex;align-items:flex-start;gap:8px}
.card-icon{font-size:16px;flex-shrink:0;width:30px;text-align:center}
.card-body{flex:1;min-width:0}
.card-name{font-size:13px;font-weight:500;line-height:1.3;word-break:break-word}
.card-sub{font-size:10px;color:var(--text3);margin-top:2px}
.card-sub .time{color:var(--text2)}
.tag{display:inline-block;padding:1px 7px;border-radius:9px;font-size:9px;margin-top:3px}
.tag-on{background:#e6f7f0;color:var(--on)}
.tag-off{background:var(--bg);color:var(--text3)}
.tag-fail{background:#fff3e0;color:var(--fail)}
/* empty */
.empty{padding:40px 20px;text-align:center;color:var(--text3)}
.empty-icon{font-size:32px;opacity:.3;margin-bottom:8px}
.empty-title{font-size:13px}
.empty-desc{font-size:11px;margin-top:4px}
/* right panel */
.detail{padding:24px 28px;overflow-y:auto;flex:1}
.detail-top{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;gap:12px;flex-wrap:wrap}
.detail-name{font-size:20px;font-weight:500}
.detail-meta{font-size:11px;color:var(--text3);margin-top:4px}
.detail-actions{display:flex;gap:6px}
.btn-sm{display:inline-flex;align-items:center;gap:3px;padding:5px 12px;border:1px solid var(--border);background:var(--card);font-size:11px;cursor:pointer;color:var(--text2);font-family:var(--font)}
.btn-sm:hover{border-color:var(--accent);color:var(--accent)}
.btn-sm.go{background:var(--accent);color:#fff;border-color:var(--accent)}
.btn-sm.go:hover{background:var(--accent-hover)}
.btn-sm.del{color:var(--fail);border-color:transparent}
.btn-sm.del:hover{background:#fff3e0}
.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 20px;margin-bottom:18px}
.detail-item{}
.detail-label{font-size:9px;font-weight:500;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px}
.detail-value{font-size:13px}
.detail-value code{font-family:var(--mono);font-size:10px;background:var(--bg);padding:2px 5px;border-radius:3px}
.prompt-box{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:12px 14px;font-size:12px;color:var(--text2);line-height:1.6;white-space:pre-wrap;word-break:break-word;max-height:130px;overflow-y:auto;margin-bottom:18px}
.hist-title{font-size:10px;font-weight:500;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px}
.hist-item{padding:7px 0;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:8px;font-size:11px}
.hist-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:3px}
.d-success{background:var(--on)} .d-fail{background:var(--fail)}
.d-timeout{background:#fdcb6e} .d-running{background:var(--running);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.hist-meta{min-width:105px;font-family:var(--mono);font-size:9px;color:var(--text3)}
.hist-info{flex:1;min-width:0}
.hist-out{font-size:10px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:300px;font-family:var(--mono)}
.right-empty{flex:1;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:12px}
/* overlay */
.overlay{display:none;position:fixed;inset:0;background:rgba(45,43,40,.3);z-index:100;align-items:center;justify-content:center}
.overlay.show{display:flex}
.form-box{background:var(--card);width:460px;max-height:85vh;overflow-y:auto;border-radius:10px;box-shadow:0 8px 40px rgba(0,0,0,.12)}
.form-head{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--card)}
.form-head h3{font-size:15px;font-weight:500}
.form-close{background:none;border:none;font-size:20px;cursor:pointer;color:var(--text3);line-height:1}
.form-close:hover{color:var(--text)}
.form-body{padding:20px}
.fg{margin-bottom:16px}
.fl{display:block;font-size:10px;font-weight:500;color:var(--text2);margin-bottom:4px}
.fhint{font-size:10px;color:var(--text3);margin-top:2px;line-height:1.4}
/* presets */
.preset-row{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.preset-btn{padding:6px 14px;border:1px solid var(--border);border-radius:16px;background:var(--card);font-size:12px;cursor:pointer;color:var(--text2);font-family:var(--font);transition:all .12s;line-height:1}
.preset-btn:hover{border-color:var(--accent);color:var(--accent)}
.preset-btn.sel{background:var(--accent);border-color:var(--accent);color:#fff}
.sub-row{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px}
.sub-btn{padding:5px 11px;border:1px solid var(--border);border-radius:12px;background:var(--bg);font-size:11px;cursor:pointer;color:var(--text2);font-family:var(--font);transition:all .12s}
.sub-btn:hover{border-color:var(--accent);color:var(--accent)}
.sub-btn.sel{background:var(--accent);border-color:var(--accent);color:#fff}
.time-row{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.time-inp{width:56px;padding:5px 7px;border:1px solid var(--border);border-radius:5px;font-size:13px;text-align:center;font-family:var(--font);background:var(--bg);outline:none}
.time-inp:focus{border-color:var(--accent);background:var(--card)}
.interval-row{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.interval-row .fi{width:70px}
.sel-unit{font-size:12px;padding:5px 10px;border:1px solid var(--border);border-radius:5px;background:var(--bg);cursor:pointer;font-family:var(--font);color:var(--text2)}
.sel-unit:focus{outline:none;border-color:var(--accent)}
.fi{width:100%;padding:8px 11px;border:1px solid var(--border);border-radius:5px;font-size:13px;font-family:var(--font);color:var(--text);outline:none;background:var(--bg)}
.fi:focus{border-color:var(--accent);background:var(--card)}
.fi.mono{font-family:var(--mono);font-size:12px}
textarea.fi{resize:vertical;min-height:60px}
.frow{display:flex;gap:10px}
.frow .fg{flex:1}
.toggle{display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:8px}
.toggle input{display:none}
.toggle-track{width:34px;height:20px;border-radius:10px;background:var(--off);position:relative;transition:background .2s;flex-shrink:0}
.toggle-track.on{background:var(--on)}
.toggle-track::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .2s}
.toggle-track.on::after{transform:translateX(14px)}
.toggle-label{font-size:11px;color:var(--text3)}
.fbtns{display:flex;gap:8px;justify-content:flex-end;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)}
.btn-cancel{padding:7px 18px;border:1px solid var(--border);background:var(--card);border-radius:5px;font-size:12px;cursor:pointer;color:var(--text2);font-family:var(--font)}
.btn-submit{padding:7px 18px;background:var(--accent);color:#fff;border:none;border-radius:5px;font-size:12px;cursor:pointer;font-family:var(--font)}
.btn-submit:hover{background:var(--accent-hover)}
/* confirm */
.cfm-overlay{display:none;position:fixed;inset:0;background:rgba(45,43,40,.3);z-index:200;align-items:center;justify-content:center}
.cfm-overlay.show{display:flex}
.cfm-box{background:var(--card);padding:24px;border-radius:10px;text-align:center;max-width:320px;box-shadow:0 8px 40px rgba(0,0,0,.12)}
.cfm-box p{font-size:13px;color:var(--text2);margin-bottom:14px}
.cfm-box .fbtns{justify-content:center;border:none;padding:0;margin:0}
@media(max-width:750px){.main{flex-direction:column}.panel-l{width:100%;max-height:35vh;border-right:none;border-bottom:1px solid var(--border)}.panel-r{min-height:35vh}.form-box{width:94vw}.detail-grid{grid-template-columns:1fr}}
::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
</style>
</head>
<body>

<div class="hd">
  <div class="hd-left">
    <h1>定时任务</h1>
    <p>设置定时规则，自动执行 AI 任务</p>
  </div>
  <div class="hd-right">
    <span class="hd-stat">活跃 <b id="n-on">0</b></span>
    <span class="hd-stat">停用 <b id="n-off">0</b></span>
    <span class="hd-stat" style="opacity:.5" id="tick"></span>
    <button class="btn-add" onclick="openForm()">+ 新建任务</button>
  </div>
</div>

<div class="main">
  <div class="panel-l">
    <div class="panel-head">任务列表</div>
    <div class="task-list" id="task-list">
      <div class="empty"><div class="empty-icon">&#8986;</div><div class="empty-title">暂无定时任务</div><div class="empty-desc">点击右上角「新建任务」创建</div></div>
    </div>
  </div>
  <div class="panel-r" id="detail-panel">
    <div class="right-empty">← 选择左侧任务查看详情</div>
  </div>
</div>

<!-- form overlay -->
<div class="overlay" id="form-overlay">
  <div class="form-box">
    <div class="form-head">
      <h3 id="form-title">新建任务</h3>
      <button class="form-close" onclick="closeForm()">&times;</button>
    </div>
    <div class="form-body" id="form-body"></div>
  </div>
</div>

<!-- confirm overlay -->
<div class="cfm-overlay" id="cfm-overlay">
  <div class="cfm-box">
    <p>确定删除此任务？</p>
    <div class="fbtns">
      <button class="btn-cancel" onclick="closeConfirm()">取消</button>
      <button class="btn-submit" id="cfm-del-btn" style="background:#e17055">确认删除</button>
    </div>
  </div>
</div>

<script>
var API = "/api/cron";
var tasks = [];
var selectedId = null;
var editingTask = null;
var confirmDeleteId = null;

// --- cron human preview (client-side mirror of cron-expr.js) ---
function cronToHuman(expr) {
  if (!expr) return "";
  var parts = expr.trim().split(/\\s+/);
  if (parts.length !== 5) return expr;
  var min = parts[0], hour = parts[1], dom = parts[2], month = parts[3], dow = parts[4];
  var h = parseInt(hour,10), m = parseInt(min,10);
  var ts = String(h).padStart(2,"0") + ":" + String(m).padStart(2,"0");
  if (dom === "*" && month === "*") {
    if (dow === "*") return "每天 " + ts;
    var dn = ["周日","周一","周二","周三","周四","周五","周六"];
    if (dow === "1-5") return "工作日 " + ts;
    if (/^[0-7]$/.test(dow)) return "每" + dn[parseInt(dow)%7] + " " + ts;
    if (/^[0-7],[0-7]/.test(dow)) return "每周" + dow.split(",").map(function(d){return dn[parseInt(d)%7]}).join("/") + " " + ts;
  }
  if (dom !== "*" && month === "*" && dow === "*") return "每月" + parseInt(dom) + "日 " + ts;
  if (/^\\*\\/\\d+$/.test(min) && hour === "*" && dom === "*" && month === "*" && dow === "*")
    return "每" + parseInt(min.split("/")[1]) + " 分钟";
  return expr;
}

function timeoutToHuman(sec) {
  if (!sec) return "5 分钟";
  if (sec >= 3600) return Math.round(sec/3600) + " 小时";
  if (sec >= 60) return Math.round(sec/60) + " 分钟";
  return sec + " 秒";
}

// --- data ---
function load() {
  Promise.all([
    fetch(API + "/tasks").then(function(r){return r.json()}),
    fetch(API + "/history?limit=200").then(function(r){return r.json()})
  ]).then(function(res){
    tasks = Array.isArray(res[0]) ? res[0] : [];
    var hist = Array.isArray(res[1]) ? res[1] : [];
    var on = tasks.filter(function(t){return t.enabled}).length;
    document.getElementById("n-on").textContent = on;
    document.getElementById("n-off").textContent = tasks.length - on;
    document.getElementById("tick").textContent = new Date().toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"});
    renderTaskList();
    if (selectedId) renderDetail(hist);
  }).catch(function(e){ console.error(e); });
}

function renderTaskList() {
  var el = document.getElementById("task-list");
  if (!tasks.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">&#8986;</div><div class="empty-title">暂无定时任务</div><div class="empty-desc">点击右上角「新建任务」创建</div></div>';
    return;
  }
  el.innerHTML = tasks.map(function(t){
    var sel = t.id === selectedId ? " sel" : "";
    var human = cronToHuman(t.cron_expr);
    var s = t.enabled ? "on" : "off";
    var st = t.enabled ? "运行中" : "已停用";
    return '<div class="card' + sel + '" onclick="select(' + t.id + ')">' +
      '<div class="card-row">' +
        '<div class="card-icon">&#9200;</div>' +
        '<div class="card-body">' +
          '<div class="card-name">' + esc(t.name) + '</div>' +
          '<div class="card-sub"><span class="time">' + esc(human) + '</span></div>' +
          '<span class="tag tag-' + s + '">' + st + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join("");
}

function select(id) { selectedId = id; load(); }

function renderDetail(hist) {
  var t = tasks.find(function(x){return x.id === selectedId});
  var panel = document.getElementById("detail-panel");
  if (!t) { panel.innerHTML = '<div class="right-empty">← 选择左侧任务查看详情</div>'; return; }
  var th = hist.filter(function(h){return h.task_id === t.id}).slice(0,30);
  var sc = t.enabled ? "tag-on" : "tag-off";
  var st = t.enabled ? "运行中" : "已停用";
  panel.innerHTML =
    '<div class="detail">' +
      '<div class="detail-top">' +
        '<div>' +
          '<div class="detail-name">' + esc(t.name) + '</div>' +
          '<div class="detail-meta">创建于 ' + (t.created_at || "-") + '</div>' +
        '</div>' +
        '<div class="detail-actions">' +
          '<button class="btn-sm go" onclick="triggerRun(' + t.id + ')">&#9654; 立即执行</button>' +
          '<button class="btn-sm" onclick="openForm(' + t.id + ')">&#9998; 编辑</button>' +
          '<button class="btn-sm del" onclick="confirmDelete(' + t.id + ')">&#10005;</button>' +
        '</div>' +
      '</div>' +
      '<div class="detail-grid">' +
        '<div class="detail-item"><div class="detail-label">Cron 表达式</div><div class="detail-value"><code>' + esc(t.cron_expr) + '</code> &rarr; ' + esc(cronToHuman(t.cron_expr)) + '</div></div>' +
        '<div class="detail-item"><div class="detail-label">超时</div><div class="detail-value">' + timeoutToHuman(t.timeout_sec) + ' (' + (t.timeout_sec||300) + 's)</div></div>' +
        '<div class="detail-item"><div class="detail-label">状态</div><div class="detail-value"><span class="tag ' + sc + '">' + st + '</span></div></div>' +
        '<div class="detail-item"><div class="detail-label">ID</div><div class="detail-value"><code>' + t.id + '</code></div></div>' +
      '</div>' +
      '<div class="detail-label">提示词</div>' +
      '<div class="prompt-box">' + esc(t.prompt || "") + '</div>' +
      '<div class="hist-title">运行历史 (' + th.length + ')</div>' +
      (th.length === 0 ? '<div style="font-size:11px;color:var(--text3)">暂无记录</div>' :
        th.map(function(h){
          var dc = h.status === "success" ? "d-success" : h.status === "timeout" ? "d-timeout" : h.status === "running" ? "d-running" : "d-fail";
          var ec = h.exit_code != null ? " exit:" + h.exit_code : "";
          return '<div class="hist-item">' +
            '<div class="hist-dot ' + dc + '"></div>' +
            '<div class="hist-meta">' + fmt(h.started_at) + '</div>' +
            '<div class="hist-info"><span class="tag tag-' + (h.status==="success"?"on":"fail") + '" style="font-size:8px">' + (h.status||"") + '</span> ' + ec + '</div>' +
            '<div class="hist-out" title="' + escAttr(h.stdout_tail||h.stderr_tail||"") + '">' + esc(h.stdout_tail||h.stderr_tail||"") + '</div>' +
          '</div>';
        }).join("")
      ) +
    '</div>';
}

// --- cron preset engine ---
var DAY_NAMES = ["周日","周一","周二","周三","周四","周五","周六"];
var DAY_KEYS = [0,1,2,3,4,5,6]; // Sun-Sat, cron dow

// Detect which preset best matches a cron expression
function detectPreset(cron) {
  if (!cron) return { preset: "daily", h: 9, m: 0 };
  var parts = cron.trim().split(/\\s+/);
  if (parts.length !== 5) return { preset: "custom", h: 9, m: 0, customCron: cron };
  var m = parseInt(parts[0],10), h = parseInt(parts[1],10), dom = parts[2], mon = parts[3], dow = parts[4];

  // Interval: */N * * * *
  var ivMatch = parts[0].match(/^\\*\\/(\\d+)$/);
  if (ivMatch && parts[1] === "*" && dom === "*" && mon === "*" && dow === "*") {
    var n = parseInt(ivMatch[1],10);
    if (n < 60) return { preset: "interval", h: 0, m: 0, intervalN: n, intervalUnit: "min" };
    if (n >= 60 && n < 1440 && n % 60 === 0) return { preset: "interval", h: 0, m: 0, intervalN: n/60, intervalUnit: "hour" };
  }
  // Hourly interval: 0 */N * * *
  var hMatch = parts[1].match(/^\\*\\/(\\d+)$/);
  if (hMatch && parts[0] === "0" && dom === "*" && mon === "*" && dow === "*") {
    return { preset: "interval", h: 0, m: 0, intervalN: parseInt(hMatch[1],10), intervalUnit: "hour" };
  }

  if (mon !== "*") return { preset: "custom", h: h, m: m, customCron: cron }; // has month spec → custom

  // Workday: * * * * 1-5
  if (dom === "*" && dow === "1-5") return { preset: "workday", h: h, m: m };

  // Specific weekday: * * * * N
  if (dom === "*" && /^[0-7]$/.test(dow)) return { preset: "weekly", h: h, m: m, weekday: parseInt(dow,10) % 7 };

  // Specific day of month: * * D * *
  if (/^\\d+$/.test(dom) && dow === "*") return { preset: "monthly", h: h, m: m, monthDay: parseInt(dom,10) };

  // Daily: * * * * *
  if (dom === "*" && dow === "*") return { preset: "daily", h: h, m: m };

  return { preset: "custom", h: h, m: m, customCron: cron };
}

// Build cron expression from current form state
function buildCronFromForm() {
  var preset = document.getElementById("f-preset").value;
  var h = parseInt(document.getElementById("f-hour").value,10) || 0;
  var m = parseInt(document.getElementById("f-min").value,10) || 0;

  if (preset === "daily")   return m + " " + h + " * * *";
  if (preset === "workday") return m + " " + h + " * * 1-5";
  if (preset === "weekly") {
    var wd = document.getElementById("f-weekday").value;
    return m + " " + h + " * * " + wd;
  }
  if (preset === "monthly") {
    var md = parseInt(document.getElementById("f-monthday").value,10) || 1;
    return m + " " + h + " " + Math.min(28, Math.max(1, md)) + " * *";
  }
  if (preset === "interval") {
    var n = parseInt(document.getElementById("f-ival-n").value,10) || 5;
    var unit = document.getElementById("f-ival-unit").value;
    if (unit === "min")  return "*/" + n + " * * * *";
    if (unit === "hour") return "0 */" + n + " * * *";
    return "*/5 * * * *";
  }
  if (preset === "custom") {
    var raw = document.getElementById("f-custom-cron").value.trim();
    return raw || "* * * * *";
  }
  return m + " " + h + " * * *";
}

function selectPreset(preset) {
  document.getElementById("f-preset").value = preset;
  // Update preset button styles
  var btns = document.querySelectorAll(".preset-btn");
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle("sel", btns[i].dataset.preset === preset);
  }
  // Show/hide sub-sections
  var isTimed = (preset === "daily" || preset === "workday" || preset === "weekly" || preset === "monthly");
  document.getElementById("time-row").style.display = isTimed ? "flex" : "none";
  document.getElementById("weekday-row").style.display = preset === "weekly" ? "flex" : "none";
  document.getElementById("monthday-row").style.display = preset === "monthly" ? "flex" : "none";
  document.getElementById("interval-row").style.display = preset === "interval" ? "flex" : "none";
  document.getElementById("custom-row").style.display = preset === "custom" ? "block" : "none";
  updateCustomHint();
}

function updateCustomHint() {
  var el = document.getElementById("custom-hint");
  if (!el) return;
  var v = document.getElementById("f-custom-cron").value.trim();
  var human = v ? cronToHuman(v) : "";
  el.innerHTML = (human && human !== v ? '<span class="human">' + human + '</span>' : "分 时 日 月 星期");
}

// --- form ---
function openForm(id) {
  editingTask = id ? tasks.find(function(t){return t.id === id}) : null;
  var t = editingTask || {};
  var cv = t.cron_expr || "";
  var ps = detectPreset(cv);
  var to = t.timeout_sec || 300;

  document.getElementById("form-title").textContent = editingTask ? "编辑任务" : "新建任务";

  var presetBtns = ["daily","workday","weekly","monthly","interval","custom"].map(function(p){
    return '<button class="preset-btn' + (ps.preset === p ? " sel" : "") + '" data-preset="' + p + '" onclick="selectPreset(\'' + p + '\')">' +
      {daily:"每天",workday:"工作日",weekly:"每周",monthly:"每月",interval:"间隔",custom:"自定义"}[p] + '</button>';
  }).join("");

  var weekdayBtns = DAY_KEYS.map(function(d){
    return '<button class="sub-btn' + (ps.weekday === d ? " sel" : "") + '" onclick="document.getElementById(\'f-weekday\').value=\'' + d + '\';selectPreset(\'weekly\');">' + DAY_NAMES[d] + '</button>';
  }).join("");

  var timedDisplay = (ps.preset === "daily" || ps.preset === "workday" || ps.preset === "weekly" || ps.preset === "monthly") ? "flex" : "none";

  document.getElementById("form-body").innerHTML =
    '<input type="hidden" id="f-preset" value="' + ps.preset + '">' +

    '<div class="fg">' +
      '<label class="fl">任务名称</label>' +
      '<input class="fi" id="f-name" value="' + escAttr(t.name||"") + '" placeholder="例如：每日AI信号日报">' +
      '<div class="fhint">给任务起个辨识度高的名字，仅用于列表中显示</div>' +
    '</div>' +

    '<div class="fg">' +
      '<label class="fl">执行频率</label>' +
      '<div class="preset-row">' + presetBtns + '</div>' +

      // Time picker (daily/workday/weekly/monthly)
      '<div class="time-row" id="time-row" style="display:' + timedDisplay + '">' +
        '<span style="font-size:11px;color:var(--text3)">时间</span>' +
        '<input class="time-inp" id="f-hour" type="number" min="0" max="23" value="' + ps.h + '" onchange="selectPreset(document.getElementById(\'f-preset\').value)">' +
        '<span style="font-size:13px;color:var(--text2)">:</span>' +
        '<input class="time-inp" id="f-min" type="number" min="0" max="59" value="' + String(ps.m).padStart(2,"0") + '" onchange="selectPreset(document.getElementById(\'f-preset\').value)">' +
        '<span style="font-size:10px;color:var(--text3)">24小时制</span>' +
      '</div>' +

      // Weekday sub-selector
      '<div class="sub-row" id="weekday-row" style="display:' + (ps.preset === "weekly" ? "flex" : "none") + '">' +
        '<input type="hidden" id="f-weekday" value="' + (ps.weekday !== undefined ? ps.weekday : 1) + '">' +
        weekdayBtns +
      '</div>' +

      // Month day sub-selector
      '<div class="time-row" id="monthday-row" style="display:' + (ps.preset === "monthly" ? "flex" : "none") + '">' +
        '<span style="font-size:11px;color:var(--text3)">每月</span>' +
        '<input class="time-inp" id="f-monthday" type="number" min="1" max="28" value="' + (ps.monthDay||1) + '" onchange="selectPreset(\'monthly\')">' +
        '<span style="font-size:11px;color:var(--text3)">号</span>' +
      '</div>' +

      // Interval sub-selector
      '<div class="interval-row" id="interval-row" style="display:' + (ps.preset === "interval" ? "flex" : "none") + '">' +
        '<span style="font-size:11px;color:var(--text3)">每</span>' +
        '<input class="fi" id="f-ival-n" type="number" min="1" max="1440" value="' + (ps.intervalN||5) + '" style="width:70px" onchange="selectPreset(\'interval\')">' +
        '<select class="sel-unit" id="f-ival-unit" onchange="selectPreset(\'interval\')">' +
          '<option value="min"' + (ps.intervalUnit === "min" ? " selected" : "") + '>分钟</option>' +
          '<option value="hour"' + (ps.intervalUnit === "hour" ? " selected" : "") + '>小时</option>' +
        '</select>' +
      '</div>' +

      // Custom cron input
      '<div id="custom-row" style="display:' + (ps.preset === "custom" ? "block" : "none") + '">' +
        '<input class="fi mono" id="f-custom-cron" value="' + escAttr(ps.customCron||cv) + '" placeholder="30 7 * * *" oninput="updateCustomHint()">' +
        '<div class="fhint" id="custom-hint">' + (cv ? '<span class="human">' + cronToHuman(cv) + '</span>' : "分 时 日 月 星期") + '</div>' +
      '</div>' +
    '</div>' +

    '<div class="fg">' +
      '<label class="fl">超时（秒）</label>' +
      '<input class="fi" id="f-timeout" type="number" min="30" max="7200" value="' + to + '" style="width:120px">' +
      '<div class="fhint">超时后任务被强制终止，<b>不是运行频率</b>。简单任务 60-120，日报 300-600，复杂分析 600-3600</div>' +
    '</div>' +

    '<div class="fg">' +
      '<label class="fl">提示词</label>' +
      '<textarea class="fi" id="f-prompt" placeholder="定时触发时 AI 收到的完整指令。写清楚：要什么、什么格式、多长">' + escAttr(t.prompt||"") + '</textarea>' +
      '<div class="fhint">AI 在指定时间收到这段文字并开始执行</div>' +
    '</div>' +

    '<div class="fg">' +
      '<label class="fl">启用</label>' +
      '<label class="toggle">' +
        '<input type="checkbox" id="f-enabled" ' + (t.enabled !== 0 ? "checked" : "") + '>' +
        '<span class="toggle-track' + (t.enabled !== 0 ? " on" : "") + '" id="toggle-track"></span>' +
        '<span class="toggle-label" id="toggle-label">' + (t.enabled !== 0 ? "启用" : "停用") + '</span>' +
      '</label>' +
      '<div class="fhint">关闭后任务保留但不会自动触发，仍可手动"立即执行"</div>' +
    '</div>' +

    '<div class="fbtns">' +
      '<button class="btn-cancel" onclick="closeForm()">取消</button>' +
      '<button class="btn-submit" onclick="submitForm()">' + (editingTask ? "保存" : "添加任务") + '</button>' +
    '</div>';

  // toggle handler
  var track = document.getElementById("toggle-track");
  var check = document.getElementById("f-enabled");
  var label = document.getElementById("toggle-label");
  if (track) track.onclick = function(e){
    check.checked = !check.checked;
    track.className = "toggle-track" + (check.checked ? " on" : "");
    label.textContent = check.checked ? "启用" : "停用";
    e.stopPropagation();
  };

  // weekday sub-btn click handlers
  var wdButtons = document.querySelectorAll("#weekday-row .sub-btn");
  for (var i = 0; i < wdButtons.length; i++) {
    wdButtons[i].onclick = function(){
      var wd = this.dataset.wd || DAY_KEYS[Array.prototype.indexOf.call(wdButtons, this)];
      document.getElementById("f-weekday").value = wd;
      // Update selection visual
      for (var j = 0; j < wdButtons.length; j++) wdButtons[j].classList.remove("sel");
      this.classList.add("sel");
    };
    // Set data attribute
    wdButtons[i].dataset.wd = DAY_KEYS[i];
  }

  document.getElementById("form-overlay").classList.add("show");
}

function closeForm() {
  document.getElementById("form-overlay").classList.remove("show");
  editingTask = null;
}

function submitForm() {
  var cronExpr = buildCronFromForm();
  var data = {
    name: document.getElementById("f-name").value.trim(),
    project_id: "_", project_dir: "_",
    cron_expr: cronExpr,
    prompt: document.getElementById("f-prompt").value.trim(),
    timeout_sec: parseInt(document.getElementById("f-timeout").value,10) || 300,
    enabled: document.getElementById("f-enabled").checked ? 1 : 0
  };
  if (!data.name || !data.prompt) {
    alert("任务名称和提示词为必填项");
    return;
  }
  var url = editingTask ? API + "/tasks/" + editingTask.id : API + "/tasks";
  fetch(url, {
    method: editingTask ? "PUT" : "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(data)
  }).then(function(res){
    if (!res.ok) return res.json().then(function(e){ alert("保存失败: " + (e.error||"")); });
    if (!editingTask) res.json().then(function(c){ selectedId = c.id; load(); });
    else { closeForm(); load(); }
  });
}

function triggerRun(id) { fetch(API + "/tasks/" + id + "/run",{method:"POST"}); setTimeout(load,1500); }

function confirmDelete(id) {
  confirmDeleteId = id;
  document.getElementById("cfm-overlay").classList.add("show");
  document.getElementById("cfm-del-btn").onclick = function(){
    fetch(API + "/tasks/" + confirmDeleteId, {method:"DELETE"}).then(function(){
      confirmDeleteId = null; if (selectedId === id) selectedId = null;
      document.getElementById("cfm-overlay").classList.remove("show");
      load();
    });
  };
}

function closeConfirm() { confirmDeleteId = null; document.getElementById("cfm-overlay").classList.remove("show"); }

// --- utils ---
function esc(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function escAttr(s) { return String(s||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function fmt(s) { if (!s) return "-"; try { var d=new Date(s+(s.indexOf("Z")>=0?"":"Z")); return d.toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}); } catch(e){return s;} }

// --- init ---
load();
setInterval(load, 30000);

// close overlay on backdrop click
document.getElementById("form-overlay").addEventListener("click",function(e){ if(e.target===this) closeForm(); });
document.getElementById("cfm-overlay").addEventListener("click",function(e){ if(e.target===this) closeConfirm(); });
</script>
</body></html>`;
}

module.exports = { render: render };

# scheduler 外来任务无法通过 API 删除

type: capability
date: 2026-07-10
source: scheduler 巡检 no_foreign_tasks 修复

## 现象
`scheduler-state.json` 中有任务 ID 不在 `jobs.json` 注册表中，巡检报 `no_foreign_tasks` 失败。直接编辑文件删除 → 过一会又回来。

## 根因
1. scheduler 进程（:3100）在内存持有 state，定期写回磁盘。编辑文件 → 下次写回覆盖。
2. `DELETE /api/cron/tasks/:id` 用 `+req.params.id`（数字转换），UUID 格式外来任务永远返回 Not found。API 只认 SQLite 数字 ID。

## 修复
```powershell
# 1. 找 PID 并强杀
netstat -ano | findstr 3100
taskkill /F /PID <PID>

# 2. 编辑文件清除外来任务（scheduler 停了不会覆盖）
node -e "
var fs=require('fs');
var p='C:/Users/Administrator/.scheduler/scheduler-state.json';
var s=JSON.parse(fs.readFileSync(p,'utf8'));
var j=JSON.parse(fs.readFileSync('C:/Users/Administrator/.scheduler/jobs.json','utf8'));
var names={}; (j.jobs||j).forEach(function(t){names[t.id]=t.name});
var tasks=s.tasks||{}, keep={};
Object.keys(tasks).forEach(function(id){ if(names[id]) keep[id]=tasks[id]; });
s.tasks=keep;
fs.writeFileSync(p,JSON.stringify(s,null,2)+'\n','utf8');
"

# 3. 重启
node C:/Users/Administrator/.scheduler/start.js &
```

## 预防
外来任务来源是 OpenClaw gateway 直写 `scheduler-state.json`。如果再次出现，需修 gateway 端改为走 scheduler API（POST /api/cron/jobs）。

---
type: diagnosis
domain: general
author: claude
date: 2026-09-03
source: Agentboard dashboard 重启 — kill 后等 36s+ Supervisor 不复活
---

# Supervisor 只复活自己 spawn 的服务：pid 0 条目死一个少一个，别赌自动重启

## 现象
- dashboard 挂/被杀后，按「Supervisor 是唯一进程守护」预期 30s 内自动拉起
- 实际等 36s+ 端口一直是 000，无复活
- 查询 Supervisor `/api/status`：dashboard 条目 `status: running, pid: 0`

## 根因
Supervisor 的健康探测分两类：自己 spawn 的进程（有 pid、写内部 Map）→ 死了自动 restart；**只探测到端口活着但非它 spawn 的**（pid 0）→ 只做端口健康检查，进程死它不负责。agentboard（骨件）相对 Supervisor 就是 pid 0 的"特殊条目"——文档说守护，真实行为只探活不复活。

## 修复/步骤
dashboard 死了直接手工拉：

```powershell
cd %USERPROFILE%\.agentboard
node start.js   # 后台运行；start.js 先 kill-port 3099 再起 server.js
```

拉完轮询 `curl localhost:3099/api/tools` 到 200 再继续。要 supervisor 真正接管，得走 supervisor API 让它 spawn（pid 才记账），别 kill 后干等。

## 预防
- 先查 `/api/status` 该条目 pid：`pid: 0` = 不是它 spawn 的，死不会自动复活
- 改 agentboard 代码要重启时，直接 kill + 手工 relaunch，省一轮空等
- 别把「文档声称的守护」当真实行为——以 /api/status 的 pid 字段为准

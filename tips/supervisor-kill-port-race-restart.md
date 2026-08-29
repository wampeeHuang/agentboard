---
type: diagnosis
date: 2026-08-26
source: 字荐注册工具架后 supervisor 启动必死，exit code=1，约 3 秒
---

# Supervisor /api/restart 竞态：异步 kill-port 杀掉刚绑定端口的新进程

## 现象

新工具（python 服务，秒绑端口）注册到 agentboard 后，走「启动」按钮/API 拉起：
supervisor spawn 成功、端口短暂 LISTENING，**约 3 秒后进程 exit code=1**。
agentboard 报 `Port did not respond within 30s` 或报成功但服务随即死。
手动 `python xxx.py` 却一切正常。supervisor 日志无 stderr（子进程 stderr 被 `() => {}` 丢弃）。

## 根因

`~/.supervisor/supervisor.js` 的 `/api/restart` handler（health-restart 路径同病）：

```js
tryKillPortAsync(port);  // fire-and-forget exec('npx kill-port 8770')
start(id);               // 立即 spawn 新进程
```

`npx kill-port` 冷启动 ~3 秒才执行到杀端口动作；新进程 python ~1 秒已绑定端口。
kill-port 落地时按端口找 PID——**分不清新旧进程**——把刚起的新进程杀掉（强杀 exit code 恰好是 1）。
绑定越快的服务（python stdlib）必输竞态；node 服务启动慢偶尔躲过，所以此 bug 长期潜伏，只在接入快绑定服务时爆发。

## 修复

1. `tryKillPortAsync` 改为返回 Promise（exec 回调 resolve；对 fire-and-forget 调用点向后兼容）
2. `/api/restart` 与 health-restart 两处改为 `tryKillPortAsync(port).then(() => start(id))`
3. 崩溃自愈路径（scheduleRestart）有 5s RESTART_DELAY 缓冲，未动

修复后字荐启动存活、HTTP 200。

## 预防

- supervisor 子进程 stderr 被完全丢弃（`stdio pipe + on('data', ()=>{})`），排障时先想办法抓子进程 stderr（如给服务本身加 crash log），别信 supervisor 日志的「无输出」
- 排查「服务起一下就死 exit code=1」：Windows 强杀（taskkill /F、kill-port）的退出码就是 1，**exit code=1 ≠ 程序自己崩**，先怀疑被人杀
- 排障口诀：日志时间戳配对 spawn/exit 间隔是否恒定（本例恒 ~3s = npx 冷启动时长，确定性竞态非随机故障）

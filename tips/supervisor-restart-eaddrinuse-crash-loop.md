---
type: diagnosis
date: 2026-08-28
source: 能力地图开发中 dashboard 打不开，/api/status 显示 dashboard idle + restart_count 2
---

# Supervisor 重启竞态的另一半：新进程 EADDRINUSE 崩溃循环（旧进程没放端口）

## 现象

dashboard（:3099）突然打不开，浏览器连接被拒。`curl :3099` 返回 000 / connection refused。
supervisor `GET /api/status` 显示 `"idle"`（非 running）+ `restart_count` 持续爬升。
dashboard 自己的重启日志出现：

```
[agentboard] uncaughtException: Error: listen EADDRINUSE: address already in use 127.0.0.1:3099
```

但此时 `Get-NetTCPConnection -LocalPort 3099` 查无监听——端口其实已经空了。

## 根因

supervisor 崩溃自愈/手动 restart 的时序竞态，和 [supervisor-kill-port-race-restart](supervisor-kill-port-race-restart.md) 是同一段代码的两个相反方向：

- **那边**：kill-port 把刚绑定端口的**新进程**杀了 → exit code 1
- **这边**：旧进程还攥着 3099 没释放时，supervisor 已拉起**新进程** → `listen EADDRINUSE` → uncaughtException 直接崩

崩溃瞬间重启计数 +1 → supervisor 立刻再拉起 → 旧进程可能还没放端口 → 再次 EADDRINUSE → 死循环。直到旧进程彻底释放端口、某次拉起恰好落在空窗才活下来。Windows 下进程退出到端口释放存在延迟（TIME_WAIT/句柄回收），让这个窗口更宽。

## 修复

1. `curl -s -X POST :3097/api/restart -H "Content-Type: application/json" -d '{"id":"dashboard"}'` —— 手动重启一次，落在空窗即活
2. 先确认端口确实没人占：`Get-NetTCPConnection -LocalPort 3099 -State Listen`
3. 若端口仍被占，查 OwningProcess 是谁（`Get-CimInstance Win32_Process`），确认是残留旧进程再杀；别盲杀 node

## 预防

- **诊断优先看重启日志**（`_runtime/logs/dashboard-manual.log` / supervisor 子进程日志），EADDRINUSE 是唯一直接证据，比猜「服务崩没崩」快
- **status 三件套对不齐 = 竞态嫌疑**：`idle`（非 running）+ `restart_count` 爬升 + 端口实际空 → 旧进程没放干净
- 区分两个 race：日志出现 `exit code=1` → 看 [kill-port-race-restart]；出现 `listen EADDRINUSE` → 本条目
- supervisor 若常出此竞态，根治方向是 start 前确认端口已释放（等 TIME_WAIT 结束）再 spawn，而非盲重试

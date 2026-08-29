---
type: diagnosis
date: 2026-08-28
source: cron-scheduler 停止按钮无效，重启调度器排查
---

# supervisor 停止假成功：ok:true 但进程还活着——三层复活链

## 现象

点停止/关常驻返回 `ok:true`，服务进程却还活着。agentboard 停止按钮报"端口仍活跃"，supervisor 面板过一会又把服务显示回 running。以为停了，其实没停，且全程无报错。

## 根因

1. **端口兜底杀不可靠**。supervisor stop 的兜底是 `npx kill-port <port> 2>nul`——冷启动不可靠（本机实测 25s 无响应），错误被 `2>nul` 吞掉，fire-and-forget 无验证，直接返回 ok:true。
2. **孤儿进程没被追踪**。父 shell 已死的进程 supervisor 不持有 PID（status 里 pid:0），`killTreeAsync(s.process.pid)` 被跳过，只剩失效的端口杀兜底。
3. **双重复活**：
   - supervisor 的 `healthCheck` 发现 idle 服务端口还活着 → "收养"回 running，静默反转。
   - 外部守卫（如 scheduler-guard 计划任务）独立于 supervisor，定时把死掉的服务拉回来。
4. **autoStart 作用域被高估**。autoStart 只控制 supervisor 的启动 spawn 和崩溃重启策略，管不到外部 guard——关掉"常驻"≠服务会停。

## 修复

`~/.supervisor/supervisor.js`：
- 新增 `getPortPid`（netstat 找监听 PID）+ `taskkill /T /F`，替代 npx kill-port。
- `tryKillPortAsync` 等端口真正释放再 resolve。
- `/api/stop` 和 `/api/toggle-auto-start` 杀完验证端口：还活着 → 返回 `ok:false` + 错误文案，不再静默假成功。
- 新增 `setGuardTask`：manifest 可选字段 `guardTask`（Windows 计划任务名），stop/关常驻时 `schtasks /DISABLE`，restart/开常驻时 `/ENABLE`——让外部守卫和停止操作联动。

cron-scheduler manifest 加 `"guardTask": "scheduler-guard"`。

## 预防

- 停止类操作必须验证并如实报错，禁止先返回 ok 再 fire-and-forget。
- 有外部守卫（schtasks/watchdog）的服务，停的时候连守卫一起停，否则永远拉回。
- 200/ok:true ≠ 操作生效。排查"停不掉"先看：进程是否孤儿、端口兜底杀是否可靠、有没有第二重守护。

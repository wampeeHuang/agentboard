---
type: diagnosis
date: 2026-10-14
domain: general
author: codex
source: 2026-10-14 Supervisor 主线程僵死排查、隔离故障复现与恢复验证，修复提交 53ab1e3
---

# 去掉 execSync 后仍会卡死：Windows stdout 管道能阻塞 Node 心跳

## 现象

后台守护进程仍存在，但 HTTP 无响应，独立 watchdog 报主线程超过 60 秒没有心跳；启动队列停在某条日志后，多个本地服务未就绪。不能把最后一条“启动某服务”日志当作该服务导致卡死的证明。

## 根因与证据边界

Node.js 的 stdout/stderr 并非总是异步：Windows 管道写入是同步的，接收端不读取或阻塞时，console.log 可以阻塞整个主事件循环，连定时器、HTTP 和心跳都停。移除了 execSync，并不代表已经消除全部同步阻塞入口。

本机隔离实验：子进程定时发心跳，再向无人读取的 stdout 写入 8 MiB；2.5 秒内只收到 2 次心跳。改为异步文件日志后，相同未读 stdout 条件下心跳持续运行。

此次 Supervisor 原 log() 先 console.log、后写文件，guard 只重定向 stderr，是最有依据的触发机制。但旧进程已被守卫清除，没有阻塞调用栈，不能把机制复现写成此次故障的栈级确证。

官方依据：[Node.js process I/O](https://nodejs.org/download/release/v24.20.0/docs/api/process.html)。

## 修复/步骤

1. 守护日志走独立的异步文件流，避免依赖继承控制台；启动入口同时隔离 stdout 和 stderr。
2. 心跳检测放在独立 worker，超时保存 PID、时间和最后执行阶段；通过已有外部守卫任务恢复，不靠主线程自己恢复，也不只报警后等待长周期巡检。
3. 恢复请求限制有效期、核对目标 PID、加互斥锁并保留退避，防止过期请求或并发拉起造成新的故障。
4. 回归必须故意阻塞主线程，并测试未读 stdout 条件；仅验证 HTTP 200 或正常启动不能证明已消除此类卡死。

## 预防

- 诊断先区分进程存活、事件循环响应、页面渲染，不以端口占用或 PID 存在证明服务健康。
- 清除故障进程之前尽量保留现场；仅有最后一条日志时，写明证据边界，不把关联当因果。
- 守护替换后核对服务监听 PID 是否保留。父控制台与子进程生命周期的另一类问题，参见 [既有经验](windows-start-b-kills-children.md)，不要重复建卡。
- PowerShell 的 detached/文件输出组合在本机实测可能返回成功却没有执行脚本；恢复路径须用实际执行回执验证。

## 验证依据

修复位于 C:/Users/Administrator/.supervisor，提交 53ab1e3。node --test scripts/checks/heartbeat-recovery.test.js 的 4 项故障回归通过。真实 Supervisor 替换后，3099/3110/3100/8781/3104 监听 PID 均保持不变且 HTTP 200，工具架在浏览器完整渲染；该验收未故意卡死正式服务。PowerShell 子服务保留兼容方式，不承诺跨父进程退出存活。

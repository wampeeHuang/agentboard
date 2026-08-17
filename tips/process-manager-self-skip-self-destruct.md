# 进程管理器自管自毁：跳过自己

type: architecture
date: 2026-07-31
source: Supervisor 启动自己 → 子进程抢端口失败 → kill-port 反向杀父进程

## 现象
- 进程管理器（Supervisor）稳定运行一段时间后突然崩溃
- 日志中出现 `starting supervisor :3097...`（管理器启动自己的子进程）
- 子进程因 EADDRINUSE 退出，handleExit 中 `npx kill-port 3097` 杀死父进程
- 崩溃后 watchdog 拉起新进程，循环往复

## 根因
进程管理器通过文件扫描注册服务（读 manifest.json）。管理器自己的 manifest 也在扫描目录内，且满足全部注册条件（有 port、有 startCommand、未 disabled）。`loadManifests()` 未跳过自己 → 被当作普通服务启动 → 自毁。

## 修复
在服务注册阶段硬编码跳过自己：
```javascript
if (m.id === 'supervisor') continue; // don't manage self
```

## 预防
任何通过"扫描目录 → 注册 → 管理"模式的进程管理器，必须显式跳过自己。不能依赖：
- manifest 的 disabled 字段（应保留给外部控制）
- 文件系统排序（不确定）
- 运行时检测（太晚，启动链已经开始）

诊断标志：日志中出现管理器自身的 id + 端口冲突 + 管理器的子进程 pid。

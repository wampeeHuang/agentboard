# HANDOFF — 2026-06-23

## 本次完成

**运维日志 + 崩溃保护**
- 新建 `lib/ops-log.js`：JSONL 环形缓冲区，同步裁旧（默认 1000 行），提供 `log/info/warn/error/recent/health` API
- `server.js` 接入 ops-log，`uncaughtException` + `unhandledRejection` 处理器写日志不退出
- 新增 `GET /health` 端点：`{"status":"ok","uptime":...,"errors24h":...,"crashes24h":...,"abnormalDeaths":[...]}`
- `health()` 内建非正常死亡检测：进程 PID 变了但 crash 日志里没有记录 → 标记为 abnormalDeath
- `guard.ps1` 检查从 TCP 端口连接改为 HTTP `/health` 200 检查（防僵尸进程误判）

**Tips 已写入**
- `node-no-crash-handler-silent-death.md` — Node 进程无崩溃处理器 = 静默死亡，含修复步骤和预防清单

## 待定

- [ ] 独立巡检脚本（auditRuntime 已在 lib 里可用）
- [ ] phone-frame 源文件丢失，待找回
- [ ] 可考虑缩短 guard 间隔或加独立 watchdog，减少崩溃窗口（当前 1h）

## 运行状态

- agentboard :3099（已加崩溃保护 + 运维日志）
- scheduler :3100
- inspector :3101
- 运维日志：`~/.agentboard/_runtime/ops-log.jsonl`（1000 行轮转）
- 健康端点：`curl localhost:3099/health`

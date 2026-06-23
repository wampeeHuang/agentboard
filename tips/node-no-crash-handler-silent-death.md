# Node 进程无崩溃处理器 = 静默死亡
type: diagnosis
date: 2026-06-23
source: agentboard :3099 反复挂掉，排查发现 server.js 没有任何 uncaughtException / unhandledRejection 处理器

## 现象
- Node 常驻服务（Express）随机挂掉，端口消失
- 无错误日志，Windows 事件查看器无记录
- 手动启动能正常工作一段时间
- 重启后很快又挂（几分钟内）

## 根因
server.js 没有注册 `process.on('uncaughtException')` 或 `process.on('unhandledRejection')`。Node.js 默认行为：未捕获异常 → 进程立即 exit。

任何路由 handler 的同步 throw、async 函数的未 catch Promise 拒绝、第三方库的内部异常——都会直接杀死进程。没有日志，没有痕迹。

系统重启后守护（schtasks guard.ps1）拉起进程，几分钟后某个请求触发异常 → 进程死 → 用户看到"无法访问"。守护间隔 1 小时，中间窗口无人拉起。

## 修复/步骤

**1. 加崩溃保护（server.js）**
```javascript
process.on('uncaughtException', function(err) {
  opslog.error('uncaughtException', err.message, { stack: err.stack });
  console.error('[agentboard] uncaughtException:', err.stack);
});
process.on('unhandledRejection', function(reason) {
  opslog.error('unhandledRejection', reason.message, { stack: reason.stack });
  console.error('[agentboard] unhandledRejection:', reason.stack);
});
```

**2. 加运维日志（lib/ops-log.js）**
- JSONL 格式落 `_runtime/ops-log.jsonl`
- 同步裁旧：超过 MAX_LINES（默认 1000）自动删老行
- 每次启动写 `info('start', ...)`
- 提供 `health()` 摘要：运行时长、24h 错误数、崩溃次数、非正常死亡检测

**3. 暴露健康端点（/health）**
```
GET /health → {"status":"ok","uptime":3600,"errors24h":0,"crashes24h":0,"abnormalDeaths":[]}
```
巡检 agent 敲这个，status 不是 "ok" 才深挖日志文件。

**4. 守护检查从 TCP 改为 HTTP**
```powershell
# 旧：盲连端口（僵尸进程会误判健康）
$conn = [Net.Sockets.TcpClient]::new('127.0.0.1', 3099)

# 新：HTTP /health 200 才算活
Invoke-WebRequest -Uri "http://127.0.0.1:3099/health" -TimeoutSec 5
```

## 预防
- 任何 Node 常驻服务上线前，检查是否有 `uncaughtException` + `unhandledRejection` 处理器
- 不要依赖外部监控（TCP 端口检查）来验证进程健康——HTTP /health 才能发现僵尸
- 守护间隔 ≤ 服务可接受的最大 downtime。1 小时对频繁使用的服务太长
- 健康检查只看 status 字段，不要自己解析 err msg——agent 不该替人做诊断

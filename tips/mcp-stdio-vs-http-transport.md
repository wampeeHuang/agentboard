---
type: method
date: 2026-08-05
source: agentboard MCP 运输层选型，stdio→Streamable HTTP 升级
---

# stdio 不适合基础设施管理工具 — 串行阻塞+无自动重连

## 现象
工具架的 `start_tool` 需要等 15-30 秒端口就绪。stdio 串行通道被这条请求占死，期间所有其他工具调用（list/get/stop）全部排队等。

## 根因
stdio 运输层 = 单根管道。一个请求在处理中，通道被占，后续请求发不出去。对比：

| | stdio | Streamable HTTP |
|---|---|---|
| 并发 | 串行（单通道） | 多请求并行 |
| 重连 | 无（进程死=永久断） | 自动重试 |
| 启动工具 | 阻塞 15-30s，卡死全部操作 | 异步返回 starting，不阻塞 |
| 单点故障 | 进程崩=全挂 | 服务独立，重启即恢复 |
| 调试 | 无日志可见 | curl/浏览器可测试 |

## 修复
从 stdio 升级到 Streamable HTTP stateless 模式。`start_tool` 不阻塞等端口，立即返回 `{status: "starting", port, pid, note: "Check via agentboard_get_tool"}`。

## 预防
- 基础设施管理/长时间操作 → Streamable HTTP
- 快速查询/无状态工具 → stdio 可接受
- 判断标准：最长单次调用耗时 > 3 秒 → 不选 stdio

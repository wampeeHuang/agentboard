---
type: diagnosis
date: 2026-08-31
domain: general
author: claude
source: 修复 tool-registry.js scanTools 投影（补 apiKeyName/models）后，HTTP API 仍返回 undefined；supervisor restart 返回 ok 但 pid 未变
---

# supervisor /api/restart 对运行中的 dashboard 是软重启：改了 agentboard lib 代码但 API 不生效时，先杀占端口进程再重启

## 现象
改了 `~/.agentboard/lib/` 下的核心代码（如 tool-registry.js scanTools 投影），文件层 node -e require 验证已正确，但 HTTP API（:3099 /api/tools）仍返回旧值。`POST /api/restart {"id":"dashboard"}` 返回 ok:true、uptime_s 重置为 12，但占 3099 端口的进程 pid/启动时间纹丝不动——软重启，没真正重载代码。

## 根因
supervisor 的 restart 会拉起一个新进程，但旧进程还占着端口时，新进程 bind 失败起不来；supervisor 却把状态记成已重启（uptime 归零）。直接 kill 旧进程后 supervisor 也不会立刻自动拉起（agent_notes 里"会自动重启"在实测中 11s 内没发生）。于是出现"restart 返回成功但代码没生效"的假象。

## 修复
```
1. 确认要重载的代码文件已改对：node -e require 验证（文件层正确）
2. 查端口占用：netstat -ano | findstr :3099 → 记下 pid
3. 杀旧进程：Stop-Process -Id {pid} -Force（端口释放，确认 LISTENING 消失）
4. supervisor restart：POST http://localhost:3097/api/restart body {"id":"dashboard"}
   （PowerShell 内联 JSON 会乱码，用文件 + --data-binary @file）
5. 验证：curl /api/tools 应返回新字段
```

## 预防
- 重载 agentboard 自身代码：不要依赖 supervisor restart，先杀占端口进程再 restart
- supervisor /api/restart 返回 ok ≠ 进程真的重启，看 pid/启动时间才算数
- 给 supervisor 发 JSON 一律走文件 body，不要 PowerShell 内联引号

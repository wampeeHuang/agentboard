# 冲突检查在"启动中"窗口期失效——端口未就绪=不运行

type: diagnosis
date: 2026-07-29
source: ComfyUI 启动中（10-30秒加载模型），ACE Step 仍能启动——冲突检查没拦住

## 现象

GPU 服务（ComfyUI、ACE Step、Stable Diffusion）互斥冲突写在 manifest 的 `conflicts` 字段里。但一个服务正在启动（进程存在但端口还没监听），另一个冲突服务仍能启动——冲突检查放了。

## 根因

`scanTools()` 判断 `running` 的逻辑：

```
ports.every(isPortActive) → running = true
端口没监听 → running = false
```

GPU 服务启动慢，`startTool` spawn 后立即返回 `"starting"`。端口就绪需 10-30 秒。这段时间：
- PID 文件已写入 → `readPidAlive(id)` 能确认进程活着
- 端口未监听 → `t.running = false`
- 冲突检查只看了 `t.running` → 跳过 → 放行

代码位置：`lib/tool-registry.js:449-451`（修复前）—— `if (!t.running) return;` 直接跳过了所有"启动中"的冲突工具。

## 修复

冲突检查的本地兜底从"只查 running"改为"查 running 或 PID 活着"：

```javascript
// 旧：端口没监听 = 不算运行
if (!t.running) return;

// 新：端口没监听但 PID 活着 = 启动中，也算冲突
if (t.running || readPidAlive(t.id)) {
  localConflicts.push(t.name);
}
```

## 预防

任何依赖 `scanTools().running` 做判断的逻辑，都要考虑"启动中"的中间状态。`running` 是端口级信号，不是进程级信号。需要进程级判断时用 `readPidAlive()`。

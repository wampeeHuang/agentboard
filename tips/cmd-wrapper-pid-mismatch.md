# Windows 上 cmd /c 包裹启动命令导致 PID 不匹配，stranger 检测误杀子进程

type: diagnosis
date: 2026-07-24
source: 版式画廊启动按钮静默失败排查

## 现象

点击 agentboard 工具架启动按钮，API 返回 `{"ok":true}`，但端口短暂出现后消失，服务未启动，用户无任何错误反馈。

## 根因

`child_process.spawn('cmd', ['/c', command])` 创建双进程链：

```
agentboard spawn → cmd.exe (PID=A, 写入 runtime/{id}.pid)
  → cmd.exe 启动 → node.exe (PID=B, 实际监听端口)
```

`scanTools()` 轮询时比较端口 PID 和存储 PID：`B ≠ A` → 判定为 "stranger" → `taskkill /PID B` → 服务被误杀。

代码位置：`lib/tool-registry.js:281-283`（修复前）。Windows 上所有命令统一包 `cmd /c`（line 416），stranger 检测要求端口 PID === 存储 PID，cmd 包裹永远不可能满足。

## 修复

两层修复：

**Layer 1 — stranger 检测自愈（止血）：** PID 不匹配时不再杀进程，改为 `writePid(name, portPid)` 更新存储 PID。适用所有 cmd /c fallback 场景。

**Layer 2 — 直 spawn 去 cmd /c（治根）：** 新增 `parseWindowsCommand()` 拆解 `cd`/`set`/`&&` 链。`node`/`python`/`py` 开头的命令直 spawn，存储 PID 天生等于端口持有者，stranger 检测完全不触发。

## 预防

- **新工具 manifest：** startCommand 写 `node server.js` 而非 `cd /d ... && npm start`。agentboard 通过 projectPath 设 cwd，cd 前缀冗余
- **Windows 启动命令优先直 spawn：** node/python/py 永远不包 cmd /c
- **静默失败需兜底：** startTool API 返回 ok 但服务未启动时，前端应展示超时错误，而非回到"启动"状态

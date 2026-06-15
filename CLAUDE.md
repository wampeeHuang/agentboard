# Agentboard 宪法

## 架构

```
~/.agentboard/
  server.js          ← 运行中的服务器，扫描 tools/ 和 cron-config.json
  index.html          ← 工具架前端
  tools/*/manifest.json  ← 工具注册（唯一真相源）
  tips/*.md           ← 操作日志（唯一真相源）
  apps-registry.json  ← 公网应用注册表
  cron/tasks.db       ← cron 任务运行时状态（SQLite）
```

工具卡片来源：
- **manifest.json** — `~/.agentboard/tools/*/manifest.json`，一个目录一个工具
- **动态注入** — `/api/tools` 从 `~/.claude/cron-config.json` 读取并注入独立 cron 卡片（已废弃）
- **cron-scheduler** — manifest 注册，`type: "group"`，7 个任务分 3 组：日报(3)+提醒(1)+巡检(3)。展开可见，日报状态来自 `/api/cron/state`

## 工具调用协议

**每次操作工具前必须查 `/api/tools`**，不只是看 `running` 状态，还要读两个字段：

### conflicts（互斥冲突）

当前工具和其他工具的冲突关系。两种来源：
- **manifest 声明**（手动维护）：GPU 显存互斥（ComfyUI↔SD↔MiniCPM↔ACE）、语义互斥（langgraph-agent↔langgraph-rag）
- **端口冲突**（运行时自动检测）：两个工具抢同一个端口时会自动追加

操作前检查：要启动的工具的 `conflicts` 列出的工具如果有 `running: true`，先停掉再启动，或告知用户选一个。

### agent_notes（模型行为踩坑笔记）

针对 DeepSeek 等模型容易在这个工具上犯的错。每条 notes 记录了：
- 模型会误判什么场景
- 模型的认知盲区（如"不理解异步两阶段"）
- 操作前必须确认的前置条件

**调用流程（不可跳过）**：

```
1. GET /api/tools → 找到目标工具
2. 读 conflicts → 有 running 的冲突工具→先停或换方案
3. 读 agent_notes → 对照自己的操作计划，有没有踩中已知盲区
4. running: false → 启动工具
5. running: true → 直接调
```

缺失字段 ≠ 失败——`conflicts: []` 和 `agent_notes: ""` 表示暂无已知冲突/盲区。

## 红线

- **禁止删除 `tools/` 下的任何 manifest 目录**，除非用户逐文件确认
- 用户说"删卡片"≠授权删文件。先问：隐藏还是删除？如果要删，列清单等确认
- 改动前先 `curl localhost:3099/api/tools` 看现状

## 操作日志

- 写入路径：`~/.agentboard/tips/*.md`
- **不要写到 `~/.claude/tips/`** — agentboard 不读那个目录
- **写入前必须先读 `tips/CONSTITUTION.md`** — 格式、分类、准入五问的唯一真相源

## 服务器

- 端口 3099，进程 `node server.js`
- 修改 server.js 后必须重启：`Stop-Process -Id <PID> -Force; Start-Process node -ArgumentList "server.js"`
- manifest 改动无需重启，每次请求都会重新扫描

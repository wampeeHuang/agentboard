# Agentboard 宪法

## 架构

```
~/.agentboard/
  server.js          ← 运行中的服务器，扫描 tools/ 和 cron-config.json
  index.html          ← 工具架前端
  tools/*/manifest.json  ← 工具注册（唯一真相源）
  tips/*.md           ← 操作日志（唯一真相源）
  apps-registry.json  ← 公网应用注册表
  cron/tasks.json     ← cron 任务运行时状态
```

工具卡片来源：
- **manifest.json** — `~/.agentboard/tools/*/manifest.json`，一个目录一个工具
- **动态注入** — `/api/tools` 从 `~/.claude/cron-config.json` 读取并注入独立 cron 卡片（已废弃）
- **cron-scheduler** — manifest 注册，`type: "group"`，children 列出 7 个子任务，展开可见

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

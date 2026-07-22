# 过时 CLAUDE.md 让 Agent 复活已删除的 PM2 并撞端口
type: diagnosis
date: 2026-07-23
source: 注册 dechpcba 到工具架时 3099 不通，Agent 读 agentboard CLAUDE.md 见 "PM2 管理" → npx 下载 PM2 启动 agentboard → 与 Supervisor 的 dashboard:3099 撞端口

## 现象
- `curl localhost:3099` 偶发不通（可能是 bash curl IPv6 问题）
- Agent 读 `~/.agentboard/CLAUDE.md` 第 130 行："端口 3099，PM2 管理"
- Agent 执行 `npx pm2 start ecosystem.config.js`，PM2 daemon 启动
- PM2 agentboard 报 `EADDRINUSE :::3099`，反复重启 4 次后进入 errored
- 实际 Supervisor (:3097) 一直在正常守护 dashboard:3099

## 根因
`~/.agentboard/CLAUDE.md` 硬编码了 agentboard 的进程管理机制（PM2），但 PM2 早已被移除，实际由 Supervisor 守护。
Agent 信任文档 > 查运行时状态，按过时指令操作，复活了已删除的工具链。

更深层：多真相源。agentboard 怎么被管的——真相在 Supervisor 的 manifest，不在 agentboard 自己的 CLAUDE.md。agentboard 不应该描述"谁在管我"，只应该指过去。

## 修复
1. `~/.agentboard/CLAUDE.md` 服务器段改为指针：`进程守护由 Supervisor 管理，详见 ~/.agentboard/tools/supervisor/manifest.json`
2. `npx pm2 delete agentboard && npx pm2 kill` 清理残留 PM2 daemon
3. 删 `~/.agentboard/ecosystem.config.js`（PM2 配置文件，已无用）

## 预防
- 任何服务的 CLAUDE.md 不描述"谁在管我"，只写指针指到管理者
- Agent 操作前先查运行时状态（Supervisor /api/status），不盲信文档
- 文档写"怎么查"不写"是什么"——后者必然过期

# HANDOFF 2026-07-02

## 已做

### PM2 路径漂移修复
- **根因**: agentboard 和个体户台账的 PM2 dump 记着已删除的旧路径（`~/.claude/dashboard/` 和 `D:\Claude code_workspace\...`），进程挂掉后 PM2 找不到入口文件，反复重启失败，状态显示 online 但实际是死的
- **修复**: 两个项目各加 `ecosystem.config.js`，相对路径 `./server.js`，删旧 PM2 进程从 ecosystem 重启
- **tips**: 写了 `pm2-online-pid-na-dead.md` 沉淀这个诊断模式

### perspective-viewer 删除
- **原因**: 代码期望 `perspective-*` 前缀的目录名，但实际技能目录是 `*-perspective` 后缀，导致只匹配到 perspective-router 一个条目，漏了全部 9 个人物
- **结论**: nuwa-catalog(:3090) 有完整 61 个人物，perspective-viewer 是重复轮子，已彻底删除（代码 + manifest）

### nuwa-catalog manifest 修复
- `capability` 从 "39位人物思维顾问目录站" → "人物思维顾问目录站"，消除过期的硬编码数字

## 当前状态
- :3099 agentboard — UP (PM2 ecosystem)
- :3090 nuwa-catalog — UP (独立 `npx serve`)
- :3456 个体户台账 — UP (PM2 ecosystem)
- PM2 进程: 2 个，都用 ecosystem.config.js 管理
- pm2-logrotate 已安装：10MB 切分 + 保留 7 个切片

## 下步
- 新项目加 PM2 管理时，一律用 ecosystem.config.js，不直接用绝对路径
- 工具架 manifest 的 capability/description 不写可变的数字，引用源站为准

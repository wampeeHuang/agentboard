# CHANGELOG · agentboard

## 2026-07-08 — 审计修复

**触发**: 工具架第一性原理审查

**决策**:
- 模型分类拆为本地/远程——端口字段不当类型标签用，agent 应从结构判断可启动性
- CLI 工具不补假 startCommand——不为例行公事填字段
- pm2 门禁 + start.js 启动守护——根治 node -e 孤儿进程占端口
- sakuracat-proxy 不独立——manifest 是数据源，agentboard 是视图，不改架构

**变更**: 见 HANDOFF.md

**踩坑**:
- server.js pageShell 内联 CSS 的 Google Fonts 需全局替换 30 处，index.html 修复后内部页面仍残留
- node -e require() 在 Windows 上 app.listen() 保持事件循环不退→孤儿进程占端口→pm2 重启静默失败
- PowerShell inline node -e 的转义灾难（路径反斜杠、$ 展开、引号嵌套）→必须落盘脚本再执行

---

# HANDOFF · 2026-08-25

## 本次完成（会话：治理层收敛 + manifest 灾难恢复 + UI 修复 + 收官沉淀）

**背景**: 上会话（写回收官 ee016a7）交付应用/日志写回。本会话聚焦治理层——回答"设计规范/工程规范还有存在的必要吗"，按唯一真相源收敛。

**本次改动**:
- `agent.md` — 新增三节：治理原则（第一性/永不）、骨件边界（scheduler/supervisor/密钥）、资产边界
- `docs/design-spec.md` + `docs/repo-spec.md` → **归档退场** `docs/archive/`（不物理删，git 保留历史）
- `lib/routes.js` — `/api/registry` 改从真源生成三篇：治理宪法(agent.md) + Manifest Schema(manifest-schema.js 实时字段表) + 真相源索引(指针)；修复 APPS_REG 自引用 bug（env 空→undefined→/api/apps 500）
- `lib/manifest-schema.js` — description 三段式校验（【用途】+【何时用】必填）；描述含【端口】与端口槽位重复→warning（写两处必漂移）
- `web/` — 系统规范页改 3 tab（governance/schema/sources）；**网格辅助层剥除**（8/32/128）；index.html:18 注释改新 API 格式；Supervisor 卡片按钮贴底修复（内容区 flex:1;min-height:0;overflow:hidden + 头尾 flex-shrink:0）
- `docs/使用说明书.html` — 系统规范两处描述改"治理宪法 + 契约 + 索引"
- `tips/*.md` ×4 — backup-restore-path-must-be-verified / node-startjs-killport-silent-exit / ps-match-chinese-false-negative / var-self-reference-init-undefined
- `principles/docs-retire-when-superseded.md` — 被真源覆盖的文档退场不重写
- `D:\workspace\_output\retrospectives\entries\2026-08-25-agentboard-governance-recovery.md` — 复盘：恢复管线 / 治理收敛 / 浏览器实测 / 四坑

## 验证结果
- 系统规范页：API 返回 3 docs、浏览器 3 tab 渲染、无 console 错误（schema 页从代码生成，改字段自动变）
- 网格剥除：DOM 无残留元素、函数未定义、无 console 错误
- 卡片贴底：Supervisor 无溢出、按钮在底、全网格 476 卡零溢出（Chrome DevTools 实测几何）
- manifest 校验：18 个 manifest 恢复后全过三段式校验

## 仓库状态
- 本会话改动待提交（治理收敛 + tips/principle），见 git status
- 未提交（其他工作流）：测试基建 #50（package.json scripts + lib/__tests__/ + coverage/）、`.claude/`、`skills/agentboard-design-system/`、`web/_proto/dashboard-leftnav.backup-preinteraction.html`

## 待办
- **测试基建 #50-55**（node:test + c8 覆盖率管线）— in_progress，独立工作流
- **端口 3080 `/grow` 页**（用户提过"与英雄区拖开 32px"，被重定向未实施，未确认）
- 空状态、响应式 900/600 断点（原型已有，真实页未全对齐）
- 工具架 vs 原型一致性终审（task #59）

## 关键风险
- `tips/` 在 `.gitignore`，新 tips 提交需 `git add -f`
- 本机 bash 工具引号解析坏（`unexpected EOF`），命令用 PowerShell
- **PowerShell 5.1 `-match` 中文假阴性** — 中文检查以 node/UTF-8 为权威（见新 tip）
- `node start.js` 的 npx kill-port 会静默退出 — 启动直接 `node server.js`
- `coverage/` 未 gitignore（c8 输出），提交前注意别误加

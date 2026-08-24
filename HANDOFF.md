# HANDOFF · 2026-08-25

## 本次完成（会话：真实工具架 · 改造为原型板式，壳阶段）

**计划**: `~/.claude/plans/calm-singing-engelbart.md` — 真实工具架吸收原型 `web/_proto/dashboard-leftnav.html` 骨架（左导航 5 页），"先壳后肉"。

**壳阶段 4 文件改动**（全部验证通过）:
- `web/index.html` — 重写为原型骨架：`.sidebar`（logo SVG + 5 nav-item + cnt）+ `.main` + 5 个 `.page`（工具架/我的网站/经验日志/说明书/系统规范）。保留 `<!--STATS_SNAPSHOT-->`、toolFormModal/logModal/grid-ctl/toast。删顶部 header/统计条/5 行 filter-bar/footer
- `web/_style.css` — 原型皮肤：`.sidebar/.hero-bar/.dim-blocks/.tool-card(绿头通栏)/.tip-type/.doc-view/.modal-header(绿)`，保留设计系统 token 与启停/表单样式
- `web/_script.js` — 适配新 DOM + 新页渲染：`showPage(p)` 切页；四维异色 dim-blocks（category/form/owner/state）点击过滤；renderApps/renderTips/renderRegView（懒拉 JSON）；grid JS；绿头卡 renderCard/actionsHtml。S5 工具表单弹窗逻辑原样保留
- `lib/routes.js` — 3 个轻量 JSON 端点：`/api/apps`(apps-registry.json)、`/api/tips`(复用 parseTipFile)、`/api/registry`(docs/design-spec.md+repo-spec.md 原文)、`/manual`(docs/使用说明书.html)。旧 HTML 路由保留

## 验证结果（Edge headless dump-dom）
- 5 页全渲染真实数据：工具 66 卡 / 网站 9 卡 / 日志 404 卡 / 说明书 iframe 渲染(标题"Agent 工具架 · 使用说明书") / 规范页 7 个 h1/h2
- 四维块 4 块，功能分类 7 选项；nav 计数 66/9/404/2
- Golden path：13 张运行卡带"停止"钮、27 张停止卡带"启动"钮（ComfyUI/SD/Ollama 等）、66 编辑钮；编辑弹窗填真实名"工具架 · Agentboard"、新建弹窗空白、关闭 display=none
- 禁色扫描 0（#8B5CF6/#D97706/#3B82F6/#002FA7/#0E1120 仅存于 _proto 原型文件，不在范围）
- server 重启：kill dashboard pid → Supervisor watchdog 30s 内复活，:3099 200

## 已知小问题（预存在，非本次回归，未修）
- 编辑弹窗 ID 锁定行 `#id-val` 恒显"—"（HTML 静态初始值，JS 只切 display 不填值）。ID 在卡片 meta 与 tfSub 均可见，影响轻微。修：openToolForm 里 `id-val.textContent = t.id`

## 仓库状态
- 换皮备份已提交并打 tag `pre-nav`（commit `defed06`）
- 未提交：lib/routes.js、web/index.html、web/_style.css、web/_script.js（本次壳阶段 4 文件）
- 未跟踪：skills/agentboard-design-system/、principles/user-selected-direction-no-resale.md、.claude/

## 待办（里程碑 B，"肉"）
- 统计条（全部/打开中/可打开/未启动/公开站）落位工具页
- publicUrl/已停用(disabled) 筛选并入 dim 块
- 应用/日志/规范页编辑弹窗（写回 apps-registry.json / tips/*.md）
- 排序拖拽、cron 组卡子状态、资源条/操作日志条
- 空状态、响应式 900/600 断点
- 修 `#id-val` 显示

## 关键风险
- tips/ 在 `.gitignore`，新 tips 提交需 `git add -f`
- 原型 `web/_proto/` 不在 `.gitignore`，commit 前 `git diff --cached` 防 staged 残留
- 本机 bash 工具引号解析坏（`unexpected EOF`），命令用 PowerShell

# HANDOFF · 2026-08-23

## 本次完成（会话：dashboard 原型对抗性审查 + 状态筛选 + 字体定稿）
- **对抗性审查修复 4 处**（`git diff 00439a1` 核对搬移）：卡片图标回退首字 `.card-ico`、app 面板 `.b/.b-fn/.b-owner` 徽章 CSS、删 `.btn.open` 死 CSS、注释深蓝→绿
- **状态筛选维度**：DIMS 加第 4 维「状态」运行中/已停止/已停用/仅接入，补齐 `renderTools()` 死代码 F.status UI
- **API 型工具独立"仅接入"语义**：`apiOnly()`（loc远程+API调用+无端口）→ toggle 显示"接入"非"启用"；本地 API 服务（有端口）仍归已停止。DeepSeek/腾讯云归仅接入
- **字体定稿 5 轮迭代**：Cascadia→Consolas→Segoe UI/雅黑→Inter/雅黑→**英文 Inter + 中文宋体（Noto Serif SC→SimSun）**。字号规范：卡片标题 14、其余 12
- **全局清 Arial**：`button,input,select,textarea{font-family:inherit}`（UA 控件字体不继承 body，扫出 17 处）
- **字体名单落盘** `docs/fonts.md`（选入/放弃两栏，防重复引入）
- **tips 2 条**：`html-control-font-not-inherit.md`、`font-render-detection-canvas-width.md`
- **复盘**：`D:\workspace\_output\retrospectives\entries\2026-08-23-dashboard-leftnav-font-status-refactor.md`，INDEX.md 已更新
- **git 提交 `add30f1`**：dashboard-leftnav.html + docs/fonts.md

## 当前状态
- 原型是 file:// mock，未接真 dashboard 数据流
- 状态语义（仅接入/API 型）是原型设计，未落地真实 `web/index.html` + `lib/tool-registry.js`
- `--mono` 变量名名不副实（现指向 sans 栈），后续可改名 `--font`

## 仓库状态
- agentboard: commit `add30f1` 已落，累计 5 组未 push（00439a1/13fe9cc/7a7fd38/79277a3/add30f1）
- 未提交（repo 既有改动，非本会话）：lib/*.js、server.js、start.js、agent.md、README.md、apps-registry.json、ecosystem.config.js(D)、tips/cjk-font-selfhost-gfw.md(M)、.gitignore(M,含 `tips/`)

## 待办
- **#33 live 卡重构为 card-v2.html** — 设计文档已定，待实现
- **#35 自启动剥离 registry** — 删自启动 tab + 卡片补 autoStart 徽标
- 原型改动是否回灌真 dashboard（index.html），待定
- tips/ 在 `.gitignore`（本地未提交改动），新 tips 是否 git 管理待用户定——落盘即工具架 /tips 可见

## 关键风险
- tips/ 目录在 `.gitignore`，新 tips 提交需 `git add -f`，否则静默不进 git
- 原型 `web/_proto/` 不在 `.gitignore`，可直接 add（注意 staged 残留陷阱——commit 前 `git diff --cached`）

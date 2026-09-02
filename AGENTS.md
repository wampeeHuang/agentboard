# Agentboard 宪法

## 架构

```
~/.agentboard/
├── README.md             项目入口（人读，Quick Start / 治理入口）
├── LICENSE               许可
├── .gitignore            忽略规则
├── package.json          依赖（express + MCP SDK）
├── package-lock.json
├── AGENTS.md              治理宪法（本文件）
├── CLAUDE.md             Claude 适配层（@AGENTS.md）
├── inspection.json       巡检检查项
├── server.js             REST + Dashboard 装配（:3099）
├── start.js              启动入口（kill-port → server.js）
├── lib/                  后端核心（双平面共享）
│   ├── routes.js         REST 路由（/api/*、7 页、挂载 /mcp）→ /api/registry 从真源生成（AI 面）
│   ├── tool-registry.js  核心逻辑：scanTools 三段验证 / 启停 / 端口查重
│   ├── manifest-schema.js Manifest 契约唯一真相源（字段 / 分类 / 校验）
│   ├── mcp-http.js       MCP Streamable HTTP（POST /mcp，JSON-RPC 2.0）
│   ├── mcp-handlers.js   6 个 agentboard_* MCP 工具
│   ├── static.js / api-page.js / self-check.js / ops-log.js / crash-guard.js / tip-schema.js / apps-schema.js / principle-schema.js / brand-drift.js / tree-drift.js / docs-fresh.js / schema-loader.js
│   ├── __tests__/        冒烟测试（node:test）
│   │   ├── helpers.js     测试工具
│   │   ├── fixtures.js    测试夹具
│   │   └── smoke.test.js  冒烟入口
├── web/                  Dashboard 前端
│   ├── index.html        7 页（工具架 / 能力地图 / 我的网站 / 经验日志 / 原则库 / 治理审计 / 说明书）
│   ├── _tokens.css       品牌 token 唯一银行（换肤改这一个文件）
│   ├── _style.css        组件 + 页面级样式（引用 _tokens.css 变量）
│   ├── _script.js        渲染 / 交互
│   ├── shared/           tips 面板 + 图标资源（tips-panel.css · tips-panel.js · logo-lib.js · icon-lib.js · logos/）
│   ├── capability-map.svg  能力图谱（全局宪法 tab）
│   └── logo.svg
├── .claude/              Claude Code 项目级配置（settings.local.json，仅权限放行，不进版本库）
├── tools/                工具架卡（宪法 = 本文件；形状 = lib/manifest-schema.js）
├── apps/                 我的网站卡（宪法 = apps/CONSTITUTION.md；形状 = lib/apps-schema.js）
├── examples/             tools 卡模板（copy 到 tools/）
├── tips/                 经验日志卡（宪法 = tips/CONSTITUTION.md；形状 = lib/tip-schema.js）
├── principles/           原则库卡（宪法 = principles/CONSTITUTION.md；形状内嵌宪法 §四）
├── docs/                 文档（不带 archive）
├── mechanisms/           系统机制说明
├── state/                运行态（api-calls · commands 快照）
├── _runtime/             运行态仓（gitignored，草稿有归属勿丢根层）
│   ├── logs/             运行日志（restart / cleanup）
│   ├── crash/            崩溃现场
│   ├── inputs/           用户投料（改版参考等，**永不自动清**）
│   ├── work/             AI 会话草稿（超 3 天清，AgentboardCleanup 登录触发）
│   ├── pids/             进程身份凭证
│   ├── CHECKPOINT.md     状态变更快照（hook 写）
│   └── events.jsonl      运行事件流
└── archive/              退场归档（可删的留存区，担心删早了先留；唯一一处）

（省略 .git/、node_modules/、coverage/ 等非架构目录。全局 skills 是外部只读资源，不在本目录树内。）
```

**双平面架构**: MCP (AI plane) + REST (human plane)，共享同一真相源 `tools/*/manifest.json`。

| 平面 | 协议 | 传输 | 消费者 |
|------|------|------|--------|
| 工具面 (MCP) | JSON-RPC 2.0 over Streamable HTTP | `lib/mcp-http.js` (POST /mcp) | AI agent (Claude Code, Cursor 等) |
| 管理面 (REST) | HTTP | `server.js:3099` | 人 (dashboard), 脚本, 外部系统 |

MCP 工具: `agentboard_list_tools`, `agentboard_get_tool`, `agentboard_start_tool`, `agentboard_stop_tool`, `agentboard_create_tool`, `agentboard_update_tool`。注册在 `~/.claude/settings.json` → `mcpServers.agentboard`。

工具卡片来源：
- **manifest.json** — `~/.agentboard/tools/*/manifest.json`，一个目录一个工具
- **cron-scheduler** — manifest 注册，`type: "group"`。日报状态来自 `/api/cron/state`（代理到 localhost:3100 调度器）

### 进程身份层

工具运行状态不只看端口，有三段验证（`lib/tool-registry.js` → `scanTools`）：

```
端口活跃？→ 读 _runtime/pids/{id}.pid → process.kill(pid,0) 存活？→ running=true
                                  ↘ PID 死 → 清过期文件 → 进程名兜底验证
```

端口活跃 ≠ 工具在运行。PID 文件是 agentboard 启动工具时写入的身份凭证。无 PID 文件的工具（外部启动）退回到进程名检测。

**启动**：`spawn` → 写 `_runtime/pids/{id}.pid` → 轮询端口 + PID 存活双重确认（15s）→ 清 scan 缓存
**停止**：读 PID 文件 → `taskkill /PID {pid} /T /F` 精确杀进程树 → 失败回退 `stopCommand` → 清 PID 文件 + 缓存
**端口查重**：`createTool` / `updateTool` 写入前强制绕过缓存扫描，端口被占当场拦截（`checkPortUnique`）

### 运行数据边界（state/ vs _runtime/）

两个 gitignored 运行数据目录，职责与保留期不同，禁止混用：

| 目录 | 内容 | 保留契约 | 清理器 |
|---|---|---|---|
| `state/` | 可查询的运行快照：`api-calls/*.jsonl`（月度 API 调用日志）、`commands.json`、`skill-order.json` | `state/api-calls/` **30 天**；`commands*` / `skill-order` 为当前状态快照，保留 | `scripts/cleanup-runtime.ps1`（state 段） |
| `_runtime/` | 短期过程现场：`work/`（中间草稿）、`logs/`、`crash/`、`pids/`、`inputs/`（参考材料）、`events.jsonl` | `work/` **3 天**；`inputs/` 参考材料永不自动清；`logs/` 自轮转 | `scripts/cleanup-runtime.ps1`（work 段） |

边界规则：**可查询的快照进 `state/`，一次性过程现场进 `_runtime/`**。二者都不可当作永久归档（永久归档进 `archive/`，且有备份语义）。清理只由 `scripts/cleanup-runtime.ps1` 执行，禁止 agent 随手删运行数据。

## 工具调用协议

AI agent 通过 **MCP** 调工具（`lib/mcp-http.js`，Streamable HTTP，`POST /mcp`），标准 JSON-RPC 协议。
人通过 **Dashboard**（`http://localhost:3099/`）观察和控制，保持可见性。

**每次操作工具前必须查 `/api/tools`**（或 MCP `agentboard_get_tool`），不只是看 `running` 状态，还要读两个字段：

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

### 模型路由

代码/编程/Agent/截图→前端等任务，**先查工具架再选模型，不许直接走默认模型**。

**路由规则**：
1. `agentboard_list_tools` → 筛选 `category="模型"`
2. 按当前任务意图匹配 `capability` + `models[].type` + `models[].features`
3. 命中 → 读该工具的 `apiBase` + `apiKeyName` + `agent_notes`（含 key） → 调 API
4. 未命中 → 走 Claude Code 默认模型

**路由信息来源**（都在 manifest 里，不改第二处）：
- `category` — 筛出模型类工具
- `capability` — 一句话判断工具能干什么
- `models[].type` — 文本/图片/视频，匹配任务模态
- `models[].features` — 具体场景关键词（"Coding""截图→代码""长程Agent"）

工具架 manifest 是唯一真相源。新增模型只改 manifest，路由自动生效。

### 新工具注册（不可跳过）

**安装或配置任何本地工具后，第一件事是写 manifest：**

```
1. 确认工具已安装、配置完成、可正常工作
2. 在 ~/.agentboard/tools/{id}/ 下建 manifest.json
3. curl localhost:3099/api/tools 确认可见
4. 之后才考虑是否在 memory 留指针（不是工具定义本身）
```

工具定义不进 memory。架子是唯一真相源。

## 治理原则

**第一性**（一切设计决策的判据）：
- **Agent-first** — 功能先有 API 端点，UI 是 API 的渲染
- **File-first** — 文件系统是数据库。manifest.json 是注册表。不引入 SQLite/MongoDB
- **Local-first** — 不依赖云服务。不要求登录。不连外网
- **Protocol over implementation** — 先定义 schema 再写代码，字段变更先改 schema 再改实践

**本机定位**：工具架 ≤500 工具、单用户。不设技术禁用清单——出现真实硬需求就引入，重大技术决策写进 AGENTS.md。

## 骨件边界

agentboard 是骨件，不是全部。兄弟骨件各管一段，本骨件只代理/只读，不越界：

| 边界 | 归属 | agentboard 的动作 |
|------|------|------------------|
| 定时任务 | `~/.scheduler` 骨件（:3100） | 只读 scheduler-state.json 做面板展示；不存 SQLite、不写 jobs.json |
| 进程守护 | `~/.supervisor` 骨件（:3097） | 不守护自己。agentboard 唯一守护 = supervisor |
| 模型/密钥 | `tools/*/manifest.json` | 只读 apiKeyName 指向的环境变量，不存密钥副本 |

## 资产边界

- Agentboard 自身资产全部在 `~/.agentboard/`，不分裂
- `~/.claude/` 只保留 Claude Code 原生文件（宪法、skills、memory）。Agentboard 可以读、展示、索引，但不写入、不修改、不复制
- Skills、全局宪法对 Agentboard 是只读索引

## 红线

- **禁止删除 `tools/` 下的任何 manifest 目录**，除非用户逐文件确认
- 用户说"删卡片"≠授权删文件。先问：隐藏还是删除？如果要删，列清单等确认
- 改动前先 `curl localhost:3099/api/tools` 看现状
- **会话 cwd 不得落在 `_runtime/` 内**——否则 checkpoint hook 会写出嵌套的 `_runtime/_runtime/CHECKPOINT.md`。跨目录操作用绝对路径

## 操作日志

- 写入路径：`~/.agentboard/tips/*.md`
- **不要写到 `~/.claude/tips/`** — agentboard 不读那个目录
- **写入前必须先读 `tips/CONSTITUTION.md`** — 格式、分类、准入五问的唯一真相源

## 运行生命周期

- **草稿有归属**：用户投喂参考（截图/资料）丢 `_runtime/inputs/`（**永不自动清**——投料是输入，清掉丢用户的输入）；AI 会话草稿（临时文件/验证脚本）丢 `_runtime/work/`。勿丢根层——清理器只认白名单子目录，散落文件没人管会积成垃圾
- 清理：`scripts/cleanup-runtime.ps1` 读 `scripts/cleanup-runtime.config.json`（阈值单源），只清 `work/`（超 3 天），**永不碰 `inputs/`、`pids/`、`logs/`**。Task Scheduler `AgentboardCleanup` **登录触发**（开机登录即清理，不依赖定时开机）；`-DryRun` 先演练
- `_runtime/CHECKPOINT.md` 由 checkpoint hook 写入，有实时消费者，勿删勿移

## 服务器

- 端口 3099，进程 `dashboard`
- 进程守护由 Supervisor 管理，详见 `~/.agentboard/tools/supervisor/manifest.json`
- manifest 改动无需重启，每次请求都会重新扫描

## 巡检

巡检标准: `~/.inspector/projects-registry.json` — 本项目受 Inspector 巡检，检查项定义在 `inspection.json`

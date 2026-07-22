# Agentboard 宪法

## 架构

```
~/.agentboard/
  server.js          ← REST API + Dashboard (人对 AI 的观察窗口)
  mcp-server.js      ← MCP JSON-RPC/stdio (AI 调工具的标准协议)
  index.html          ← 工具架前端
  tools/*/manifest.json  ← 工具注册（唯一真相源）
  tips/*.md           ← 踩坑沉淀（唯一真相源）
  mechanisms/*.md     ← 系统机制说明（唯一真相源）
  runtime/*.pid        ← 进程身份文件（启动时写入，停止时清理）
  apps-registry.json  ← 公网应用注册表
  cron/tasks.db       ← cron 任务运行时状态（SQLite）
```

**双平面架构**: MCP (AI plane) + REST (human plane)，共享同一真相源 `tools/*/manifest.json`。

| 平面 | 协议 | 传输 | 消费者 |
|------|------|------|--------|
| 工具面 (MCP) | JSON-RPC 2.0 over stdio | `mcp-server.js` | AI agent (Claude Code, Cursor 等) |
| 管理面 (REST) | HTTP | `server.js:3099` | 人 (dashboard), 脚本, 外部系统 |

MCP 工具: `agentboard_list_tools`, `agentboard_get_tool`, `agentboard_start_tool`, `agentboard_stop_tool`, `agentboard_create_tool`, `agentboard_update_tool`。注册在 `~/.claude/settings.json` → `mcpServers.agentboard`。

工具卡片来源：
- **manifest.json** — `~/.agentboard/tools/*/manifest.json`，一个目录一个工具
- **cron-scheduler** — manifest 注册，`type: "group"`。日报状态来自 `/api/cron/state`

### 进程身份层

工具运行状态不只看端口，有三段验证（`lib/tool-registry.js` → `scanTools`）：

```
端口活跃？→ 读 runtime/{id}.pid → process.kill(pid,0) 存活？→ running=true
                                  ↘ PID 死 → 清过期文件 → 进程名兜底验证
```

端口活跃 ≠ 工具在运行。PID 文件是 agentboard 启动工具时写入的身份凭证。无 PID 文件的工具（PM2 托管、外部启动）退回到进程名检测。

**启动**：`spawn` → 写 `runtime/{id}.pid` → 轮询端口 + PID 存活双重确认（15s）→ 清 scan 缓存
**停止**：读 PID 文件 → `taskkill /PID {pid} /T /F` 精确杀进程树 → 失败回退 `stopCommand` → 清 PID 文件 + 缓存
**端口查重**：`createTool` / `updateTool` 写入前强制绕过缓存扫描，端口被占当场拦截（`checkPortUnique`）

```
~/.agentboard/
  runtime/*.pid       ← 进程身份文件（agentboard 启动时写入，停止时清理）
```

## 工具调用协议

AI agent 通过 **MCP** 调工具（`mcp-server.js`，stdio），标准 JSON-RPC 协议。
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

## 红线

- **禁止删除 `tools/` 下的任何 manifest 目录**，除非用户逐文件确认
- 用户说"删卡片"≠授权删文件。先问：隐藏还是删除？如果要删，列清单等确认
- 改动前先 `curl localhost:3099/api/tools` 看现状

## 操作日志

- 写入路径：`~/.agentboard/tips/*.md`
- **不要写到 `~/.claude/tips/`** — agentboard 不读那个目录
- **写入前必须先读 `tips/CONSTITUTION.md`** — 格式、分类、准入五问的唯一真相源

## 服务器

- 端口 3099，进程 `dashboard`
- 进程守护由 Supervisor 管理，详见 `~/.agentboard/tools/supervisor/manifest.json`
- manifest 改动无需重启，每次请求都会重新扫描

## 巡检

巡检标准: `~/.inspector/projects-registry.json` — 本项目受 Inspector 巡检，检查项定义在 `inspection.json`

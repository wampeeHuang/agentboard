# 工程规范

> 定义文件边界、落盘规则、技术选型和决策框架。
> 设计规范见 [design-spec.md](design-spec.md)。

---

## 一、文件边界

```
~/.agentboard/               ← Agentboard 全部领土（唯一真相源）
├── server.js                ← REST API + Dashboard
├── mcp-server.js            ← MCP JSON-RPC/stdio（AI 平面）
├── index.html               ← Web Dashboard
├── api-page.js              ← API 文档页
├── apps-registry.json       ← 公网应用注册表
├── inspection.json          ← 巡检配置
├── lib/                     ← 共享模块（tool-registry, manifest-schema, ops-log）
├── CLAUDE.md                ← Agentboard 宪法（工具调用协议）
├── design-spec.md           ← 设计规范
├── repo-spec.md             ← 本文件
├── GLOBAL.md                ← 全局宪法指针 → ~/.claude/CLAUDE.md
├── PATROL.md                ← 巡查规则
├── HANDOFF.md               ← 会话交接（gitignore）
├── launch.bat / launch.vbs  ← 启动脚本
├── package.json             ← 仅 express 一个依赖
├── tools/                   ← 工具注册表（多 Agent 共享）
├── tips/                    ← 操作日志（多 Agent 共享）
├── state/                   ← 运行时状态（crash 不丢）
├── node_modules/
└── _runtime/                ← 临时文件（会话级，可丢弃）
    └── ops-log.jsonl        ← 运维日志（JSONL，1000 行轮转）

完整清单以磁盘为准：ls ~/.agentboard/

~/.scheduler/                ← 定时调度（独立骨件）
~/.claude/skills/            ← Claude Code 专属，Agentboard 只读展示
~/.claude/CLAUDE.md          ← 全局 Agent 行为宪法，Agentboard 只索引
```

**消费者规则：**

| 资源 | 拥有者 | 存放位置 | Agentboard 角色 |
|------|--------|---------|---------------|
| 工具注册表 | Agentboard | `~/.agentboard/tools/` | 拥有 |
| 运行时状态 | Agentboard | `~/.agentboard/state/` | 拥有 |
| 操作日志 | Agentboard | `~/.agentboard/tips/` | 拥有 |
| Server 代码 | Agentboard | `~/.agentboard/` | 拥有 |
| Skills | Claude Code | `~/.claude/skills/` | **只读索引** |
| 全局宪法 | Claude Code | `~/.claude/CLAUDE.md` | **只读索引** |

**边界规则：Agentboard 自身资产全部在 ~/.agentboard/，不分裂。~/.claude/ 只保留 Claude Code 原生文件。Agentboard 可以读、展示、索引 Claude Code 的资产，但不写入、不修改、不复制。**

## 二、落盘规则

### 全项目维度

```
C:\Users\Administrator\          ← 只放 dot-config 文件，禁止散落项目文件
├── .claude/                     ← Claude Code 全局配置（宪法、skills、memory）
├── .agentboard/                 ← 工具架全部领土
├── .openclaw/                   ← OpenClaw Gateway 配置、cron jobs、日志
├── .config/ / .cache/ / .local/ ← 各工具标准 XDG 目录
└── _runtime/                    ← 跨项目临时文件和共享数据仓库（见下）
```

### 项目代码落盘规则

| 项目类型 | 落盘位置 | 示例 |
|---------|---------|------|
| 长期开发项目 | `D:\workspace\YYYY-MM-DD-项目名` | `D:\workspace\2026-06-14-evopearl-admin` |
| 临时实验 | `<项目>/_runtime/` | `D:\...\项目名\_runtime\experiment.py` |
| 共享数据仓库 | `C:\Users\Administrator\_runtime\<repo-name>` | `_runtime\evopearl-data` |

### 文件按类型落盘

| 文件类型 | 落盘位置 | 生命周期 |
|---------|---------|---------|
| 项目源码 | `<项目目录>/src/` | 永久 |
| 项目文档 | `<项目目录>/docs/` | 永久 |
| 临时脚本 | `<项目目录>/_runtime/` | 任务结束删除 |
| 截图/预览 | `<项目目录>/_runtime/screenshots/` | 任务结束删除 |
| 数据转储 JSON | `<项目目录>/_runtime/data/` | 任务结束删除 |
| 运维脚本（复用型） | `~/.agentboard/cron/` | 永久 |
| 配置文件 | 工具自身的 config 目录 | 永久 |
| 日志 | 工具自身的 logs 目录 | 按 retention 清理 |

### 红线

```
禁止在以下位置放置项目文件：
  ✗ C:\Users\Administrator\               （根目录，dot-config 除外）
  ✗ C:\Users\Administrator\Desktop\        （桌面不是工作区）
  ✗ C:\                                     （盘符根目录）
  ✗ 任何临时文件夹没有子目录就直接平铺文件
```

### 临时文件生命周期

1. `_runtime/` 内的文件是**会话级**的，Agent 任务结束后应自行删除
2. 嵌套目录 OK（`_runtime/screenshots/`、`_runtime/data/`），平铺不行
3. 如果文件需要在多次会话间复用 → 它不该在 `_runtime/`，应移到项目 docs/ 或 tools/ 配置目录

## 三、技术选型

| 选型 | 决策 | 原因 |
|------|------|------|
| 运行时 | Node.js（仅 express 一个依赖） | 零构建 |
| 前端 | 单文件 HTML + Vanilla JS | Agent 可读源码 |
| 数据存储 | JSON 文件 + JSONL 日志 | 人可读，Agent 可直接写 |
| 通信 | REST + HTTP 轮询 | 简单可靠，Agent 可直接 curl |
| 进程管理 | child_process.exec | 不引入 pm2/systemd 依赖 |

## 四、操作日志分类标准

每条日志必带三个分类维度：

| 维度 | 字段 | 枚举 | 分类依据 |
|------|------|------|---------|
| **谁调的** | `caller` | `agent` \| `browser` \| `unknown` | UA 匹配 |
| **什么操作** | `action` | `list` \| `detail` \| `control` \| `admin` | path+method |
| **哪个工具** | `target` | tool-id \| null | 从 path 提取 |

`/api/stats` 按这三个维度输出：`byCaller`、`byAction`、`byTool`。

## 五、决策框架

遇到设计分歧时，用这条决策链：

```
① 这个功能是给 Agent 用的还是给人用的？
   → Agent：先有 API。人：先有 UI。

② 这个数据是 Agentboard 自己的还是 Claude Code 的？
   → Agentboard 自己：落盘到 ~/.agentboard/
   → Claude Code 的：只读索引，不写入

③ 这个功能只有一个 Agent 需要还是多个 Agent 需要？
   → 单个：放在那个 Agent 自己的目录
   → 多个：进 ~/.agentboard/

④ 这个复杂度值得吗？
   → v1.0 只做 38 个工具够用的方案
   → v2.0 才考虑 500 个工具的优化
```

## 六、备份与恢复

### 自己的仓库（每日 push）

核心仓库（必备份）：

| 仓库 | 内容 | 恢复路径 |
|------|------|---------|
| [agentboard](https://github.com/wampeeHuang/agentboard) | Agentboard 项目 | `~/.agentboard/` |
| [claude-config](https://github.com/wampeeHuang/claude-config) | CLAUDE.md + 全局配置 | `~/.claude/` |
| [claude-tools](https://github.com/wampeeHuang/claude-tools) | 工具注册表 | `~/.agentboard/tools/` |
| [claude-skills](https://github.com/wampeeHuang/claude-skills) | 技能大包 | `~/.claude/skills/` |

技能仓库完整清单以 GitHub 为准：`gh repo list wampeeHuang`

### 第三方技能

第三方技能不备份到自己的 GitHub。每个 SKILL.md 底部标注了 `> **来源:** <URL>`。崩溃后按来源 URL 逐个 `git clone` 即可。

### 崩溃恢复

```bash
git clone https://github.com/wampeeHuang/claude-config.git ~/.claude/
git clone https://github.com/wampeeHuang/claude-skills.git ~/.claude/skills/
git clone https://github.com/wampeeHuang/claude-tools.git ~/.agentboard/tools/
git clone https://github.com/wampeeHuang/agentboard.git ~/.agentboard/
# settings.json 含 API key，手动恢复
```

---

*设计规范见 [design-spec.md](design-spec.md)。全局 Agent 行为规则见 [GLOBAL.md](GLOBAL.md)。*

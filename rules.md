# 管理规则

> 定义文件边界、落盘规则、技术选型和决策框架。
> 设计原则见 [constitution.md](constitution.md)。

---

## 一、文件边界

```
~/.agentboard/               ← Agentboard 全部领土（唯一真相源）
├── server.js                ← 主服务
├── index.html               ← Web Dashboard
├── api-page.js              ← API 文档页
├── apps-registry.json       ← 公网应用注册表
├── constitution.md          ← 设计宪法
├── rules.md                 ← 本文件
├── GLOBAL.md                ← 全局宪法指针 → ~/.claude/CLAUDE.md
├── PATROL.md                ← 巡查规则
├── README.md                ← 项目说明
├── LICENSE                  ← MIT
├── logo.svg / logo.ico      ← 品牌资产
├── launch.bat / launch.vbs  ← 启动脚本
├── tools/                   ← 工具注册表（多 Agent 共享）
├── tips/                    ← 操作日志（多 Agent 共享）
├── state/                   ← 运行时状态（crash 不丢）
├── cron/                    ← 定时任务配置
├── package.json             ← 仅 express 一个依赖
├── node_modules/
└── _runtime/                ← 临时文件（会话级，可丢弃）

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

| 数据 | 落盘位置 | 理由 |
|------|---------|------|
| API 调用日志 | `~/.agentboard/state/call-log.jsonl` | crash 不丢 |
| 健康检查历史 | `~/.agentboard/state/health-history.jsonl` | crash 不丢 |
| Agentboard 配置 | `~/.agentboard/state/config.json` | 独立于 Claude settings.json |
| 当前状态快照 | `~/.agentboard/state/status.md` | 不污染宪法文件 |
| 临时文件 | `~/.agentboard/_runtime/` | 会话级，可丢弃 |

## 三、技术选型

| 选型 | 决策 | 原因 |
|------|------|------|
| 运行时 | Node.js（仅 express 一个依赖） | 零构建 |
| 前端 | 单文件 HTML + Vanilla JS | Agent 可读源码 |
| 数据存储 | JSON 文件 + JSONL 日志 | 人可读，Agent 可直接写 |
| 通信 | REST + 轮询（v1.0）→ WebSocket（v2.0） | 先简单，后实时 |
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

---

*设计原则见 [constitution.md](constitution.md)。全局 Agent 行为规则见 [GLOBAL.md](GLOBAL.md)。*

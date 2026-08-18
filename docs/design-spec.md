# 设计规范

> 定义工具架的 UI/UX 设计原则和架构约束。
> v1.0 哲学：文件即注册，状态即界面
> v2.0 哲学：本机是唯一控制面，Cloud 是影子

---

## 一、第一性原则

| 原则 | 规则 | 违反示例 |
|------|------|---------|
| **Agent-first** | 所有功能先有 API 端点，UI 是 API 的渲染 | 直接在 UI 里写业务逻辑 |
| **File-first** | 文件系统是数据库。manifest.json 是注册表。不引入 SQLite/MongoDB | 在 server.js 里引入数据库依赖 |
| **Local-first** | 不依赖云服务。不要求登录。不连外网 | 加入 OAuth/云同步功能 |
| **Protocol over implementation** | 先定义 schema，再写代码。manifest 字段有明确定义 | 临时加字段不更新 UTP 文档 |

## 二、架构三层

```
交互层 — Web Dashboard + REST API     ← 人和 Agent 共享同一真相源
管理层 — 启停 + 健康检查 + 状态推送    ← 控制平面，MCP 不做的事
发现层 — 文件扫描 + Agent 自注册       ← 文件系统就是注册表
──────────────────────────────────
UTP — manifest schema + 三个契约       ← 定义"可插拔的工具长什么样"
```

三层各自独立。交互层换框架不影响管理层。管理层换实现不影响发现层。

## 三、三个契约

| 契约 | 定义 | Manifest 字段 |
|------|------|--------------|
| **Interface** | 怎么和工具交互 | `interface: { type, localDev, production }` |
| **Lifecycle** | 怎么启动/停止/判断活着 | `lifecycle: { start, stop, health }` |
| **Capability** | 能干什么 | `capability: { summary, modalities }` |

## 四、设计约束

- **中文优先。** 界面、文档、manifest 描述、commit message——全部中文。语言规则见宪法 [CLAUDE.md](%USERPROFILE%/.claude/CLAUDE.md)。这是一个中文优先的项目——它的设计语言、排版节奏、信息密度都以中文字符为基准，不是英文的翻译版。
- **瑞士极简。** 不加动画。不加渐变。不加阴影。内容即界面。
- **零构建。** index.html 是单文件。server.js 是单文件。不需要 webpack/vite。
- **单机优先。** 不设计分布式功能。多机管理是 v3.0。
- **单用户。** 不设计 RBAC。权限管理是 v3.0。
- **≤500 工具。** 不优化超过 500 个工具的筛选体验。那是另一个产品。

## 五、永不

- 永不引入数据库（SQLite、MongoDB、Redis）
- 永不引入 Docker 依赖
- 永不引入前端框架（React、Vue、Svelte）
- 永不做用户认证（OAuth、JWT、Session）
- 永不做云端同步
- 永不融资
- 永不做 SaaS
- 永不替代 MCP

## 六、骨件边界

agentboard 是一个骨件，不是全部。兄弟骨件各管一段，本骨件只代理/只读，不越界：

| 边界 | 归属 | agentboard 的动作 |
|------|------|------------------|
| 定时任务 | ~/.scheduler 骨件（:3100） | 只读 scheduler-state.json 做面板展示；不存 SQLite、不写 jobs.json |
| 进程守护 | ~/.supervisor 骨件（:3097） | 不守护自己。agentboard 唯一守护 = supervisor（supervisor.js 30s 探活 + guard.ps1 5min 敲门） |
| 模型/密钥 | tools/*/manifest.json | 只读 apiKeyName 指向的环境变量，不存密钥副本 |

三条红线：
- 永不存 SQLite（cron 状态委托 scheduler，见"五、永不"）
- 永不守护自己（supervisor 管，agentboard 不 spawn 自己的守护进程）
- 永不写 ~/.scheduler/jobs.json（走 scheduler CLI / REST API）

---

*工程规范见 [repo-spec.md](repo-spec.md)。全局 Agent 行为规则见 [GLOBAL.md](GLOBAL.md)。*

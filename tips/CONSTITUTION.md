# 操作日志宪法

> 定义什么值得记、怎么写、什么不记。

---

## 一、准入标准（五问）

写入前逐条过。五条全过才落盘，一条不过就放弃。

| # | 问题 | 通过标准 | 不通过示例 |
|---|------|---------|-----------|
| 1 | **可复用吗** | 能帮助未来解决同类问题 | "6月12日重启了3次服务器"——一次性记录 |
| 2 | **非显然吗** | 合格开发者从代码/文档推断不出 | "Express 用 app.get() 注册路由"——查文档就有 |
| 3 | **学习成本高吗** | 踩这个坑花了 30 分钟以上才定位 | "少了个分号"——一眼就能看到 |
| 4 | **跨会话有价值吗** | 换一个任务、换一个 Agent，仍然有用 | "用户喜欢蓝色"——个人偏好 |
| 5 | **可操作吗** | 给出了下次怎么做不同的具体指令 | "localStorage 很坑"——模糊，没有行动指引 |

### 优先级速判

```
花了 1h+ 才定位的 bug → 必写
同一模式踩过 ≥2 次 → 必写
违反直觉的反转（API 200 ≠ 页面正常）→ 必写
看了代码就能知道的 → 不写
纯操作日志 → 不写
```

---

## 二、格式规范

### 文件结构

```markdown
# 一句话标题（洞察，不是主题）
type: diagnosis | method | fact
date: YYYY-MM-DD
source: 触发写入的事件/任务简述

## 现象
（你看到了什么）

## 根因
（为什么发生——diagnosis必填，method/fact可省略）

## 修复/步骤
（怎么修好的 / 怎么做）

## 预防
（下次怎么避免）
```

### 分类标准

三类，同一维度：**这条日志回答什么问题**。

| 分类 | 回答什么 | 判定 | 示例 |
|------|---------|------|------|
| `diagnosis` | 为什么X会这样？ | 因果链：从现象追溯到根因 | gh超时但git正常 → 因为gh不走git proxy |
| `method` | 怎么做X？ | 可执行的步骤序列 | 备份顺序：.claude.json → tools/ → skills/ |
| `fact` | X在哪/是什么？ | 具体数据：路径、版本、架构 | 工具注册在 ~/.agentboard/tools/ 下 |

互斥检验：一条日志不可能同时主要回答"为什么"又主要回答"怎么做"——诉求不同，写出来重点不同。

### 格式约束

- type 必填
- 一个文件一个洞察。不要合集
- 100 行以内。超过说明拆得不够细
- 中文为主，代码/变量名英文
- 文件名用 kebab-case，语义化

---

## 三、不写入清单

| 类别 | 判断标准 | 放哪 |
|------|---------|------|
| 项目设计文档 | 描述系统怎么设计的 | `design-spec.md` |
| 当前状态快照 | 工具数、端口号、运行状态 | `state/` — 自动落盘 |
| 代码逻辑 | 能从代码本身读懂的 | 代码就是真相源 |
| 操作历史 | 谁在什么时候做了什么 | `state/call-log.jsonl` |
| CLAUDE.md 已有 | 行为规则、项目约定 | 已在 CLAUDE.md |
| Git 已记录 | commit message 说清楚了的 | git log |

---

## 四、维护规则

- **过期即删。** 路径变了、API 变了、不再适用的——直接删除，不留"历史参考"
- **发现即修。** 读到一个 tip 发现有错——立刻改，不等下次
- **重复即合并。** 同一个 insight 两个文件——合并为一个，删另一个
- **不凑数。** 3 条高质量 > 30 条流水账

---

## 五、当前日志清单

| 文件 | type | 状态 |
|------|------|------|
| `gh-cli-proxy.md` | diagnosis | ✅ |
| `double-serverjs.md` | diagnosis | ✅ |
| `cloud-reset-lessons.md` | diagnosis | ✅ |
| `agentboard-tools-lifecycle.md` | method | ✅ 路径已修正为 ~/.agentboard/ |
| `backup-strategy.md` | method | ⚠️ 基于旧版 .claude/ 布局，部分过时 |
| `agentboard-architecture.md` | fact | ⚠️ 部分内容与 design-spec.md 重叠 |
| `cron-run-ok-means-nothing.md` | diagnosis | ✅ |
| `api-prefix-mismatch-silent-fail.md` | diagnosis | ✅ |
| `phone-frame-safe-area-scrim.md` | diagnosis | ✅ |
| `utf8-bom-breaks-http-headers.md` | diagnosis | ✅ |
| `windows-dual-port-bind.md` | diagnosis | ✅ |
| `cron-unpinned-model-output-shrink.md` | diagnosis | ✅ |
| `session-server-side-expiry.md` | diagnosis | ✅ |
| `python-thread-flag-race.md` | diagnosis | ✅ |
| `mcp-no-auto-retry.md` | diagnosis | ✅ |
| `windows-gbk-python-io.md` | diagnosis | ✅ |
| `node-spawn-cmd-powershell-path.md` | diagnosis | ✅ |
| `tool-relocation.md` | method | ✅ |
| `git-init-default-branch-main.md` | diagnosis | ✅ |
| `gitmodules-chinese-encoding-corruption.md` | diagnosis | ✅ |
| `git-first-commit-project-dating.md` | method | ✅ |
| `script-tag-injection-js-exposed.md` | diagnosis | ✅ |

---

*本宪法约束操作日志的写入和维护。每次想记一条时先读这个文件。*

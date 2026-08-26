# 卡片数据契约 — 工具架卡片到底呈现什么

> 盘点结果（2026-08-21 实测 66 manifest）+ 外部调研（Shadcn 状态卡 / Kubestellar console / 两段式卡）合成。
> 原则：**每张卡渲染自同一份 manifest 字段 + 运行时状态，所有状态共用一张卡，不硬塞，细节进展开层。**
> 前端 schema = 卡片槽位 ↔ manifest 字段 的固定映射（同 Obsidian SCHEMA 硬要求 frontmatter）。

---

## 1. 数据盘点（实测：66 manifest，0 损坏）

### 字段出现率（= 有多少工具真的有这个字段）

| 字段 | 出现率 | 说明 |
|---|---|---|
| `name` `description` `category` `owner` `agent_notes` `capability` | **100%** | 六必填全齐 |
| `id` `icon` `version` `order` | ~95% | 身份元数据 |
| `startCommand` | 78% | 可启动 |
| `url` | 74% | 可打开 |
| `runtime` `stopCommand` `projectPath` | ~70% | 运维 |
| `port` | 56% | 有端口 |
| `type` | 33% | cli 11 / service 11，其余 44 靠端口/命令推断 |
| `autoStart` `disabled` | ~25% | 开关 |
| `apiBase` `apiKeyName` `publicUrl` | 10% | AI 调用 / 公网 |
| `models` `trigger` | ~8% | 模型列表 / 命令触发词 |

### description 已是结构化（关键发现）

description 全部 ≥10 字，且已内建用户三段式：
```
【用途】= 功能（这工具干嘛）
【何时用】【何时不用】= 何时调用（用不用它）
【返回】= 调用方式（调它拿什么）
```
**用户要的「功能 / 调用方式 / 何时调用」已经写在数据里了** —— 卡片缺的只是按字段渲染，不是再造字段。

### 3 个异常（无 port 无 command 非 folder/group）

`confucius4-tts` `feishu-whiteboard-read` `figma-mcp` —— 纯 API/MCP 型，靠 url/apiBase。契约里「调用方式」字段兜底。

---

## 2. 卡片槽位 ↔ 数据字段（前端 schema）

一张卡，两段式。紧凑态 5 行槽位 P0-P4（外部 Shadcn 状态卡范式 + 施工方案 §2 / 原型对齐，洞 3 已统一），点开展开全部 frontmatter。

### 紧凑卡（默认可见，5 行槽位）

```
┌───────────────────────────────────┐
│ [mono/icon] 名字              [状态chip]│ ← P0 身份（icon + name + id）
│ ● 状态字 · 调用 :3099               │ ← P1 状态双显 + meta（port/trigger/文件夹）
│ [分类] [owner] [form]              │ ← P2 标签
│ 功能一句话（【用途】2 行截断）        │ ← P3 描述
│ [打开] [启动/停止] [编辑]    (启用)  │ ← P4 动作（按 state 派生/恢复）
└───────────────────────────────────┘
```

| 槽位 | 数据字段 | 规则 |
|---|---|---|
| P0 身份 | `icon`（62/66 有）+ `name` + 目录名 id | 无 icon → 名字首字 mono；name 必填 |
| P1 状态 | 状态字 chip + 状态点（运行时计算）+ meta | 双显：字 + 色，色盲可读；meta = `port`/`ports`/`trigger`/`type` 取一，空 → `—` |
| P2 标签 | `category` + `owner` + `form`(派生) | category 必填 10 值；`capability` 进 tooltip 不进槽位 |
| P3 描述 | `description`（取【用途】段） | 必填 ≥10 字，2 行截断；空 → `—` |
| P4 动作 | `startCommand`/`stopCommand`/`url` + 当前 state | 按 state 派生，异常态换恢复动作 |

### 展开卡（点击展开，完整 frontmatter，标签行）

| 板块 | 字段 |
|---|---|
| 功能 | `description`【用途】段 |
| 何时调用 | `capability` + `description`【何时用】【何时不用】 |
| 调用方式 | `apiBase`/`url`/`port`/`trigger`/`callingPath` + `startCommand`/`stopCommand` |
| 标签 | `category` `owner` `type`(form) `version` `order` |
| 运维 | `projectPath` `runtime` `autoStart` `conflicts` `agent_notes` `disabled` |
| 状态详情 | `state` `stateDetail` `recovery` `missingFields`（scanTools 算，不落盘） |

---

## 3. 状态徽章（统一色板，前端 schema）

| state | 徽章 | 视觉 | 动作 |
|---|---|---|---|
| running | 运行中 | 绿 success | 打开 / 停止 |
| stopped | 已停止 | 灰 neutral | 启动 |
| start_failed | 启动失败 | 红 error | 查看日志 + 重试启动 |
| starting / halting | 启动中 / 停止中 | 蓝 info / 橙 warning | — |
| broken | 损坏 | 红 error | 修复 manifest |
| incomplete | 不完整 | 琥珀 warning | 补全字段 |
| orphan | 游离 | 紫 info | 注册为工具 |
| stale_path | 路径失效 | 棕 warning | 迁移路径 |
| disabled | 已停用 | 灰·透明 neutral | 重新启用 |

**2026-08-21 决策**：枚举定 9 种（过渡态 starting/halting 计 1）。`start_failed` 独立，不再归入 stopped。

**同一张卡**：坏卡 = 正常卡换徽章色 + 动作按钮换恢复动作，尺寸、结构不变。

---

## 4. 对照外部调研（不自创）

| 外部共识 | 本契约落地 |
|---|---|
| 状态卡 4 区：Header/meta/desc/action（Shadcn） | 紧凑卡 4 区 |
| 状态徽章统一变体色（Kubestellar） | 8 状态徽章统一色板 |
| 所有数据态显式（空/错/加载/零值） | `—` 占位 + 异常卡全量读 |
| 两段式卡：紧凑→展开详情（builder-assistant） | 紧凑/展开两层 |
| 单一共享状态模型（HarmonyOS） | manifest = 唯一真相源，scanTools 派生 state |
| 失败路径前置设计 + 恢复动作 | 每异常态配 recovery |

---

## 5. 下一步（不再画原型，先定数据）

1. **确认本契约**：槽位↔字段映射、8 状态、两段式 —— 对还是改
2. 契约定 → 再重画原型（同一张卡 8 状态、图标恢复、编辑按钮、展开层）
3. 施工按 `docs/archive/card-component-施工方案.md` S1-S5（已归档：其"index.html 内联自包含"前提被 7a7fd38 外置化推翻，施工前需重新核对文件结构）

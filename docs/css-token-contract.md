# CSS Token 契约 — 工具架前端不再硬编码

> S0 产物。目标：`web/_style.css` 30 色 / 65 处 → 全走 `:root` token，消灭 21 处硬编码。
> 模型照 `D:\workspace\layout-gallery\templates\layout-gallery` DTCG 三层：`tokens.json` 契约源 → `:root` 镜像 → `var()` 消费。
> 日期：2026-08-22。配套：`web/tokens.json`（机器源）、施工方案 §1.5。

---

## 1. 原则（什么才值得 token）

一个色值升级为 token，三条件至少一：
1. **跨组件复用**（同值出现在 2+ 规则）
2. **语义承载**（状态/类型/语言色，未来要换主题或自适应）
3. **主题可换**（暗色模式、品牌调整时集中改）

一次性装饰色不进 token。token 是契约不是流水账——21 处硬编码收编后，`:root` 是唯一改色入口。

**分层**：基础色板（`--accent-*` 3 色）→ 语义色引用基础色板（`--status-orphan: var(--accent-purple)`），值只定义一次，避免两个 token 同值漂移。

---

## 2. 分组（照 layout-gallery color 组，贴合 agentboard 实际）

### 2.1 color/ink 品牌

| token | 值 | 语义 |
|---|---|---|
| `--ink` | #002FA7 | 品牌蓝（header 底、logo、焦点框） |
| `--ink-rgb` | 0,47,167 | rgba 运算用（已存在） |

### 2.2 color/surface 面

| token | 值 | 语义 | 收编 |
|---|---|---|---|
| `--paper` | #FAFAF8 | 页面底（已有） | — |
| `--paper-tint` | #F2F2F0 | 副面（已有） | — |
| `--border` | #E0E0DC | 边框（已有） | — |

### 2.3 color/text 文字

| token | 值 | 语义 | 收编 |
|---|---|---|---|
| `--text` | #0A0A0A | 主文字（已有） | — |
| `--text-secondary` | #555 | 次文字（已有） | — |
| `--text-muted` | #999 | 弱文字（已有） | — |
| `--text-inverse` | #FFFFFF | 深底反白前景 | `#fff`×9（header nav 白字、按钮白字） |

### 2.4 color/action 按钮态

| token | 值 | 语义 | 收编 |
|---|---|---|---|
| `--action-go` | #2D2D2D | 启动按钮底 | `#2d2d2d`×2 |
| `--action-go-hover` | #1A1A1A | 启动按钮 hover | `#1a1a1a`×2 |
| `--action-danger` | #C0392B | 停止按钮边/字 | `#C0392B` |
| `--action-danger-hover` | #C0392B | 停止按钮 hover 底 | `#C0392B` |
| `--action-success-hover` | #157A34 | 打开按钮 hover | `#157A34`×2 |

### 2.5 color/status 9 状态（scanTools 驱动）

| token | 值 | 语义 | 收编 |
|---|---|---|---|
| `--status-on` | #1A8A3F | running 绿（已有） | — |
| `--status-off` | #BBB | stopped 灰（已有） | — |
| `--status-starting` | `var(--accent-blue)` | starting 蓝 | `#3b82f6` |
| `--status-halting` | `var(--accent-orange)` | halting 橙 | `#d97706`×5 |
| `--status-error` | #C0392B | start_failed / broken 红 | `#c0392b`×9、`#c44e3e`×2、`#c0392b` |
| `--status-warn` | #C7902B | incomplete 琥珀 | `#c7902b`×2、`#e67e22` |
| `--status-orphan` | `var(--accent-purple)` | orphan 紫 | `#8b5cf6`×5 |
| `--status-stale` | #8B5A2B | stale_path 棕（**新引入**） | — |
| `--status-disabled` | #CCC | disabled 灰 | `#CCC`、`#ccc` |

`--success` #059669：semantic 成功（toggle on 绿），独立于状态组。

### 2.6 color/accent 类型色板（form badge / 类型卡）

| token | 值 | 语义 | 收编 |
|---|---|---|---|
| `--accent-purple` | #8B5CF6 | API / 命令 | `#8b5cf6`×5 |
| `--accent-orange` | #D97706 | CLI / 文件夹 | `#d97706`×5 |
| `--accent-blue` | #3B82F6 | Web | `#3b82f6` |

### 2.7 color/lang 运行时语言 badge

| token | 值 | 收编 |
|---|---|---|
| `--lang-python` | #3776AB | `#3776ab` |
| `--lang-node` | #27AE60 | `#27ae60`×3 |
| `--lang-go` | #00ADD8 | `#00add8` |
| `--lang-rust` | #DEA584 | `#dea584` |
| `--lang-cpp` | #00599C | `#00599c` |
| `--lang-csharp` | #68217A | `#68217a` |
| `--lang-shell` | #6B7280 | `#6b7280` |
| `--lang-other` | var(--accent-purple) | `#8b5cf6` |

### 2.8 color/gc 组卡子状态（cron）

| token | 值 | 收编 |
|---|---|---|
| `--gc-success` | #27AE60 | `#27ae60` |
| `--gc-error` | #E67E22 | `#e67e22`×3 |
| `--gc-fatal` | #C0392B | `#c0392b` |

### 2.9 radius / shadow（补全）

`--radius-sm 4px` / `--radius-md 8px` / `--radius-pill 999px`（现硬编码圆角）。
shadow 3 个已有（border/card/card-hover），保留。

---

## 3. 硬编码收编清单（21 处 → token）

| 规则 | 现硬编码 | → token |
|---|---|---|
| `.header-nav a:hover/a.active` | #fff | `--text-inverse` |
| `.btn.go` / `.btn.go:hover` | #2D2D2D / #1A1A1A / #fff | `--action-go` / `--action-go-hover` / `--text-inverse` |
| `.btn.stop` / `:hover` / `.confirming` | #C0392B / #fff | `--action-danger`(+hover) / `--text-inverse` |
| `.btn.open-done:hover` | #157A34 | `--action-success-hover` |
| `.badge-API` / `.badge-命令` | #8B5CF6 | `--accent-purple` |
| `.badge-CLI` / `.badge-文件夹` | #D97706 | `--accent-orange` |
| `.badge-Web` | #3B82F6 | `--accent-blue` |
| `.rt-py` | #3776AB | `--lang-python` |
| `.rt-node` | #27AE60 | `--lang-node` |
| `.rt-go` | #00ADD8 | `--lang-go` |
| `.rt-rust` | #DEA584 | `--lang-rust` |
| `.rt-cpp` | #00599C | `--lang-cpp` |
| `.rt-csharp` | #68217A | `--lang-csharp` |
| `.rt-shell` | #6B7280 | `--lang-shell` |
| `.rt-other` | #8B5CF6 | `--lang-other` |
| `.cmd-card` / `.card-dot.cmd` | #8B5CF6 | `--accent-purple` |
| `.folder-card` / `.card-dot.folder` | #D97706 | `--accent-orange` |
| `.gc-status.success` / `.gc-dot.success` | #27AE60 | `--gc-success` |
| `.gc-status.error` / `.gc-dot.error` / `.gc-dot.output_missing` | #E67E22 | `--gc-error` |
| `.gc-status.fatal_error` / `.gc-dot.fatal_error` | #C0392B | `--gc-fatal` |
| `.res-val.warn` / `.res-dot.y` | #C7902B | `--status-warn` |
| `.res-val.redline` / `.res-dot.r` | #C44E3E | `--status-error` |
| `.res-dot.g` | #3B7D4B | `--success` |
| `.toggle-track` | #CCC | `--status-disabled` |
| `.toggle-track.on` / `.toggle-label.on` | #059669 | `--success` |
| `.dim-warn` | #C0392B | `--status-error` |
| `.call-stats-dot.control` | #D97706 | `--status-halting` |

---

## 4. 实施

1. `:root` 补全部新 token（照 §2 值，含 `--accent-*` 基础层 + `--status-*` 引用）
2. 上表 21 处硬编码逐条替换为 `var(--token)`
3. **验证**：grep 确认 `_style.css` 零残留裸 hex（`#` 后跟 3/6 位，排除 tokens.json / :root 定义行）；浏览器 :3099 刷新渲染逐项对比无颜色漂移（badge/按钮/状态点）
4. 验收：`grep -oE "#[0-9a-fA-F]{3,8}" _style.css | 去重` 应只剩 `:root` 块内定义

## 5. 遗留（不扩本次）

- typography（`--font-mono` 等硬编码字体族）——可后补
- spacing / motion（padding 32px、transition .15s 等）——可后补
- 暗色模式 / 自适应主题——依赖本契约，未来可换

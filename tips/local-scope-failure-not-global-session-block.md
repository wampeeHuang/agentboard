---
type: diagnosis
date: 2026-09-14
domain: general
author: codex
source: 2026-09-14 workspace-governor 与 WorkBuddy 布局合同故障复盘
---

# 局部治理故障不能在 Stop 阶段升级为全局会话阻断

## 现象

`D:\agent-skills` 中一个可选运行目录 `.workbuddy` 与布局合同不一致时，Codex 的无关 Obsidian 调研、只读检查和会话结束都会收到同一条治理错误；任务无法推进，且 Stop Hook 反复提示。

## 根因

治理器把固定 `policy-root=D:\agent-skills` 绑定到全局 `PostToolUse: .*` 与 `Stop`。Post/Stop 没有先证明本次操作触及技能库，便对整个根目录做 `check_layout()`；局部布局问题因此扩大为所有 Agent、所有项目的会话级拒绝服务。`Stop` 更没有可靠的目标路径，无法判断应审计哪个根。另一个放大器是 Windows PowerShell 写出的 UTF-8 BOM：Python 用 `encoding="utf-8"` 读取 JSON 时会抛 `JSONDecodeError`。

## 修复/步骤

1. `PreToolUse` 只拒绝可解析且确实位于 policy root 内的不合规结构写入。
2. `PostToolUse` 仅在 `touches_policy_root(payload, root)` 为真时执行全量布局检查；无关操作静默。
3. 从 Codex 配置移除 `Stop` Hook；全库健康检查改为显式巡检，不承载在无上下文的会话结束事件上。
4. `.workbuddy` 作为平台可选运行目录使用 `tolerated`，不把它列为必须始终存在的业务入口。
5. JSON 读取统一使用 `utf-8-sig`；配置写入后用 Python `json.loads(Path(...).read_text(encoding="utf-8"))` 验证。

## 预防

设计 Hook 时先回答两件事：它能证明本次操作的目标范围吗？它的输出会不会让宿主把一次局部失败升级为整个会话失败？任一答案是否定，就只能记录/提示，不能阻断。

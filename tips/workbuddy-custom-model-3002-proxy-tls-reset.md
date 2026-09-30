---
type: diagnosis
date: 2026-09-22
domain: general
author: codex
source: 2026-09-22 WorkBuddy 自定义中转模型的多轮任务 3002 排障
---

# WorkBuddy 自定义模型短问答成功后报 3002，要用 Trace 区分代理 TLS 重置与模型错误

## 现象

WorkBuddy 的自定义模型出现在选择器里，最小提示返回 `OK`；真实多轮任务却提示“自定义模型错误”并显示 `3002` 与 Trace ID。简单重试或只验证同一 Key 的短对话，容易误判为模型 ID、余额或接口格式问题。

## 根因

这次用 Trace ID 在 `~/.workbuddy/logs/<日期>/` 中定位到模型请求：URL 和模型 ID 均为已配置的自定义模型，前两次模型响应完成；后续请求被 `ProxyResolver L0 PAC` 送往本机 HTTP 代理 `127.0.0.1:7897`，两次在收到响应头前报 `ECONNRESET` / “Client network socket disconnected before secure TLS connection was established”。WorkBuddy 将连接层错误呈现为 3002。该请求无服务端 HTTP 状态，不能据此归因为模型权限或余额；同一代理的短请求偶尔成功，也不能说明长任务稳定。

## 修复/步骤

1. 用报错的 Trace ID 搜索当日 WorkBuddy 会话日志，只提取相应 `ModelProvider`、`ProxyResolver`、重试和最终错误的少量行；输出前遮蔽 Key、Authorization、私人提示词和文件内容。
2. 核对请求 URL、模型 ID、是否在响应头之前失败、PAC 选中的代理地址，以及当前 `NO_PROXY` / `no_proxy` 是否包含目标域名。分别做不含 Key 的代理与直连 HTTPS 小检查，区分域名整体不可达和特定路由不稳。
3. 如果直连稳定而代理路径 TLS 重置，可在获得相应系统配置授权、保护现有值后，将**精确域名**追加到用户级 `NO_PROXY` / `no_proxy`，重启 WorkBuddy 才能让新进程读取；若 DNS 被 fake-ip 劫持，还需单独核查 DNS/NRPT。不要把“自定义协议”开关误当作网络代理绕过。
4. 修复后须在 WorkBuddy 内重跑一个小的多轮/工具任务，并核对日志中的路由与完成结果。仅文件存在、模型可选、一次 `OK` 或 `curl 401` 都不构成多轮验收。

## 预防

此案例的代理绕过**尚未实施并复验**：用户提出记录时 WorkBuddy 正在执行另一项任务，不应强行重启。记录已证实的 TLS/PAC 故障与待验证的修复分别标注；不要把用户口头“ok”或某次短请求成功写成持久修复。API Key 不进入日志或故障报告。

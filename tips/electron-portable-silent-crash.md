# Electron portable 启动进程消失，无端口监听，无日志

type: diagnosis
date: 2026-06-29
source: CC Switch v3.16.4 portable 部署，启动后进程消失，端口 15721 未监听

## 现象

- 启动 Electron 应用的 portable 版 exe，进程瞬间消失
- 目标端口未监听（`netstat -ano | grep <port>` 无输出）
- 工作目录下无任何配置文件或日志生成
- 已设 `portable=true` 标记文件

## 根因

Electron portable 启动崩溃通常不是代码 bug，是运行环境缺失：
1. **VC++ 运行时缺失** — Electron 依赖 `vcruntime140.dll` 等，便携版不携带
2. **杀软拦截** — 无签名的便携 exe 被 Windows Defender 静默杀进程
3. **已有冲突配置** — 非 portable 模式下的 `%APPDATA%` 残留配置导致启动阶段崩溃，portable 标志来不及生效
4. **GPU 渲染崩溃** — Electron GPU 进程在某些显卡/驱动组合下静默退出

诊断优先级：事件查看器 → 杀软日志 → `--no-sandbox` 试启动 → 安装版

## 修复/步骤

1. 查事件查看器：`eventvwr.msc` → Windows 日志 → 应用程序，搜 `.NET Runtime` 或 `Application Error`，看崩溃模块名
2. 尝试 `--no-sandbox --disable-gpu` 参数启动
3. 如果 portable 版不行，换安装版（安装版自带依赖检测）
4. 杀软加白名单

## 预防

- 部署 Electron portable 应用前，先确认 VC++ 运行时已装
- 便携版启动失败 → 3 分钟内切安装版，不继续死磕便携版
- 部署类文章涉及 GUI 工具时，必须记录实际部署结果（成功或确切失败原因），不凭文档推测

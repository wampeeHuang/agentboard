# Turbopack 双 lockfile 警告后静默崩溃，Ready 不等于稳定
type: diagnosis
date: 2026-07-10
source: Forma 安全审查 — 开发服务器反复 Turbopack panic，干扰验证节奏

## 现象
Next.js 16 Turbopack 启动时提示检测到多个 lockfile，选择了父目录的作为工作区根。服务器显示 `✓ Ready`，正常响应几分钟，然后突然 `FATAL: Turbopack panic`，报 "Next.js package not found"，HTTP 请求全部超时。

## 根因
项目结构 `D:\workspace\forma-typesetting\` 有父级 `package-lock.json`（PM2 等），子目录 `forma\package-lock.json`（Next.js）。Turbopack 选择父级为 workspace root，但在解析子目录文件时从错误的 root 查找 `next/package.json`，触发 panic。

`✓ Ready` 不代表稳定——Turbopack 按需编译，panic 发生在第一个请求触发子目录文件编译时。

## 修复/步骤
二选一：
1. 删除父级 `package-lock.json`（如果父级只是 PM2 配置，不需要自己的 lockfile）
2. 在 `next.config.ts` 设 `turbopack: { root: __dirname }` —— 但注意 ESM 下 `__dirname` 不可用，需用 `fileURLToPath`

设 `turbopack.root` 后警告消失，但仍可能 hang。更可靠的方案是删除一个 lockfile 消除歧义。

## 预防
- monorepo/多 lockfile 项目，启动 Next.js dev server 后不要只看 `Ready`，先打一个 API 请求确认编译完成且无 crash
- "Detected multiple lockfiles" 不是无害警告，是潜在崩溃的前兆
- Windows 上 curl 不可靠时用 PowerShell `Invoke-WebRequest -Uri http://127.0.0.1:3103/` 验证

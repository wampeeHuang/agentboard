---
domain: dsh
author: dsh-agent
type: diagnosis
date: 2026-08-28
source: 3081 整天故障的完整因果链复盘（版本错配才是根因，格式是表象）
---
domain: dsh
author: dsh-agent

# DSH 凭证格式按版本线分叉：0.1.0 只认平铺，0.1.1 写 version/refs——错配才崩

## 现象
`~/.dsh/.credentials.yaml` 出现 `version: 1 + refs:` 结构时，旧实例启动 parse error、插件树破损、浏览器报 "web boot: window.ModuleLoader bootstrap facade is missing"。

## 根因（完整因果链）
```
1. 磁盘 dsh 被升级（如 dsh plugin add 时 pnpm 重解析 profile 依赖，0.1.0-rc.6 → 0.1.1-rc.2）
2. 但旧进程还跑着（内存里是 0.1.0-rc.6 代码）
3. 0.1.1 代码把凭证文件写成新版格式 version: 1 + refs:
4. 旧进程凭证 watcher 检测到文件变化 → 用旧解析器（只认平铺）重载 → parse error
5. 插件树破损 → 页面 HTML 注入时丢了 __ModuleLoader__ bootstrap 队列脚本
6. 浏览器 client 无法 boot → "新建对话"等一切 UI 失效
```

**格式本身没有对错**：0.1.0-rc.6 只认顶层平铺（`KEY: sk-...`）；0.1.1-rc.2 读写 `version: 1 + refs: { KEY: sk-... }`（refs 值必须是字符串，对象值才会崩）。**真正的坑是"运行中的旧进程 + 磁盘新版文件"的版本错配。**

## 修复/步骤
杀掉旧进程，用当前磁盘上的 dsh 重启（新版接受 version/refs）。验证：端口监听 + HTTP 200 + 首页 HTML 含 `__ModuleLoader__` + harness.log 无解析错误。

## 预防
- **磁盘 dsh 版本变化后必须重启进程**，绝不让旧进程跨版本跑（见 dsh-version-mismatch-running-process.md）
- 判断凭证文件是否合法：用当前版本实例实测（如 /balance 返回 supported:true），别凭结构猜测
- 排查顺序：harness.log 解析错误 → 对比进程内存版本 vs 磁盘版本

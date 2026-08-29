---
domain: dsh
author: dsh-agent
type: diagnosis
date: 2026-08-28
source: 3081 一整天故障（端口起不来→不能新建对话→bootstrap 缺失）的根因
---
domain: dsh
author: dsh-agent

# 运行中的旧 dsh 进程跨过磁盘升级：凭证 watcher 旧解析器重载 → 插件树破损 → client boot 失败

## 现象
同一天内连环故障：重启端口起不来 → 服务起来后"新建对话"失效 → 浏览器报 `window.ModuleLoader bootstrap facade is missing`。单看每个症状都像独立 bug，实际是一条链。

## 根因（完整因果链）
```
磁盘 dsh 升级（0.1.0-rc.6 → 0.1.1-rc.2）
  └─ 触发源：dsh plugin add / pnpm 重解析 profile 依赖（版本范围允许跳动）
旧进程继续跑（内存里还是旧版代码）
  └─ 新版代码把 .credentials.yaml 写成新格式（version+refs）
  └─ 旧进程凭证 watcher 检测到文件变化 → 用旧解析器（只认平铺）重载 → parse error
  └─ 插件树破损 → 页面 HTML 注入时丢了 __ModuleLoader__ bootstrap 队列
  └─ 浏览器 client 无法 boot → 所有 UI 失效（连新建对话都不行）
```

关键认知：**"升级后旧进程继续跑"本身不炸，炸的是旧进程去重载新版写出的文件。** 凭证 watcher 是跨进程的活体耦合点。

## 修复/步骤
1. 杀掉旧进程（`taskkill /PID <pid> /T /F`）
2. 用磁盘上的当前版本重启（agentboard manifest 的 startCommand：node 直调 profiles/node_modules 的 bin.js）
3. 验证：端口监听、HTTP 200、首页 HTML 含 `__ModuleLoader__`、harness.log 无解析错误
4. 浏览器硬刷新（Ctrl+Shift+R）

## 预防
- **任何 dsh 依赖变动（plugin add/update、pnpm 重装）后立即重启进程**，不跨版本跑
- 安装/升级插件时留意 profile 的 @deepseek-ai/dsh 版本是否被 pnpm 顺带升级（版本范围 `^0.1.0-rc.6` 会跳到 0.1.1-rc.2）
- 出现连环症状时先检查：进程内存版本 vs 磁盘版本是否一致（`Get-CimInstance Win32_Process` 的 CommandLine + package.json version）
- agentboard 的 tools/deepseek-harness/manifest.json 记得同步版本号，别留过期信息误导排查

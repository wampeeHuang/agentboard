---
type: diagnosis
date: 2026-07-25
source: catalog 工具上线复盘，catalog:3103 与 forma:3103 冲突
---

# 端口冲突：两个 manifest 同一端口 → 都显示 running

## 现象

两个工具 manifest 都声明同一个端口。agentboard 检查端口存活 → 两个都标 `running: true`。实际只有一个进程占用端口。用户打开 → 不知道访问到哪个服务。

## 根因

agentboard 的 `running` 检测只查端口活跃，不查 PID 归属。端口活跃 + PID 文件不匹配 → 仍可能标 running。

## 修复

1. 新建工具前用 `curl localhost:3099/api/tools` 扫一遍现有端口
2. 发现冲突 → 换端口
3. 改了 server.js 的 PORT 也别忘了改 manifest.json 的 port/url/stopCommand

## 预防

建新 manifest 时先 `curl -s localhost:3099/api/tools | node -e "...筛出所有 port 检查冲突"`

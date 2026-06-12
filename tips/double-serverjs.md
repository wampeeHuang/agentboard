# 双 server.js 版本分歧
type: feedback
date: 2026-06-12
source: .agentboard/server.js 和 Projects/agentboard/server.js 两个版本并行

## 现象
改了 `.agentboard/server.js` 的分类逻辑，但 3099 端口跑的是 `Projects/agentboard/server.js`。改完重启无效，因为杀错进程、启错文件。

## 根因
一个系统存在两份 server.js：
- `.agentboard/server.js` — 活跃开发版（1334行），加了透视镜/minds/open-dir
- `Projects/agentboard/server.js` — 旧版（867行），git 跟踪的原版

不知道哪个在跑 → 改错文件 → 重启还不生效。

## 排查方法
```bash
# 1. 确认端口上跑的是谁
netstat -ano | grep ':3099' | grep LISTENING
# → PID xxxx

# 2. 查进程命令行
wmic process where processid=xxxx get commandline
# → "node.exe" server.js（不显示完整路径，因为只写了 server.js）

# 3. 杀进程 → 从正确目录启动
taskkill /PID xxxx
cd 正确目录 && node server.js
```

Windows 上 `wmic` 不显示工作目录，只显示 `"node.exe" server.js`。只能靠杀进程后从正确路径重启来兜底。

## 修复
- `.agentboard/` 确立为唯一真相源，纳入 git
- `Projects/agentboard/` 归档重命名为 `agentboard-OLD-20260528`
- `.agentboard/` push 到 GitHub `wampeeHuang/agentboard`，远程也是唯一源

## 预防
- 一个系统只允许一个 server.js 运行中
- 旧版立即归档（加日期后缀），不放在平行目录
- 不确定哪份在跑时：先 `netstat -ano`，不猜

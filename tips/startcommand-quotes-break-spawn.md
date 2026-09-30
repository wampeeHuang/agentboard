---
type: diagnosis
date: 2026-09-22
domain: general
author: dsh-agent
source: Vikunja 卡片注册后工具架启动失败，容器一个都没起
---

# 卡片 startCommand 带引号 → 工具架静默启动失败（exit=1，无 stderr）

## 现象

新注册的 docker compose 卡片（vikunja）在工具架点启动，API 返回 `{"ok":true,"status":"starting","pid":...}`，但容器一个都没起。`events.jsonl` 里只有：

```
tool-start-crash vikunja exited code=1 after 339ms: (no stderr output)
```

退出码 1、stderr 为空，日志里没有可用的线索，端口永远不监听。

## 根因

`lib/tool-registry.js` 的本地 spawn 分两条路：

- **start**：只对 node/python/py 直 spawn（`DIRECT_SPAWN_EXES`），其余命令一律 `spawn('cmd', ['/c', 整条命令], { detached: true, stdio: ['ignore','ignore','pipe'] })`
- **stop**：`execSync(stopCommand, { shell: true })`

Node 在 argv 里遇到内层 `"` 会转义成 `\"`，而 cmd.exe 不认 `\"` 这种转义。证据 —— `spawn('cmd', ['/c', 'echo "a b" up -d'])` 的 stdout 是：

```
\"a b\" up -d
```

引号带着反斜杠原样传给了程序。于是 `docker compose -f "D:\...\compose.yml" up -d` 里的 `-f` 路径变成含字面 `\"` 的值，参数校验严格的子命令（up / ps / down / start）直接 exit 1；`version` 因为忽略多余参数才碰巧能跑通——这就是「带引号有时看着没事」的假象。

stop 走 `execSync` 的 `cmd /d /s /c` 路径，引号正常，所以同一张卡片里带引号的 `down` 反而成功——启停两条命令命运不同，容易误判成「引号没问题」。

## 修复/步骤

startCommand 里不要出现任何引号；路径无空格就直接写裸路径：

```
docker compose -f D:\tools\vikunja\compose.selfhost.yml up -d
```

改完（走 `PUT /api/tools/{id}`，不直写 manifest.json）卡片启动 3 秒内端口就绪、running=true。

复现/自检脚本（换 cwd 和命令即可验证任何卡片）：

```javascript
spawn('cmd', ['/c', command], { cwd, detached: true, stdio: ['ignore', 'ignore', 'pipe'] })
```

## 预防

- 注册或改动 service 卡片后，必须真点一次启动并检查 `events.jsonl` 有没有 `tool-start-crash`——`ok:true` + `status:starting` 只代表「已 spawn」，不代表起来了
- 绕不开引号时（路径含空格）：写成路径不含空格的 `.cmd` / `.ps1` 包装脚本，把引号关进脚本内部
- `affine-ce` 等在册 docker compose 卡片的 startCommand 同样带引号，遇到「点了启动没反应、也没有报错」先查这一条

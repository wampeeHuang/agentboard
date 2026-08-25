---
type: diagnosis
date: 2026-08-25
source: dashboard 启动失败，npx kill-port 拉包失败静默退出
---

# 启动入口的"顺手清理"步骤不许静默退出

`npx kill-port` 拉包失败/网络问题静默退出（exit 0、无输出），服务起不来，且后台方式看不到 stderr — 表现为"服务莫名不在线"。

## 现象

`node start.js` 后进程 exit 0、无任何输出，但 `localhost:3099` 连不上。后台启动方式下 stderr 不可见，误判为"没报错=没问题"。

## 根因

`start.js` 用 `npx kill-port` 做端口清理，npx 首次运行要拉包；拉包失败时子进程静默退出，外层代码沿 exit code 继续走 — exit 0 让调用方以为成功。

## 修复/步骤

- 绕法：绕过 start.js，直接 `node server.js` 启动
- 根治：启动入口的清理步骤必须显式失败 — 子进程非 0 退出时打 stderr 并抛错，不许吞

## 预防

- 任何"顺手清理/前置步骤"放启动入口时，失败必须可见
- 服务起不来先看启动入口有没有前置命令依赖网络（npx 拉包、远程 fetch）
- 后台启动方式看不到 stderr 时，先 `node <入口>.js` 前台跑一次

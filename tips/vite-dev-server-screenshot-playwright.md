---
type: diagnosis
date: 2026-10-03
domain: general
author: dsh-agent
source: 验证 video-talkcraft 工作台 :5199 渲染
---

# 给本地 Vite dev server 截图验收：chrome --screenshot 永不返回，改用 playwright screenshot

## 现象
`chrome-headless-shell --headless --screenshot=…`（带或不带 `--virtual-time-budget`）和 playwright 自带的 `chromium.exe --headless=new --screenshot=…` 都跑满 90–120s 超时不产出 PNG；同一时刻 `curl http://localhost:5199/` 是 200，dev server 完全正常。

## 根因
Vite dev server 保持 HMR websocket 与长连接，页面 load 之后网络活动一直不静止；命令行截图模式在等"页面静止"才落盘，所以永不退出。`--virtual-time-budget` 依赖虚拟时间推进到 idle，同样等不到。

## 修复/步骤
用已全局安装的 playwright（`playwright@1.59.1`，浏览器已在 `%LOCALAPPDATA%\ms-playwright`）：

```
npx --no-install playwright screenshot --viewport-size "1680,1000" --wait-for-timeout 6000 http://localhost:5199/ out.png
```

等固定时长后直接截图退出；拿到 PNG 再 `read_image` 目视确认渲染，不要用 HTTP 200 代替渲染验收。

## 预防
- 本地 dev server（Vite/Next/HMR 类）的渲染验收一律走 `playwright screenshot`；命令行 `chrome --screenshot` 只对静态页可靠
- 需要带查询参数（如 `?tracks`）时直接拼在 URL 上，截图与人工看到的保持一致

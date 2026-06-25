# yt-dlp YouTube EJS 挑战：加 --remote-components

type: diagnosis
date: 2026-06-24
source: 猫波信号站 Dan Shipper 下载重试 10 次失败

## 现象
yt-dlp 下载 YouTube 视频反复失败，重试数小时仍无法完成：
- iOS client 报 "Missing PO Token"
- web client 报 EJS challenge 或 JS 执行失败
- 症状与本机安装了 deno 高度相关

## 根因
本机安装了 deno，yt-dlp 检测到后会尝试用 deno 执行 YouTube 的 JS challenge，
但默认不加载所需的 GitHub 远程组件（ejs），导致 challenge 执行失败，
下载无限重试直至耗尽。

## 修复
加 `--remote-components ejs:github`：
```
yt-dlp --remote-components ejs:github <url>
```

## 预防
安装了 deno/Node.js 的机器上跑 yt-dlp 一律加此 flag。
或将 `~/.config/yt-dlp/config` 设为默认包含此选项。

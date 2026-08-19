---
type: diagnosis
date: 2026-08-13
source: 雅院视频批量下载（BV1H8411e7cc 等 4 个）
---

# B站下载 412：要浏览器 cookies（含 HttpOnly SESSDATA）

## 现象
`yt-dlp` 下 B站视频报 `HTTP Error 412: Precondition Failed`，卡在 `Downloading video formats for cid`。只传 `buvid3/buvid4` 等 document.cookie 里能读到的 cookie，仍 412。

## 根因
B站 playurl API 反爬，需登录态 cookie。关键在 **HttpOnly 的 `SESSDATA`**——`document.cookie` 读不到（HttpOnly），`buvid3` 单独不够。

## 修复
1. Chrome DevTools MCP 打开 `https://www.bilibili.com/`（确认浏览器已登录）
2. `list_network_requests` 找 `GET api.bilibili.com/x/web-interface/nav`，`get_network_request` 读其 **Request Headers 的 `cookie:` 头**——含完整 SESSDATA
3. 把 cookie 串转成 Netscape 格式（`.bilibili.com TRUE / FALSE <expiry> <name> <value>`），存 cookies.txt
4. `yt-dlp --cookies cookies.txt --user-agent "Mozilla/5.0 ... Chrome/151.0.0.0 Safari/537.36" ...`

## 预防
- B站下载必带浏览器 cookies，别试裸下（412 是常态）
- SESSDATA 是登录凭证，用后删 cookies.txt，不留明文；下次再从浏览器重提（30 秒）
- 本机无独立 B站 cookies 文件，浏览器登录是唯一凭证源

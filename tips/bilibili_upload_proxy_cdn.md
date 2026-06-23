# B站大文件上传：浏览器 > Python API

type: diagnostic
date: 2026-06-23
source: Cursor视频推B站草稿箱（1.3GB）

## 现象
Python `stage_15_publish.py` 上传1.3GB MP4到B站CDN，chunk上传频繁断开：
- `ProxyError: Unable to connect to proxy, ConnectionResetError(10054)`
- `SSLEOFError: UNEXPECTED_EOF_WHILE_READING`
- `ConnectTimeoutError: Connection timed out`

8次重试+指数退避+0.5s节奏仍无法稳定完成。

## 根因
本机通过 Vortex 代理(127.0.0.1:7897)连 B站 CDN，代理对持续大流量连接不稳定。CDN 不直连（`curl --noproxy "*"` 直接超时），但代理本身在长时间 chunk 上传中频繁断开。

## 修复
浏览器上传替代 Python API：
1. Chrome DevTools MCP 驱动浏览器访问 `member.bilibili.com/platform/upload/video/frame`
2. 浏览器内置网络栈直连 CDN，12.7 MB/s，1.3GB ~1.6分钟完成
3. 元数据填充通过 MCP evaluate_script 操作 DOM

## 预防
- 大文件（>500MB）B站上传：优先浏览器自动化，不跑 Python API
- Python API 仅作备选（小文件或无人值守场景）
- 如果必须用 API：考虑换代理方案或直连网络

## 相关
- `stage_15_publish.py` bug：`upload_chunks` 缺 `return etags`（2026-06-23 已修）
- B站简介是 Quill 编辑器，需 `document.querySelector('.ql-editor').innerHTML = ...`

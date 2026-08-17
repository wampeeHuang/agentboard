# yt-dlp 多语言字幕请求触发 YouTube 429

type: capability
date: 2026-07-16
source: 海外历史汉化管线 Phase 05 下载

## 现象
yt-dlp 下载 YouTube 视频正常，但 `--write-auto-subs --sub-langs en,fr,de,es,ja,ru,zh-Hans` 每次都报 HTTP 429。重试加重限流，恶性循环。

## 根因
YouTube 对 auto-subtitle endpoint 有独立限流，与视频下载限流分开。一次请求 7 种语言 = 7 次 subs API 调用，第一个视频就触发 429。yt-dlp 内置 `--sleep-interval` 只作用于请求间间隔，不解决 subs 请求密度问题。

## 修复
双 pass 分离策略：

**Pass 1** — 纯视频下载，0 次字幕请求：
```
yt-dlp -f bestvideo+bestaudio/best --download-archive archive.txt -o "raw/%(title)s.%(ext)s" URL
```

**Pass 2** — 单独请求字幕，exponential backoff：
```
yt-dlp -f bestvideo+bestaudio/best --skip-download --write-auto-subs --sub-langs ... --convert-subs srt -o "subs/%(id)s.%(ext)s" URL
```
429 时 backoff 30s → 60s → 90s → 120s → 150s，不挤在一起重试。

## 预防
- 任何需要 YouTube 字幕的管线，默认用双 pass
- 字幕 pass 的 `--sleep-interval` 设得比视频 pass 更大
- 单频道多视频时，字幕请求间加 random jitter

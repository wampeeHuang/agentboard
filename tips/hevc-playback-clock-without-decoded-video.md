---
type: diagnosis
date: 2026-10-11
domain: general
author: codex
source: 稿对 Slow Home 本地视频拆解验收
---

# 视频时间在走不代表画面已经解码

## 现象
本机 HEVC/AAC 视频在 Playwright 自带 Chromium 中，HTTP 请求成功、readyState=4、currentTime 持续推进，但 videoWidth=0，播放器没有实际视频画面。

## 根因
本次是浏览器解码兼容差异，不能由音频播放或媒体缓冲状态推断视频流已解码。同一文件 ffprobe 可读出 1080×1440；换本机 Edge 后 videoWidth=1080、videoHeight=1440，画面可见。此对照仅证明本次环境，不代表所有 Chromium 或 Edge 版本的 HEVC 支持。

## 修复/步骤
1. 用 ffprobe 读取原片视频编码、尺寸和时长，排除把音频文件当视频。
2. 页面验收同时检查 videoWidth/videoHeight > 0，并截图确认真实帧；可用时再检查 decoded frame 计数。不能只断言 readyState、时间推进或 HTTP 200。
3. 遇到 HEVC 空画面，用系统浏览器进行同文件对照，记录浏览器通道；不要把浏览器能力差异判成源文件损坏。
4. 产品可提供兼容预览转码，但保留原片、哈希及时间映射。该兜底在本次稿对项目中尚未实现。

## 预防
媒体端到端测试固定包含实际解码画面验证。浏览器测试报告注明通道；不要仅为测试变绿切换浏览器后隐去用户环境的兼容限制。

证据：D:/tools/script-editor/docs/reverse-workspace-ui/SLOW-HOME-EXPERIENCE.md（2026-10-11 隔离实测）。

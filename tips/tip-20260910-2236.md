---
type: method
date: 2026-09-10
domain: general
author: claude
source: 2026-09-10 部署 Z-Image-Turbo + Qwen3-VL，17G 模型经 Vortex 下载三次全灭后成
---

# 本机下大模型文件必须用断点续传循环，裸 curl 必死于代理闪断

## 适用
HuggingFace/ModelScope 大文件（GB 级）经 Vortex 代理（127.0.0.1:7897）下载。裸 curl 单次必断（schannel: server closed abruptly，约 8 分钟/2-3G 处），且后台任务报 exit 0 不代表下完。

## 步骤
1. 写续传循环脚本（当次参考稿在 Temp/resume_dl.sh）：`curl -sS -L -C - --retry 10 --retry-all-errors --retry-delay 3 -o 文件 URL`，失败 sleep 5 重来
2. 完成判定：exit 33（416 range not satisfiable）= 已完整；exit 0 还要核对 stat 尺寸 ≥ 预期（HF API `?blobs=true` 拿真实大小）；exit 22 含 429/403，不能当完成，退避 30s 重试
3. 6 流并行可行，聚合 ~4MB/s，17G 约 1 小时

## 事实（2026-09-10 实测）
- hf-mirror.com 免登录限速 ~0.7MB/s，与走代理同速，不用切
- ModelScope 绕代理（curl --noproxy "*"）~2MB/s，略快但重下不划算
- 尺寸阈值别拿十进制 GB（4.51e9）当字节门槛，HF API blobs 给的是舍入值，会永远差一点

## 预防
- 并行后台下载用绝对路径写脚本文件。`cd X && curl1 & curl2 &` 的 & 优先级会让 curl2+ 落在原 cwd——本次 3 个文件落进主目录根，污染后才见
- 相关：claude-plugin-install-gfw.md（同一 schannel 闪断的 TLS 层诊断）、lark-cli-json-file-passing.md（JSON 传参必坑）

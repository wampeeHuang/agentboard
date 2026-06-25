# yt-dlp 下载 AV1 导致 FFmpeg concat 只能输出音频

type: diagnosis
date: 2026-06-24
source: 猫波信号站 Dan Shipper 管线 stage_08 渲染产出无声

## 现象
- yt-dlp 下载成功，source.mp4 播放正常
- stage_④ concat 拼接后 source_clean.mp4 只有音频流（video: 0 KiB）
- stage_⑧ render 最终视频也只有音频（86 MB vs 预期 ~1 GB）

## 根因
yt-dlp 的格式过滤器 `bestvideo[height<=720]+bestaudio` 会优先选择 AV1（format 398），而非 AVC/H.264（format 136）。FFmpeg concat demuxer 不支持 AV1 码流拼接，静默丢弃视频轨道。

## 修复
格式过滤器加 `[vcodec^=avc1]`，强制只选 H.264：
```
-f "bestvideo[height<=720][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio[ext=m4a]/best[height<=720]"
```
已有 AV1 源文件：`ffmpeg -c:v h264_nvenc -preset p4 -cq 23` 转码为 H.264，重新跑 ④→⑧。

## 预防
所有 yt-dlp 下载命令默认加 `[vcodec^=avc1]`。永远不要信任 yt-dlp 的默认编解码器选择。

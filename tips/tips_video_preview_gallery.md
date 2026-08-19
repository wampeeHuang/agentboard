---
type: method
date: 2026-08-01
source: 黄皮油柑做饭项目，45段 Sony MP4 素材需快速筛选
---

# 视频预览画廊：快速浏览大量素材

## 场景
有几十段视频素材需要快速浏览，但：
- 资源管理器缩略图不显示（Sony MP4 编码问题）
- 用户没装 Icaros 或缩略图 handler 失效
- AI 模型无多模态能力（DeepSeek V4），无法直接看图

## 方案
三步生成 HTML 预览画廊：

### 1. 抽帧
```powershell
ffmpeg -y -ss 3 -i "$video" -vframes 1 -q:v 3 "$thumb.jpg"
```
每段视频 3 秒位置取一帧，1920x1080 缩略图。

### 2. 读时长
```powershell
ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$video"
```

### 3. 生成 HTML 网格页面
包含缩略图 + 文件名 + 时长 + 文件大小，点击弹窗播放。支持搜索过滤。

### 降级方案：颜色分类
无多模态时用 PIL 统计缩略图 RGB 均值，`暖度 = R - B`。正值偏暖（厨房/食物），负值偏冷（电路板/办公），快速粗分类。

## 产出
- `_thumbs/` — 缩略图缓存目录
- `视频预览画廊.html` — 自包含 HTML 页面，双击即用

## 适用
- 相机素材初筛（Sony/Canon/GoPro 通用）
- 无缩略图 handler 时快速浏览
- AI 辅助素材分类

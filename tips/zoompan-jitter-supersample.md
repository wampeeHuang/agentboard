---
type: diagnosis
domain: general
author: claude
date: 2026-09-15
source: 掼蛋指南视频 v3 Ken Burns 镜头抖动排查
---

# zoompan 缓慢推拉必抖：整数裁切坐标量化，超采样修复

## 现象

ffmpeg zoompan 对静态图做缓慢推拉（Ken Burns 效果），成片画面周期性跳变。换插值算法、调输出分辨率均无效。

## 根因

zoompan 每帧在**源图坐标系**计算裁切窗口，x/y 取整到整数像素。缓慢变焦的帧间位移是亚像素级（例：1920 宽、4% 变焦、3 秒 → 每帧 <0.5px），取整后步进在 0px/1px 间不均匀跳变 → 可见抖动。属量化误差，不是滤镜 bug，输出端插值救不了。

## 修复

超采样链：输入先放大 4 倍，zoompan 在大坐标系里取整，再降回目标分辨率。同样的 1 源像素误差等效最终画面 1/4 像素，肉眼不可见。

```
-vf "scale=7680:4320:flags=lanczos,zoompan=z='1+0.045*on/$frames':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=$frames:s=3840x2160:fps=30,scale=1920:1080:flags=lanczos,format=yuv420p"
```

## 预防

- zoompan 缓慢变焦（帧位移 <1px）默认上超采样，不在输出分辨率上直接 zoompan。
- 用单帧输入 + zoompan `d=N` 内部展开，别 `-loop 1` 逐帧喂入。

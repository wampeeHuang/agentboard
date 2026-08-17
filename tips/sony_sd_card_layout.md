# Sony 相机 SD 卡文件布局

type: reference
date: 2026-08-01
source: camera-import session

## 卡上目录结构

```
E:\
├── DCIM\
│   └── 100MSDCF\          ← 照片 JPG（拍摄的静态图像）
├── PRIVATE\
│   ├── M4ROOT\
│   │   ├── CLIP\           ← 视频 MP4 + XML 元数据 sidecar（XAVC S 格式）
│   │   ├── SUB\            ← 字幕/辅助数据
│   │   ├── THMBNL\         ← 缩略图 JPG（相机自动生成，非用户照片）
│   │   └── GENERAL\
│   └── AVCHD\
│       └── BDMV\           ← AVCHD 格式的索引文件（.BDM），视频流在 STREAM/
├── AVF_INFO\               ← 相机系统信息文件
└── System Volume Information\
```

## 导入规则

导入用户媒体时只需扫两个目录：
1. `DCIM\100MSDCF\*.JPG` — 照片
2. `PRIVATE\M4ROOT\CLIP\*.MP4` — 视频
3. `PRIVATE\M4ROOT\CLIP\*.XML` — 视频元数据（可选，保留便于后续处理）

不导入：THMBNL 缩略图（相机生成的预览小图）、AVF_INFO、AVCHD/BDMV（无实际视频流的索引壳）。

## 关键教训

DCIM 下只有照片。只扫 DCIM 会漏掉所有视频。必须同时扫 PRIVATE/M4ROOT/CLIP。

---
type: method
date: 2026-08-27
source: guozhi-video-breakdown 证据提取脚本跑 contact sheet 失败，空目录无报错
---

# ffmpeg Windows 版不支持 `-pattern_type glob`，静默产出空目录

## 现象

`ffmpeg -pattern_type glob -i "frames/*.jpg"` 在 Windows 上失败，报：

```
[image2 @ ...] Pattern type 'glob' was selected but globbing is not supported by this libavformat build
```

若脚本用 `|| true` 吞掉错误（如第三方脚本），输出目录 `sheets/` 为空但整体退出码 0，无任何报错，像"成功了"。

## 根因

Windows 的 ffmpeg 构建（gyan.dev 等）未编译 libavformat 的 glob 支持；`-pattern_type glob` 只在 Linux/macOS 生效。这是平台差异，不是命令写错。

## 修复

用数字序列模式替代 glob（帧名必须是连续 `%05d` 形式）：

```bash
# 帧是 frame_%05d.jpg → 用序列模式
ffmpeg -y -framerate 1 -i "frames/frame_%05d.jpg" -vf "scale=320:-1,tile=5x6:padding=8:margin=8" "sheets/sheet_%03d.jpg"
```

## 预防

- 在 Windows 上写 ffmpeg 批量输入，默认 `%d` 序列模式，不用 glob。
- 脚本里任何 `|| true` 之后，必须验证产物存在（`ls`/`find` 计数），防止静默空目录。
- 第三方脚本跑完后检查关键输出目录非空，再继续下游。

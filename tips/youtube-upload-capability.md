---
type: capability
tool: youtube-upload
scenario: 烹饪视频/自媒体视频上传到 YouTube，需要中英双语元数据、缩略图、片尾画面
date: 2026-07-22
recipe: D:\tools\youtube-upload\upload_youtube.py
---

# YouTube 视频上传 — OAuth 自动上传 + 清单模板

## 能力

一键上传视频到 YouTube 频道"黄皮油柑做饭"，支持：
- **--dir 模式**：指向 YouTube_upload 目录，自动发现视频/封面/元数据
- **Token 自动缓存**：首次浏览器 OAuth 授权后，后续免授权
- **spec.json 驱动**：标题/描述/标签/隐私设置一次填写，复用不重敲
- **缩略图自动设置**：目录内 cover.jpg/png 自动上传

## YouTube_upload 目录结构（每个视频一个）

```
YouTube_upload/
  ├─ spec.json          ← 上传参数（标题、描述、标签、隐私）
  ├─ video.mp4          ← 成品视频（任意文件名，取第一个 .mp4）
  ├─ cover.jpg          ← 缩略图（cover.jpg 或 cover.png）
  └─ index.html         ← 可选：上传清单面板（human check）
```

### spec.json 格式

```json
{
  "title": "标题 | English Title | 关键词",
  "description": "关键词放开头\n\n中文描述\n\n---\n\nEnglish description",
  "tags": ["标签1", "标签2", "tag3"],
  "privacy": "unlisted",
  "category": "26",
  "playlist": "播放列表名（首次上传需在YouTube Studio新建）",
  "made_for_kids": false,
  "language": "zh-CN"
}
```

### 上传要求清单

| 项 | 要求 | 说明 |
|----|------|------|
| 标题 | ≤100 字符 | 中英双语，关键字前置 |
| 描述 | ≤5,000 字符 | 关键词放开头，先中文后英文，hashtag 收尾 |
| 标签 | ≤500 字符 | 逗号分隔，中英混合 |
| 缩略图 | 1920×1080 JPG/PNG | 自定义缩略图，食物主体突出 |
| 片尾画面 | 1920×1080 PNG/MP4 | 单独上传，不焊进视频正文 |
| 视频语言 | 中文（简体） | 「显示更多」→ 视频语言 |
| 字幕 | 无需上传 | 双语已烧录在视频上 |
| 儿童向 | 否 | 烹饪内容非儿童向 |
| 可见性 | 不公开列出 | 先检查再公开 |
| 播放列表 | 黄皮油柑做饭 | 第一次需在 YouTube Studio 新建 |

## 为什么只能用这个

- **YouTube 网页上传无 API 记忆**：每次手动填标题/描述/标签，容易遗漏或打错。spec.json 一次写好，永不复敲
- **OAuth token 可复用**：首次浏览器弹窗授权后，token 缓存到 pickle，后续运行不再弹窗
- **其他上传工具**：YouTube Studio 网页、剪映直接发布（不支持双语标签、缩略图独立控制）

## 前置条件（一次性）

1. Google Cloud 项目 → 启用 YouTube Data API v3
2. OAuth 2.0 Desktop 凭证 → `client_secret.json`
3. 测试用户：在 https://console.cloud.google.com/apis/credentials/consent 添加 Gmail
4. 文件放在 `D:\tools\youtube-upload\client_secret.json`
5. 运行一次脚本完成 OAuth 授权（浏览器弹窗 → 授权 → token 自动缓存）

## 速查

```powershell
# 从任意位置，指向 YouTube_upload 目录即可
python D:\tools\youtube-upload\upload_youtube.py --dir "D:\HHH\自媒体\黄皮油柑做饭\<date>-<slug>\YouTube_upload"

# 手动指定参数
python D:\tools\youtube-upload\upload_youtube.py --video "path/video.mp4" --title "..." --privacy unlisted
```

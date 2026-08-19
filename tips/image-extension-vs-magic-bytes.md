# 图片扩展名 ≠ 实际格式：下载后验魔数，别信 URL 扩展名

type: diagnosis
date: 2026-08-19
source: Obsidian 书籍封面本地化（DK设计全书，Google Books 返回 PNG 但存成 .jpg）

## 现象
下载的图片文件名 `.jpg`，但 Obsidian / 编辑器按 JPEG 解析异常，或图片实际是 PNG。`DK设计全书.jpg` 前 8 字节是 `89 50 4E 47 0D 0A 1A 0A`（PNG 魔数），不是 JPEG 的 `FF D8 FF`。

## 根因
CDN/图片服务返回的 Content-Type 与 URL 扩展名不一致（Google Books 封面 URL 写 `.jpg` 但响应是 PNG）。下载工具按 URL 或响应头存文件名，不做内容校验，导致扩展名说谎。

## 修复/步骤
1. 读文件前 8 字节判断真实格式：
   - JPEG：`FF D8 FF`
   - PNG：`89 50 4E 47 0D 0A 1A 0A`
   - GIF：`47 49 46 38`
   - WebP：`52 49 46 46`（RIFF）+ 偏移 8 处 `57 45 42 50`（WEBP）
2. 扩展名与魔数不符 → 改扩展名（`.jpg`→`.png`），同步所有引用该文件的地方（md 的 `![...](assets/xxx)`）
3. PowerShell 验魔数：`[System.IO.File]::ReadAllBytes($p)[0..7] | ForEach-Object { $_.ToString("X2") }`

## 预防
- 批量下载图片后统一跑魔数校验，别信 URL/扩展名
- 落盘前用 `file` / 魔数判断真实格式，扩展名从魔数派生，不从 URL 派生

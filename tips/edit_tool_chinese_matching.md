# Edit tool 中文内容匹配失败

type: encoding
date: 2026-07-23
source: scheduler dashboard CSS tokenization — index.html brand kit 字体层级编辑

## 现象
Edit 工具对含中文字符的 `old_string` 反复报 "String to replace not found in file"，即使 Read 工具显示内容完全匹配。无报错原因提示，静默失败。

## 根因
未确认。推测 Edit 工具在 Windows 环境下处理 UTF-8 中文文件时，换行符（CRLF vs LF）或 Unicode 规范化形式（NFC/NFD）存在细微差异，导致字节级匹配失败。

## 修复
改用不含中文的短唯一字符串做锚点。例如：
- 匹配 `--f-display · Noto Serif SC · --fs-h1 22px · 页面标题` → 失败
- 改为匹配 `--f-display · Noto Serif SC · --fs-h1 22px` → 成功

策略：
1. 从 `old_string` 中剥离中文部分，只保留 ASCII/Latin 片段
2. 如果必须匹配中文，尝试单行短字符串，不跨行
3. 多次失败 → 改用 `sed` 或 `bash` 直接操作文件

## 预防
- 编辑含中文的 HTML/CSS/JS 时，优先用不含中文的锚点字符串
- `replace_all` 场景下特别小心 — 一次失败整批回滚

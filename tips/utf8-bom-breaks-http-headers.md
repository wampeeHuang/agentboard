# UTF-8 BOM 导致 HTTP header 编码失败
type: diagnosis
date: 2026-06-14
source: 小红书 scraper cookie 文件带 BOM，httpx 请求头编码报错

## 现象
httpx 请求失败：`UnicodeEncodeError: 'ascii' codec can't encode character '﻿' in position 0`
Cookie 解析后第一个 key 变成 `'﻿a1'` 而非 `'a1'`。

## 根因
文件以 UTF-8 with BOM 保存（Windows 某些编辑器默认行为）。Python `open(file, encoding='utf-8')` **不会**自动去掉 BOM，U+FEFF 被当作第一个 cookie key 的前缀字符。拼进 Cookie header 后，httpx 尝试 ASCII 编码整个 header 值，U+FEFF 触发 UnicodeEncodeError。

## 修复
```python
# 读取时用 utf-8-sig 代替 utf-8
open(file, 'r', encoding='utf-8-sig')
```

## 预防
- 任何从外部输入（用户粘贴、文件导入）读取文本并拼入 HTTP header 时，先用 `utf-8-sig` 解码
- 写文件时用 `encoding='utf-8'`（不加 BOM），Python 默认就不加

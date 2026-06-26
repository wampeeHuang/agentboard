# UTF-8 BOM 导致 SRT 第一条字幕被静默丢弃

type: bug
date: 2026-06-25
source: 猫波信号站 pipeline stage_06 输出缺少第一条字幕

## 现象

SRT 文件的第一条字幕（索引号 1）在解析时被静默丢弃。表现为：
- `read_srt()` 返回的条目数比文件实际内容少 1
- 文件开头有正常内容，但第一条解析不到
- 没有任何错误信息
- 仅影响第一条，后续条目正常

## 根因

UTF-8 BOM (`﻿`, bytes: EF BB BF) 粘在第一条的索引号上：
- 原始文本: `1\n00:00:00,000 --> 00:00:05,120\n...`
- 实际解析到: `﻿1` 作为第一行的索引号
- `int('﻿1')` 抛出 ValueError
- `parse_srt()` try/except 捕获后 `continue`，静默跳过

Python `Path.read_text(encoding='utf-8')` **不会**自动跳过 BOM（与 `utf-8-sig` 不同）。

## 修复

```python
# _lib.py parse_srt()
# 修复前:
idx = int(lines[0].strip())

# 修复后:
idx = int(lines[0].strip().lstrip('﻿'))
```

## 预防

- 更健壮的方案：`Path.read_text(encoding='utf-8-sig')` 自动处理 BOM
- 注意：`write_text` 如改用 `utf-8-sig` 会**写入** BOM，可能影响其他下游消费方
- 如果在 try/except 中静默跳过条目，至少打印一行 warning

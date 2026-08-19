---
type: diagnosis
date: 2026-08-02
source: admin.html 重写实测 — 203 行 BOM 与 batch_quote.py 逐行对比
---

# Python 3 vs JS regex `\b` — 中文字符行为差异

## 现象

同一 regex `\b\d+\.?\d*T-\d+P\b`，测试文本 "1.25T-2P卧贴"：
- Python 3 `re.search()` → **不匹配**
- JavaScript `RegExp.test()` → **匹配**

结果：1/203 行分类不一致（JS=connector, Python=unknown）。

## 根因

Python 3 `re` 模块**默认 UNICODE 模式**，`\w` 包含 Unicode 字母（含中文）。
JavaScript `RegExp`（即使加 `u` 标志），`\w` = `[a-zA-Z0-9_]`，不含中文。

所以 "P卧" 边界：
- Python: P=word, 卧=word → 无 `\b`
- JS: P=word, 卧=non-word → 有 `\b`

## 修复

不可调和。如需统一，用显式 ASCII 边界替代 `\b`：
```
(?<![a-zA-Z0-9_]) 替代 leading \b
(?![a-zA-Z0-9_])  替代 trailing \b
```
但需改数据源（pricing_lookup.json 中的 classifier regexes）。

## 预防

跨语言共享 regex 时，用 ASCII-only 边界而非 `\b`，或在 Python 端显式加 `re.ASCII` 标志。

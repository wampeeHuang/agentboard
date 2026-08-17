# Python regex `\b` + `re.ASCII` + 中文 = 静默失效

type: pitfall
date: 2026-08-01
source: 德城BOM报价，classifier regex匹配中文封装名失败

## 现象

```python
re.compile(r'\b连接器\b', re.IGNORECASE | re.ASCII)  # 从不匹配中文
re.compile(r'\bQFP\b', re.IGNORECASE)  # 匹配 QFP 但不匹配 CQFP（字母紧邻不构成边界）
```

## 根因

1. `re.ASCII` 让 `\w` 只匹配 `[a-zA-Z0-9_]`，中文是 `\W`，导致 `\b` 在中文字符前后行为异常
2. 去掉 `re.ASCII` 后中文变 `\w`，但 `\b` 在"字母+数字"相邻时不生效（如 QFP10、CQFP）
3. 中英混合文本（如 `SS54肖特基`）中，`\w\w` 相邻无 `\b`

## 修复

全部丢弃 `\b`，依赖足够具体的 pattern + 有限的搜索文本范围（仅封装名+描述+型号）来防止误匹配。

## 预防

处理中文文本的正则匹配时，默认不用 `\b`。如果需要边界，用 `(?:^|(?<=\s)|(?<=[^\w]))` 替代。

# Python `//` 在 float 操作数时隐性返回 float，破坏整数预期接口
type: diagnosis
date: 2026-08-11
source: 猫波信号站 orchestrator.py `_cover_title()` 截断逻辑，`str.rfind(d, 0, limit)` 抛 TypeError

## 现象
```python
MAX_COVER_CHARS = SAFE_W // (MIN_TITLE_FS * 0.85)  # 1440 // 110.5 = 13.0 (float!)
MAX_LINE = MAX_COVER_CHARS + 6  # 19.0 (float!)
text.rfind(d, 0, MAX_LINE)      # TypeError: slice indices must be integers
```

`//` 看上去是整数除法，但只要任一操作数是 float，返回值就是 float。`13.0` 和 `13` 在使用 `type()` 之前完全看不出区别。

## 根因
Python `//` 的返回类型取决于操作数：
- `int // int → int`
- `float // int → float`
- `int // float → float`

`MIN_TITLE_FS * 0.85` 隐式产生 float（130 * 0.85 = 110.5），导致 `//` 返回 float。

## 修复
```python
MAX_LINE = int(MAX_COVER_CHARS) + 6
```

## 预防
任何涉及 `//` 且后续传给需要 int 的函数（`rfind`、`range`、切片、`randint` 等）的表达式，用 `int()` 包裹或确保两个操作数都是 int。涉及乘除法的常量定义统一用 `int()` 收口。

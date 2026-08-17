# 注释里的约束不是约束，代码里的才是
type: diagnosis
date: 2026-08-05
source: 猫波信号站 — MIN_TITLE_FS 声明为硬地板但代码未钳位，封面字号 114px < 120px 通过

## 现象

cover_design.py 声明 `MIN_TITLE_FS = 120`，注释写"硬地板"。但实际生成的封面标题字号 114px，用户报告字体太小。

## 根因

常量声明了，但唯一的调用方 `_fit_size()` 没引用它。字号计算 `int(max_fs * safe_max / tw)` 可以返回任意值，没有钳位。

代码路径：`gen_cover.py → _fit_size() → return fs, font` — 这个 `fs` 从未被 `min()` 或 `if fs < min_fs` 限制过。Python 不会因为"你起了一个好变量名"就自动 enforce。

## 修复

在 `_fit_size()` 返回前加钳位：

```python
if fs < min_fs:
    fs = min_fs  # 硬地板，不软
```

而不是只写在注释里。

## 预防

- 声明设计常量后，grep 所有调用方，确认常量被实际引用
- 配置常量和强制执行之间的 gap，需要测试覆盖——写一个边界值的测试 case
- 自检问题："如果我把这个常量值改成 999，生产结果会变吗？" 不变 = 没接上

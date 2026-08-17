# 规则排序决定分类结果

type: pattern
date: 2026-08-01
source: 版式画廊 extract-tokens.js CSS 变量分类（3 轮迭代）

## 现象

CSS 变量分类管线中，`--text-xs`（字号 0.75rem）被错误分到 color 类别，typography 类别为空。根因：color 匹配规则排在 typography 前面，`text` 模式贪婪匹配了所有 `--text-*` 变量。

## 根因

多个正则/模式按顺序匹配时，前面的规则有优先权。宽泛模式（`text` 匹配 color）排在精确模式（`text-xs` 匹配 typography）之前 = 误分类。

## 修复

重排规则顺序：精确语义 → 模糊语义 → 值类型兜底。

```
typography (text-\d|text-xs|font|sans|...)  ← 先
spacing (space|gap|gutter|...)              ←
radius (radius|round|...)                   ←
shadow (shadow|elevation|...)               ←
motion (ease|duration|...)                  ←
color (accent|bg|text|border|...)           ← 后
value-type fallback (isColor? isSize?)      ← 最后
```

## 预防

- 任何"多规则匹配→分类"的场景，先检查是否存在宽泛规则拦截精确规则的情况
- 测试用例必须包含"精确子集被宽泛规则误拦截"的组合（如 `text-xs` 同时命中文 `text` 和 typo `text-xs`）
- 通用性原则：specific 先于 generic，semantic 先于 heuristic

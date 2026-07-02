# ASS Style 行字段位置 — Outline 是第 17 字段不是第 6

type: debugging
date: 2026-07-02
source: 猫波信号站 validate_outputs.py ASS bord 检查修复

## 现象
正则 `Style:[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,([^,]*),` 想抓 Outline 值，结果抓到的是 OutlineColour（颜色 `&HFF000000&`）而不是 Outline（宽度 `3`）。int("&HFF000000&") 抛 ValueError，检查静默跳过，不报警。

## 根因
ASS v4 Style 格式有 23 个逗号分隔字段：
```
Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour,
Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle,
Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
```
Outline 是第 17 个字段（0-indexed = 16 个逗号后）。第 6 个字段是 OutlineColour（描边颜色），不是 Outline（描边宽度）。两个名字太像，一眼扫过去容易搞混。

## 修复
```python
m = re.search(r"Style:(?:[^,]*,){16}([^,]+)", ass_text)  # skip 16 fields → field 17
```

## 预防
涉及 ASS 文件解析的验证脚本，字段位置用显式索引（`{16}`）而不是手数逗号。ASS 格式字段位置永远不会变，硬编码索引是安全的。

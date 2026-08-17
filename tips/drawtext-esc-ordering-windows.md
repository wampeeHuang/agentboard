# Python drawtext filter: `esc()` ordering on Windows

type: diagnosis
date: 2026-08-07
source: Mimino subtitle burn project — `gen_filter_cn.py`

## 现象

ffmpeg drawtext 滤镜渲染中文乱码，或 `\n` 被渲染为原始字符而非被处理。

## 根因

Windows 上 Python 写文件时 `\n` → `\r\n`（CRLF）。若 `esc()` 函数中**先转义反斜杠**（`\` → `\\`），文本中的 `\n` 已经变成 `\\n`（双反斜杠+n），`\r` 无法被识别为换行，变成 drawtext 参数里的裸 `\r`，破坏渲染。

三个因素叠加才触发：Windows CRLF + Python 写文件 + esc() 顺序错误。单独任何一个都不会导致乱码。

## 修复

**`\n` 处理必须在 `\` 转义之前。**

```python
# 正确顺序
def esc(s):
    s = s.replace('\n', ' ')        # ① 换行→空格（必须在 \\ 之前！）
    s = s.replace('\\', '\\\\')     # ② 反斜杠
    s = s.replace(':', '\\:')       # ③ 冒号
    s = s.replace("'", "’")    # ④ 单引号
    s = s.replace('%', '\\\\%')     # ⑤ 百分号
    return s
```

## 预防

任何 drawtext `esc()` 函数，第一条规则永远是：**先处理换行，再转义反斜杠。** 在 skill `font-config.md` 和 `make_filter.py` 中已固化此顺序。

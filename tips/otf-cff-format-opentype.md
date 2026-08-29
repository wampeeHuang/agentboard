---
type: fact
date: 2026-08-23
source: 字荐字体库 @font-face 加载 OTF 失败排查
---

# OTF 分两种：TrueType(glyf) 和 CFF，CFF 必须用 format('opentype')

## 现象
`@font-face` 里写 `format('truetype')`，部分 .otf 字体加载不出来，另一些正常。同目录同名 .otf 行为不一致。

## 根因
.otf 扩展名只是外壳，内部结构两套：
- 文件头魔数 `\x00\x01\x00\x00` → TrueType 轮廓（glyf），对 CSS 来说是 `format('truetype')`
- 文件头 `OTTO` → CFF 轮廓（PostScript 曲线），CSS 必须声明 `format('opentype')`

写死 `format('truetype')` 的 .otf 若是 CFF 结构，浏览器拒绝加载。

## 修复
读文件头前 4 字节判断，按结构写 format：

```python
with open(path, 'rb') as f:
    magic = f.read(4)
is_ttf = magic == b'\x00\x01\x00\x00'   # TrueType/glyf
is_cff = magic == b'OTTO'               # CFF → format('opentype')
```

CSS：CFF 字体用 `src: url(x.otf) format('opentype');`。

## 预防
凡程序化生成 @font-face（catalog 扫描、批量转 CSS），必须按文件头魔数判定 format，不按扩展名猜。ext 猜不了内部结构。

---
type: diagnosis
date: 2026-08-23
source: 字荐字体库解压站酷快乐体，Python zipfile 文件名乱码
---

# Python zipfile 解出中文文件名乱码（GBK 被当 cp437）

## 现象
zipfile 解压含中文文件名的压缩包，文件名变 `ÀÕ£º` 一类乱码。同文件在 Windows 资源管理器/7-Zip 里显示正常。

## 根因
ZIP 规范文件名默认 cp437 编码。中文 zip 大多是 GBK 编码文件名但没设 UTF-8 标志位（`flag_bits & 0x800`），Python zipfile 照 cp437 解码 → 乱码。

## 修复
按 flag_bits 判断，没设 UTF-8 标志就手动转回 GBK：

```python
import zipfile
with zipfile.ZipFile(p) as z:
    for info in z.infolist():
        name = info.filename
        if not (info.flag_bits & 0x800):
            try:
                name = info.filename.encode('cp437').decode('gbk')
            except UnicodeDecodeError:
                pass  # 不是 GBK，保持原样
        z.extract(info, out_dir)
```

## 预防
脚本里只要解 zip 且可能有中文文件名，就按 flag_bits 做 cp437→gbk 回退。先怀疑编码，别急着改源数据。

---
type: diagnosis
date: 2026-07-21
source: O4 美食管线下载脚本，重试时组织文件步骤崩溃
---

# Python Path.rename Windows 覆盖陷阱

## 现象
```python
f.rename(target_path)  # Windows: FileExistsError [WinError 183]
```
只在 Windows 上触发。目标文件已存在时抛异常而非覆盖。

## 根因
Python `Path.rename()` 底层调 `os.rename()`。POSIX 上自动覆盖，Windows 上目标存在就报 `FileExistsError`。AI 生成代码习惯用 POSIX 语义，Windows 实测才暴露。

## 修复
```python
os.replace(str(src), str(dst))  # 原子替换，跨平台都覆盖
```
或 `shutil.move()`（同盘也走 rename，同样问题）。

## 预防
文件移动/重命名涉及覆盖的场景，直接用 `os.replace()`，不碰 `Path.rename()`。

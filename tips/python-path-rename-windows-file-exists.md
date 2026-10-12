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

## 补充（2026-10-01）：换成 `os.replace()` 之后的下一层坑 —— 目标被占用就是 WinError 5

```python
os.replace(tmp, target)
# PermissionError: [WinError 5] 拒绝访问。: '...\\x.json.xxx.tmp' -> '...\\x.json'
# 或 [WinError 32] 另一个程序正在使用此文件，进程无法访问。
```

**触发条件**：目标文件**正被任何进程持有句柄**（未给 `FILE_SHARE_DELETE`）。实测最小复现：
`open(target, 'rb')` 然后 `os.replace(tmp, target)` → 立刻 `WinError 5`。
真实来源：杀毒/索引服务实时扫描**刚写完的** `.json`、并发读者、另一个写者。

**为什么危险**：它是**瞬时**锁（毫秒级），但抛出位置常常在「主流程已经成功、正要收尾」的那一步。
若调用方不设防，一次**已经成功的业务结果会被整个丢弃**。灵感图库的真事故：
`record_status()` 写 AI 服务状态缓存时踩到它，而它在 `return value` **之前**，
且 `PermissionError` 是 `OSError` 子类、**不被业务侧那几个 `except` 捕获** ——
三张图因此被标记成「AI 分类失败」，其实识图早就成功返回了。

**修复模板**（四条缺一不可）：
```python
def atomic_write(path, text, retries=5, base_delay=0.04):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name('%s.%s.tmp' % (path.name, uuid.uuid4().hex))  # ② 唯一临时名
    try:
        with tmp.open('w', encoding='utf-8', newline='\n') as s:   # ③ 显式钉住行尾
            s.write(text); s.flush(); os.fsync(s.fileno())
        for attempt in range(retries):                           # ① 退避重试
            try:
                os.replace(tmp, path); return True
            except PermissionError:
                if attempt == retries - 1: return False
                time.sleep(base_delay * (attempt + 1))
            except OSError:
                return False
    finally:
        tmp.unlink(missing_ok=True)                              # ④ 必须清理
```
- ① 瞬时锁靠重试越过（不重试＝必然偶发失败）。
- ② 固定 `.tmp` 名（如 `with_suffix('.tmp')`）会让并发写者互相踩踏。
- ③ 文本模式默认把 `\n` 翻成 `os.linesep`，不钉住 `newline='\n'` 会在 Windows 上静默写 CRLF。
- ④ **没有 `finally` 的话，每失败一次就在目录里留一个孤儿 `.tmp`**（旧代码就留了好几个）。

**按数据性质分档返回**——不是一律吞、也不是一律抛：
- **可重建派生缓存**（状态/索引/缩略图）→ best-effort，**失败不上抛**：内存状态已对，UI 仍可用。
- **真相源**（用户配置、`_meta.md`）→ 重试后仍失败**必须报错**，且原文件与临时残片都不能变。

**判据别写成恒真**：验证时要在**真实运行的服务**上占住句柄复现，并单独确认
「同一占用方式确实会让裸 `os.replace` 抛 `WinError 5`」——否则 200 OK 可能只是"锁根本没生效"。
反面教材：只跑单测打桩 `side_effect=PermissionError`，那证明不了真实锁存在。


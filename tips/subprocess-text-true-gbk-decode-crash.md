---
type: diagnosis
domain: general
author: claude
date: 2026-09-01
source: push_github.py subprocess.run(text=True) 在 GBK locale 下读 UTF-8 stdout 崩溃
---

# Python subprocess `text=True` 在本机 GBK locale 下读 UTF-8 输出崩

## 现象

`subprocess.run(gh api ... , text=True, capture_output=True)` 拿 GitHub API 返回的 UTF-8 JSON，直接 `UnicodeDecodeError` 崩溃。命令本身成功，只是解码崩。

## 根因

本机 Windows locale 是 GBK。`text=True` 让 subprocess 用 locale 编码（GBK）解码子进程 stdout，而外部进程输出 UTF-8，GBK 解不动就抛异常。

## 修复/步骤

```python
r = subprocess.run([...], capture_output=True)  # bytes 模式
out = r.stdout.decode('utf-8', 'replace')       # 显式按 utf-8 解码
```

- 拿掉 `text=True`，用 bytes 模式
- 外部进程是 JSON/UTF-8 时统一 `decode('utf-8')`
- `'replace'` 兜底防单字节错误直接崩

## 预防

- 本机所有 Python ↔ 外部进程文本交换走 bytes + 显式 decode，不靠 locale
- 写到文件再读也行，但读写都必须显式指定 encoding，不吃系统默认

# Windows 中文系统 Python `open()` 默认 GBK，读 UTF-8 文件静默乱码

type: diagnosis
date: 2026-06-16
source: youtube-content-pipeline 字幕管线开发，Python 读写 SRT/中文文本全程乱码

## 现象

`open('file.txt').read()` 读到乱码，控制台打印 `你好世界` 变成 `ä½ å¥½ä¸ç`。更隐蔽的是：有时中文刚好落在 GBK 合法范围，不会报错，只是内容全错——字幕后半段变成不可读的符号串。

## 根因

Windows 中文版的系统代码页是 GBK（cp936）。Python 3 的 `open()` 在没有指定 `encoding` 时，默认使用 `locale.getpreferredencoding()`，在中文 Windows 上返回 `'cp936'`。

而 Claude Code / Agent 生成的代码、yt-dlp 下载的字幕、DeepSeek API 返回的翻译，全部是 UTF-8。GBK 打开 UTF-8 → 字节序列被错误解释 → 中文变成乱码。

更坑的是：如果文件只有 ASCII + 简单中文，GBK 可能"恰好"解对——测试时正常，跑全量数据才炸。因为 GBK 和 UTF-8 在 ASCII 范围兼容，部分 CJK 字节也落在 GBK 双字节范围内。

## 修复

每条路径用 `encoding='utf-8'`：

```python
# 错误（中文 Windows 上等于 encoding='cp936'）
text = path.read_text()
with open(path) as f: ...

# 正确
text = path.read_text(encoding='utf-8')
with open(path, encoding='utf-8') as f: ...
```

Path API 也一样：`Path.read_text()` 和 `Path.write_text()` 都需要显式传 `encoding='utf-8'`。

## 预防

- 本机所有 Python 项目的文件 I/O 一律显式写 `encoding='utf-8'`，不依赖默认值
- 项目根 `.editorconfig` 设 `charset = utf-8`
- 怀疑编码问题时，先用 `file.read_bytes()[:100]` 看原始字节——如果中文以 `\xe4\xb8` 开头是 UTF-8，以 `\xc4\xe3` 开头是 GBK

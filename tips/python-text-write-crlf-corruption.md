---
type: diagnosis
date: 2026-08-13
source: wiki check.js 质量闸门重建后报 48 FAIL，全报"标签分类缺失"，实际字段都在
---

# Windows Python 文本模式写文件把 LF 变 CRLF——正则 `/\n/` 静默失配

## 现象
Python 脚本用 `open(path, 'w', encoding='utf-8')` 批量改写 md 文件后，Node 写的 check.js 大量 FAIL，报"标签分类缺失/违规"。但打开文件看，字段明明都在。

## 根因
Windows 上 Python 文本模式写文件做隐式换行转换：`\n` → `\r\n`（CRLF）。check.js 用 `open(...,'utf-8')` 读（不转），再用正则 `/## 标签分类\n/` 匹配。CRLF 下 `#` 后是 `\r\n`，`\n` 前多了个 `\r`，正则失配。字段存在但匹配失败 = 静默假阴性——比报错危险，因为没人知道出事了。

## 修复
Python 写文件用二进制模式，换行自己控制：
```python
raw = open(p, 'rb').read().replace(b'\r\n', b'\n')
open(p, 'wb').write(raw.encode('utf-8'))
```
或者 text 模式打开时用 `newline=''` 禁止转换：`open(p, 'w', encoding='utf-8', newline='')`。

## 预防
Windows 上 Python 写文件给 Node/其他工具读之前，先问：读取方有没有用 `\n` 或 `\r\n` 敏感的匹配/解析？有 → 二进制模式 `wb` 手动控换行，别让 Python 做隐式转换。同族坑：Python stdin 读 GBK（windows-gbk-python-io）、PowerShell 写 JSON 带 BOM（utf8-bom-breaks-http-headers）。

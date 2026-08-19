---
type: diagnosis
date: 2026-08-04
source: Portfolio agentboard.html 预览编码损坏——PowerShell 替换文本后标题栏出现 �� 乱码
---

# PowerShell Set-Content 无 -Encoding → GBK 炸 UTF-8 文件

## 现象

PowerShell 读 UTF-8 文件 → 替换字符串 → 写回。浏览器打开后中文变乱码（`工具�?· Agentboard`）。

## 根因

PowerShell 5.1 `Set-Content` 默认编码是系统 ANSI code page（中文 Windows = GBK），不是 UTF-8。`Get-Content -Raw | ForEach-Object | Set-Content -NoNewline` 这条链：
- `Get-Content -Raw`（无 `-Encoding`）→ 按 ANSI 读 UTF-8 文件 → 部分中文已损
- `Set-Content -NoNewline`（无 `-Encoding`）→ 按 ANSI 写 → 进一步损坏

和已有的 PS JSON BOM 陷阱是镜像问题：那个是**读方向**（PS 写 BOM → Node.js 读炸），这个是**写方向**（PS 写→编码不对→文件损毁）。

## 修复

用 Node.js 做文本替换，UTF-8 原生安全：

```js
const fs = require('fs');
let content = fs.readFileSync('file.html', 'utf8');
content = content.replace(/old/g, 'new');
fs.writeFileSync('file.html', content, 'utf8');
```

不用 PS 管道处理文本文件。

## 预防

- PowerShell 5.1 做文本文件修改 → 一律改用 Node.js 脚本
- 必须用 PS → `-Encoding utf8`（但有 BOM）或 `-Encoding utf8NoBOM`（PS 7+ 才有）
- 文件改完后立即检查：`node -e "console.log(require('fs').readFileSync('f.html','utf8').slice(0,100))"`

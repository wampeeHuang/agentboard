---
type: diagnosis
date: 2026-08-07
source: gallery deploy — 全站中文乱码 30 分钟
---

# PowerShell `>` 重定向 → UTF-16 LE 编码陷阱

## 现象

`git show HEAD:file > path` 恢复文件 → 服务器 `charset=utf-8`，浏览器全屏乱码。

## 根因

Windows PowerShell 5.1 的 `>` 重定向不是原始字节流。输出编码默认 **UTF-16 LE with BOM**（`FF FE`）。

```
# PowerShell 5.1
git show HEAD:index.html > public/index.html   # → UTF-16 LE 写入！

# 文件前 4 字节：FF FE 3C 00 （UTF-16 LE BOM + '<' + null）
# 服务器声明 charset=utf-8
# 浏览器按 UTF-8 解码 → '-' + null + 'D' + null + 'O' + null... → 乱码
```

Bash 的 `>` 是原始字节流，不改变编码。PowerShell 不是。

## 修复

永远不用 PowerShell 做文件写入。走 Node.js：

```javascript
// 从 git 提取文件为 UTF-8
const { execSync } = require('child_process');
const fs = require('fs');
const buf = execSync('git -C <repo> show HEAD:<path>', { encoding: 'buffer' });
let content = buf.toString('utf-8');
if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1); // 去掉 BOM
fs.writeFileSync(destPath, content, 'utf-8');
```

或直接用 `git checkout HEAD -- <file>`（不经过 PowerShell 管道）。

## 预防

- Windows 上所有文件 I/O 走 Node.js，禁止 PowerShell `>` / `Out-File` / `Set-Content`
- 部署管线加 BOM 扫描门禁：文件头 2 字节 = `FF FE` → 硬阻断
- 本地验证：`node -e "const b=fs.readFileSync(f); if(b[0]===0xFF&&b[1]===0xFE) throw 'UTF16LE!'"`

## 关联

- `tips_powershell_json_bom.md` — PowerShell 写 JSON，Node.js 读 → BOM 炸 JSON.parse
- `tips_python_pipe_encoding_gbk_windows.md` — Windows 管道编码的另一面（GBK stdin）

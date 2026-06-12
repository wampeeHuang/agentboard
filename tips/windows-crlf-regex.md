# Windows CRLF 破坏正则
type: feedback
date: 2026-06-12
source: SKILL.md frontmatter 正则匹配不到

## 现象
`/^---\n([\s\S]*?)\n---/` 在 Windows 上匹配不到 `---\r\nname: ...\r\n---`。skill 扫描返回空结果。

## 根因
Windows 文本文件默认 CRLF 换行（`\r\n`），不是 LF（`\n`）。前端代码习惯写 `\n`，mismatch。

## 修复
用 `\r?\n` 代替 `\n`：
```javascript
// 不工作
var fmMatch = skillMd.match(/^---\n([\s\S]*?)\n---/);

// 工作
var fmMatch = skillMd.match(/^---\r?\n([\s\S]*?)\r?\n---/);
```

同时全文先做 normalize：
```javascript
body = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
```

## 排查方法
用 hex 看文件前几个字节：
```bash
# Linux
od -A x -t x1z -v SKILL.md | head -3

# Windows PowerShell
powershell -Command "Format-Hex SKILL.md | Select-Object -First 10"
```
如果 `---` 后面是 `0d 0a` 而不是 `0a`，就是 CRLF。

## 预防
- JS 正则匹配文件内容时，换行一律用 `\r?\n`
- 读文件后可以先 normalize 换行符，避免后续每个正则都要处理

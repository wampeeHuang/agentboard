---
type: diagnosis
date: 2026-07-22
source: github-mgmt 批量推送 32 个仓库 README — gh api PUT 全部 400
---

# PowerShell JSON BOM 炸 GitHub API → HTTP 400 "Problems parsing JSON"

## 现象

PowerShell 生成 JSON body 文件，`gh api --input` 提交，GitHub API 全返回：
```
HTTP 400 {"message":"Problems parsing JSON"}
```
JSON 内容肉眼检查完全合法，`python3 -c "json.loads()"` 也通过。

## 根因

PowerShell `[System.IO.File]::WriteAllText(path, body, [System.Text.Encoding]::UTF8)` 在文件头写了 BOM（`0xEFBBBF`）。`gh api --input` 直接读文件发送，BOM 被当作 JSON body 的一部分传给 GitHub API。GitHub 服务端 JSON parser 遇到 BOM → 400。

同理 `Out-File -Encoding UTF8` 和 `Set-Content -Encoding UTF8`（PS 5.1 的 UTF8 都带 BOM）。

## 修复

用 Node.js 写 JSON 文件，默认无 BOM：

```js
const fs = require('fs');
const body = JSON.stringify({message: 'Add README.md', content: base64});
fs.writeFileSync(bodyPath, body, 'utf8');  // 无 BOM
```

再跑 `gh api --input` 即通过。

## 预防

- PowerShell 写 JSON → 外部 CLI 消费（gh/curl/任何 HTTP client）：不写 PowerShll，用 Node.js
- 如果必须 PowerShell：`[System.Text.UTF8Encoding]::new($false).GetBytes($content)` + `[System.IO.File]::WriteAllBytes()`，或 PS 7+ 用 `-Encoding utf8NoBOM`
- 同类 BOM 坑：`powershell-json-bom-nodejs.md`(Node.js 读)、`utf8-bom-breaks-http-headers.md`(HTTP headers)、`utf8_bom_srt_parse.md`(SRT 解析)

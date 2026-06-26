# PowerShell UTF-8 JSON 被 Node.js 读 → BOM 炸 JSON.parse

type: pitfall
date: 2026-06-25
source: 标题知识库 L1 分析 + 人物数据清洗

## 现象

Node.js `JSON.parse()` 报错：
```
SyntaxError: Unexpected token '﻿', "﻿{... is not valid JSON
```
错误信息里那个 `﻿` 肉眼看不见，盯着代码看十分钟看不出问题。

## 根因

PowerShell `Out-File -Encoding UTF8` / `Set-Content -Encoding UTF8` 会在文件头写 BOM（`0xFEFF`）。Node.js 的 `fs.readFileSync` 不会自动剥离 BOM，传给 `JSON.parse` 就炸。

## 修复

读 JSON 前加一行：
```js
let raw = fs.readFileSync(filePath, 'utf-8');
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const data = JSON.parse(raw);
```

## 预防

- PowerShell 写 JSON 给 Node.js 读 → 读端必须加 BOM guard
- 或者 PowerShell 用 `-Encoding utf8NoBOM`（PS 5.1 不支持，需要 PS 7+）
- 或者用 Node.js 写 JSON（`fs.writeFileSync` 默认无 BOM），彻底避开

---
type: diagnosis
date: 2026-08-28
source: tree-drift 检查②递归后 /api/audit 报缺 tips-panel.js
---

# 树注释文件名写全扩展名，别用 / 缩写

## 现象

`/api/audit` tree 块报「缺 tips-panel.js」——文件明明在 `web/shared/`，树注释也写了 `tips-panel.css/js`。

## 根因

tree-drift 的 tokenize 用正则 `[一-龥A-Za-z0-9_][...]*\.(?:js|css|...)` 从树里提取文件名。`tips-panel.css/js` 里 `.js` 前是 `/` 不是点，正则读不到 `.js` 后缀 → `tips-panel.js` 没进树 token。检查②递归进子目录后把它当漏登记报了错。

## 修复

树注释把缩写写全：`tips-panel.css/js` → `tips-panel.css · tips-panel.js`。三文档（AGENT.md / README.md / 使用说明书.html）同步改。

## 预防

写树注释文件名一律写完整扩展名，别用 `/` 缩写同扩展名的多个文件。加文件改树时先想 tree-drift tokenizer 读不读得到。

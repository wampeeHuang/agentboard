---
type: diagnosis
date: 2026-08-25
source: 检查 18 个 manifest 描述是否含【端口】段，PowerShell -match 中文假阴性
---

# PowerShell `-match` 中文假阴性，中文检查以 node/UTF-8 为权威

PS 5.1 对含中文的模式做 `-match` 会因编码损耗返回 false，即使字符串实际包含该中文。据此做"全部干净"的结论会漏检。

## 现象

`$s -match '【端口】'` 返回 false，但用 node 实际读文件确认字符串含【端口】。PS 与 node 结论冲突。

## 根因

Windows PowerShell 5.1 字符串处理/管道存在编码损耗（默认 GBK/ANSI 与 UTF-8 不一致），中文模式匹配对不上。Node.js 全程 UTF-8，无此问题。

## 修复/步骤

- 中文内容的检查永远以 node 为权威：`node -e "fs.readFileSync(p,'utf8').includes('【端口】')"`
- PS 结论与浏览器/API 冲突时信 node
- 大批量文件做中文过滤/替换，直接写 node 脚本，不逐条 PS 匹配

## 预防

- 涉及中文的字符串匹配、替换、校验，第一步选 node/UTF-8 工具
- PS 只做文件枚举/结构操作，不做中文内容判断

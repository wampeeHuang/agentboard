---
type: diagnosis
date: 2026-08-18
source: 写 DeepSeek 余额监控 balance.ps1，Write 工具落盘后冒烟测试报 ParserError
---

# PowerShell 5.1 读 .ps1 无 BOM 按 GBK 解析，中文炸语法

## 现象
Write 工具写的 .ps1 文件（UTF-8 无 BOM）含中文，powershell.exe 运行时报 ParserError：
「字符串缺少终止符」「表达式或语句中包含意外的标记」，且报错行号错乱、指向正常的行。

## 根因
PowerShell 5.1 (powershell.exe) 读 .ps1 文件时：无 BOM → 按系统 ANSI 码页解析（中文 Windows = GBK）。
Write 工具落盘是 UTF-8 无 BOM，中文多字节被 GBK 误读 → 字符串边界错位 → 语法解析失败。
纯 ASCII 的 .ps1 不受影响，只有含中文才会炸。

## 修复/步骤
给文件加 UTF-8 BOM 重新保存：
```powershell
$content = [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8)
$bom = New-Object System.Text.UTF8Encoding $true
[IO.File]::WriteAllText($path, $content, $bom)
```
验证：首 3 字节应为 `EF BB BF`。

## 预防
写含中文的 .ps1 后先查首字节有无 BOM；或直接用 PowerShell 的 `Set-Content -Encoding UTF8`
（PS 5.1 该参数自带 BOM）落盘。powershell.exe 读 UTF-8 脚本必须有 BOM，否则按 GBK。

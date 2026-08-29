---
type: diagnosis
date: 2026-08-20
source: guard.ps1 飞书告警直达改造，PowerShell 版 Send-Feishu 发中文乱码排查
---

# PowerShell -File 读无 BOM 的 .ps1，脚本内中文按 GBK 误读乱码

## 现象

`guard.ps1`（UTF-8 无 BOM）里写中文告警字符串 `"Supervisor 无响应，已自动拉起（第 1 次）"`。用 `powershell -File guard.ps1` 跑起来，飞书收到 `已自动拉起（�?1 次）`，`第` 字变成替换字符。

## 根因

PowerShell 5.1 的 `-File` 模式读 `.ps1` 脚本文件时：

- 文件**有 BOM** → 按 BOM 识别编码（UTF-8 BOM → UTF-8）
- 文件**无 BOM** → 按系统 ANSI 代码页（中文 Windows = GBK/CP936）解码

UTF-8 无 BOM 的中文字节（如 `第` = `e7 ac ac`）被按 GBK 逐字节误读 → 乱码。脚本一进内存字符串就坏了，后面 `ConvertTo-Json`、`Invoke-RestMethod` 都救不回来。

node 读 `.js` 无此问题（node 默认 UTF-8 读源码），只有 PowerShell 读 `.ps1` 踩这个坑。

## 修复/步骤

把 `.ps1` 转成 UTF-8 带 BOM（`EF BB BF` 开头）：

```powershell
$p = "$env:USERPROFILE\.supervisor\guard.ps1"
$content = [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)   # 无 BOM 也按 UTF-8 读，中文不坏
[System.IO.File]::WriteAllText($p, $content, (New-Object System.Text.UTF8Encoding $true))  # $true = 带 BOM 写
```

验证：`head -c 3 guard.ps1 | xxd` 前 3 字节应是 `ef bb bf`。

## 预防

- 任何**含中文的 `.ps1`**，写完先确认是 UTF-8 带 BOM。编辑器/工具默认写无 BOM UTF-8 时，PowerShell 会静默乱码。
- 验证 PowerShell 脚本不能只看"跑通了 exit 0"——中文内容要真跑一遍看输出是否乱码（同 `powershell-crash-exit-zero-silent` 的心跳验证原则）。
- `Set-Content -Encoding utf8`（PS 5.1）写的是带 BOM，`[System.IO.File]::WriteAllText` 默认无 BOM——两套 API 编码行为不同，别混用。

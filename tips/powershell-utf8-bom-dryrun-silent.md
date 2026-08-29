---
type: diagnosis
date: 2026-08-26
source: .supervisor cleanup-runtime.ps1 —— `-DryRun` 静默失效变成真删，删了 4 个 crash 文件才发现
---

# PS 5.1 无 BOM 的 UTF-8 脚本 param 块解析坏，switch 参数静默失效

## 现象

`powershell -File script.ps1 -DryRun` 演练,日志却打 "removed:"(真实删除)而非 "DRYRUN would remove"。`$DryRun` 读到空值,switch 没绑定。同一脚本把头部中文注释删掉就正常。

## 根因

Windows PowerShell 5.1 读 .ps1 无 BOM 时按 ANSI/GBK 解码。文件是 UTF-8,多字节中文序列落在 `param(...)` 之前,GBK 解码把字节流错位,param 块没被解析成参数块 → 所有参数静默变 `$null`/`$false`。无报错、无警告——`-DryRun` 这类保护性 switch 直接失效,危险操作照常执行。

## 修复

脚本文件以 UTF-8 **带 BOM** 保存(强制 PS 5.1 按 UTF-8 解码)。已存在文件用字节前插 3 字节 `EF BB BF`:

```powershell
$b = [IO.File]::ReadAllBytes($p)
$out = New-Object byte[] ($b.Length + 3)
[Array]::Copy([byte[]](0xEF,0xBB,0xBF), $out, 3)
[Array]::Copy($b, 0, $out, 3, $b.Length)
[IO.File]::WriteAllBytes($p, $out)
```

修后验证: 跑一遍 `-DryRun`,必须看到 "DRYRUN" 字样才算绑上。

## 预防

- 含中文注释的 PowerShell 脚本,一律 UTF-8 with BOM。用 Write 工具生成的 .ps1 默认无 BOM,写完手动补
- 防御性 switch 先验证再信任: DryRun 演练第一行就该打 "DRYRUN ...",看到真实执行字样立即停
- 脚本头部注释加一行: "must stay UTF-8 WITH BOM — PS 5.1 mis-parses param in BOM-less UTF-8"
- 调用脚本的工具/任务(如 Task Scheduler)本身不带 -DryRun,不受影响;受害的是"手动演练"这条信任链

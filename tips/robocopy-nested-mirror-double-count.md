---
type: diagnosis
date: 2026-07-10
source: F 盘跑满 0 字节，排查发现 mirror 233 GB 中 _output 被抄了两遍
---

# robocopy 嵌套路径双重镜像

## 现象

F 盘 1TB 突然跑满，mirror 目录 233 GB，但源端 D:\workspace 只有 ~135 GB。

## 根因

robocopy /MIR 的源列表里有嵌套路径：

```
@{src="D:\workspace";         dst="mirror\workspace"}   ← 含 _output 子目录
@{src="D:\workspace\_output"; dst="mirror\output"}       ← 又单独镜像
```

`D:\workspace\_output` 同时是 `D:\workspace` 的子目录。第一次 robocopy 抄到 `mirror\workspace\_output`，第二次又抄到 `mirror\output`。同一份 127 GB 视频存了两遍。

## 修复

1. 删掉嵌套的源（`_output` 已被父目录覆盖，不需要单独列）
2. 如果子目录确实不该进 mirror，用 `/XD` 排除：

```powershell
@{src="D:\workspace"; dst="$destRoot\workspace"; exclude="_output"}

# robocopy 时展开:
$extraArgs = @()
if ($pair.exclude) { $extraArgs += "/XD"; $extraArgs += $pair.exclude }
robocopy $src $dst /MIR /R:2 /W:5 /NFL /NDL @extraArgs
```

## 预防

配 robocopy 源列表前，检查所有源路径是否存在嵌套关系。有嵌套 → 要么去掉子路径（已被父覆盖），要么给父路径加 `/XD` 排除。

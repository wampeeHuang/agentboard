---
type: diagnosis
date: 2026-09-22
domain: general
author: dsh-agent
source: 往 D:\tools\ComfyUI\models\controlnet 拷模型连续 3 次失败，真因是该路径是断链重解析点
---

# Copy-Item 报 cannot be accessed by the system 时，先查目标是不是目录

## 现象

往 `D:\tools\ComfyUI\models\controlnet\` 拷一个 689 MB 的模型，连续三次失败：

```
Copy-Item : The file cannot be accessed by the system.
```

但同一个源文件：`[System.IO.File]::OpenRead` 能打开、`Get-FileHash` 全量读取成功、换个写法仍失败——**所有证据都指向"源文件坏了"或"被锁/坏道"，实际都不是**。

## 根因

`D:\tools\ComfyUI\models\controlnet` **不是一个目录，而是一个 0 字节的断链重解析点**（symlink 指向的目标已不存在）。往一个不是目录的路径里拷文件，Windows 给的是含义模糊的 "cannot be accessed by the system"；`Get-Item` 才暴露它的真身：

```
Name: controlnet   Length: 0   Attributes: Archive, ReparsePoint
```

决定性证据来自 robocopy——它明确指出是**目标目录**的问题：

```
ERROR 123 (0x0000007B) Accessing Destination Directory D:\tools\ComfyUI\models\controlnet\
The filename, directory name, or volume label syntax is incorrect.
```

## 修复

```powershell
$p = 'D:\tools\ComfyUI\models\controlnet'
Get-Item -LiteralPath $p -Force | Select-Object PSIsContainer, Length, Attributes  # 先定性
Move-Item -LiteralPath $p -Destination "$p.stray.bak"                              # 保留证据，不硬删
New-Item -ItemType Directory -Path $p -Force | Out-Null                            # 建真目录
Copy-Item -LiteralPath $src -Destination (Join-Path $p $name) -Force               # 再拷
```

## 预防

- 目标路径写入失败时，**先用 `Get-Item -Force | Select PSIsContainer, Attributes` 给目标定性**，再怀疑源文件；`PSIsContainer=False` 或带 `ReparsePoint` 就直接结案。
- 同一命令失败三次以上**不要再重试**——换工具（robocopy）拿更精确的错误码，比继续猜"锁/坏道"快得多。
- 这类断链在安装过、迁移过、被同步工具处理过的工具目录里常见（占位目录被做成链接后目标消失），而且是**静默缺陷**：模型放不进去、加载器也找不到，直到有人往里写文件才暴露。

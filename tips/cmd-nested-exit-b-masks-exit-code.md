---
type: diagnosis
domain: general
author: claude
date: 2026-09-01
source: obs-shaderpicker install.bat /silent 改造——嵌套括号内 exit /b 1 返回 0，调用方误判成功
---

# cmd 嵌套括号块内 `exit /b 1` 会吞退出码返回 0

## 现象

install.bat 加 `/silent` 模式，失败路径写在 2 层深的括号块里 `exit /b 1`。agent / 脚本调 `install.bat /silent`，OBS 不存在时应退出 1，实际 `%ERRORLEVEL%` 返回 0——调用方以为安装成功。

## 根因

cmd 的 `exit /b <code>` 一旦嵌在**≥2 层嵌套括号块**内，退出码不生效，进程返回 0。同理 `rem 注释` 会吞掉同行后面所有内容，包括 `& exit /b 1`——静默分支想用 `rem` 占位会把同行的失败退出一起注释掉。

## 修复/步骤

用"标志变量 + 顶层判断"，不在嵌套块里 exit：

```bat
set "FAIL="
if <条件A> set "FAIL=1"
if <条件B> ( ... set "FAIL=1" ... )
if defined FAIL exit /b 1
```

`if defined FAIL` 是运行时求值，放在嵌套块外统一出口判断安全。静默模式的 `pause` 替换也不能用 `rem`，用无副作用命令 `ver>nul`：

```bat
if defined SILENT (set "PAUSE_CMD=ver>nul") else (set "PAUSE_CMD=pause")
```

## 预防

- 批处理里任何 `exit /b <code>` 只放顶层，失败路径一律 set 标志变量
- 静默分支占位用 `ver>nul` 不用 `rem`
- 改完必须实测退出码（`echo %ERRORLEVEL%` 或脚本里 `$LASTEXITCODE`），不能只靠"看着对"

## 相关

- 退出码**语义**设计（0/2/1）见 `deploy-script-exit-code-masking.md`——本 tip 是 cmd **语法层**吞码，互补。

---
type: diagnosis
date: 2026-08-24
source: 字荐会话 — 非提权会话写 C:\Windows\Fonts PermissionError, 多次尝试用户级安装全部不可见
---

# Windows 内置管理员安装字体: filtered token 非提权 → 走提权脚本

## 现象

内置 Administrator 账号（Windows 11）在普通会话里安装字体失败：
- 写 `C:\Windows\Fonts` 抛 PermissionError
- 写 HKLM `Fonts` 注册表被拒
- HKCU 用户级安装后字体不显示（手动加注册表不通知 FontCache；`InvokeVerb("Install")` 在本 COM 上下文静默失败）

## 根因

内置 Administrator 默认会话是 **Medium integrity（filtered token）**，`IsInRole(Administrator)=False`——管理员身份被过滤，写系统字体目录 + HKLM 需要 elevation。非交互上下文 UAC 弹窗浮不出来，无法现场提权。

## 修复/步骤

已验证可靠路径：提权脚本把 ttf 复制到 `C:\Windows\Fonts` + 写 HKLM `Fonts` 键：

1. 预写提权脚本 `_runtime/install-elev.ps1`（复制 ttf 到 `C:\Windows\Fonts`；写 `HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts`，值名 = nameID4 FullName + ` (TrueType)`/` (OpenType)`）
2. 让用户**以管理员身份手动运行**该脚本（Agent 非提权会话无法自己提权）
3. 或让用户把 ttf 直接拖进 `C:\Windows\Fonts` 手动确认
4. 用户确认后字体在系统级注册成功

## 预防

- 不要反复尝试用户级（HKCU）安装——手动加注册表不通知 FontCache，装完看不见，是死路
- 不要指望 `InvokeVerb("Install")`——本 COM 上下文静默失败
- 字体安装类任务：默认走预写提权脚本 + 用户手动运行，不浪费轮次在权限报错上

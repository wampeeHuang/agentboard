# Windows 装字体不用管理员：用户级安装到 LOCALAPPDATA + HKCU
type: method
date: 2026-08-18
source: 黄皮油柑项目部署字体（一点明体 I.MingCP、Aa厚底黑）

## 现象
复制字体到 `C:\Windows\Fonts` 报 Access denied——非管理员 shell 无系统级字体目录写权限。

## 根因
`C:\Windows\Fonts` 是系统级目录，普通 shell 无写权限。但 Windows 支持用户级字体，注册到 HKCU 即可，无需管理员。

## 修复/步骤
1. 复制 ttf 到用户字体目录：
   ```powershell
   $fontDir = "$env:LOCALAPPDATA\Microsoft\Windows\Fonts"
   Copy-Item "C:\path\to\font.ttf" $fontDir -Force
   ```
2. 注册 HKCU 字体。键名是字体内部 family name（不是文件名）+ ` (TrueType)` 后缀，值是文件名：
   ```powershell
   New-ItemProperty -Path "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts" `
     -Name "字体FamilyName (TrueType)" -Value "font.ttf" -PropertyType String -Force
   ```
3. 应用重启后生效（字体在启动时枚举，注册完当前会话的字体选择器看不到）。

## 预防
装字体默认走用户级，不碰 `C:\Windows\Fonts`。系统级只在需要"全用户可见"时用，且需管理员提权。

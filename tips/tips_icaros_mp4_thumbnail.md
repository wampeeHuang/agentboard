# Icaros 安装后 MP4 缩略图不显示

type: bugfix
date: 2026-08-01
source: 黄皮油柑做饭项目，Sony ZV-1 MP4 文件在资源管理器不显示缩略图

## 现象
装完 Icaros v3.3.6，MP4 文件仍不显示缩略图。Windows 11 原生声称支持 MP4 缩略图但 Sony 相机拍的 H.264 实际不显示。

## 根因
Icaros 默认 Thumbnail Extensions 白名单不含 `mp4`——它"尊重"Windows 原生的声明，不接管已有格式。但 Windows 原生无声失败（显示图标而非缩略图），Icaros 也不补位。

## 修复
1. `reg add HKLM\SOFTWARE\Icaros`，Thumbnail Extensions 值末尾加 `;mp4`（需管理员权限）
2. 删 `%LOCALAPPDATA%\Microsoft\Windows\Explorer\thumbcache_*.db`
3. 重启 Explorer（`Stop-Process -Name explorer; Start-Process explorer`）

默认白名单原本是：`ape;cb7;cbr;cbz;divx;epub;flac;flv;mk3d;mka;mkv;mpc;mxf;ofr;ofs;ogg;ogm;ogv;opus;rm;rmvb;spx;tak;tta;wav;webm;wv;xvid;psd`

改后：`...;psd;mp4`

## 预防
以后装 Icaros 时直接用 IcarosConfig.exe GUI 勾选 MP4，不要靠静默安装默认值。或者装完立刻检查注册表白名单含不含 mp4。

# 工具搬迁：从杂散路径统一到 D:\tools\

type: method
date: 2026-06-19
source: 4 工具搬迁到 D:\tools\，源归档到 F:\warehouse\inbox\

## 现象

agentboard 上注册的本地工具分散在三个位置（D:\HHH\tools\、D:\software\AI\、%USERPROFILE%\llama-cpp），不符合落盘约定。

## 步骤

1. **GET /api/tools 全量比对** — 47 个工具逐一过，排除 API-only/系统安装/workspace 项目/agentboard 内部
2. **manifest 路径先改** — robocopy 拷贝后立即改 projectPath + startCommand
3. **快捷方式同步更新** — 桌面 .lnk 的 TargetPath 和 WorkingDirectory 都指新路径
4. **robocopy /MOV 不用 Move-Item** — 大文件（GGUF/safetensors）Move-Item 权限易失败，robocopy 更稳
5. **源归 F:\warehouse\inbox\** — 不删源，归档到冷存储

## 踩坑

- manifest 路径 vs 实际路径不一致：comfyui/stable-diffusion 的 projectPath 写的是 D:\0-Software\AI\，实际在 D:\software\AI\
- ace-step 的 launcher.cjs 和 啟動ACE-Step.bat 源路径就不存在 — 启动命令是死引用，修复为 npm run dev
- ComfyUI 的快捷方式名为 启动ComfyUI.bat，不是 啟動ComfyUI.bat（简繁体差异）
- ace-step 没有 launcher.cjs，整个工具从未正常运行过 — 入口在 server/dist/index.js 但 dist 未编译

## 预防

- 搬迁前核对 manifest projectPath 与文件系统是否一致，不一致的先修正
- 查桌面快捷方式用 `(New-Object -ComObject WScript.Shell).CreateShortcut($lnk).TargetPath`
- 搬迁后验证：curl /api/tools 看 projectPath + 启动工具验证 running:true

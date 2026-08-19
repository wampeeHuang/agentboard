---
type: method
date: 2026-08-04
source: 2026-08-04-codex-chatgpt-plus-setup
---

# Codex 桌面端国内更新（Microsoft Store 不可用）

## 背景

Microsoft Store 国内网络不通，winget 同样失败。桌面端自动更新失效，需手动走 GitHub 镜像。

## 更新路径

GitHub 社区镜像：`github.com/Wangnov/codex-app-mirror` — 每15分钟同步官方 MSIX，SHA256 可校验。

### 步骤

1. 确认当前版本：看 `~/.codex/config.toml` 里 `BROWSER_USE_CODEX_APP_VERSION` 字段
2. 找最新 Release：`https://github.com/Wangnov/codex-app-mirror/releases`
3. 下 Windows x64 MSIX：`OpenAI.Codex_26.xxx.xxxx.0_x64__2p2nqsd0c76g0.Msix`
4. 走代理下载：

```powershell
$env:HTTPS_PROXY = "http://127.0.0.1:7897"
Invoke-WebRequest -Uri "<msix-url>" -OutFile "$env:TEMP\Codex.msix"
Add-AppxPackage -Path "$env:TEMP\Codex.msix" -ForceApplicationShutdown
```

5. 无输出 = 成功。启动：`Start-Process "shell:AppsFolder\OpenAI.Codex_2p2nqsd0c76g0!App"`

### 注意事项

- CDN `codexapp.agentsmirror.com` 国内可能也被墙，直接走 GitHub Release
- MSIX 约 700MB，需几分钟
- Add-AppxPackage 静默成功，无报错即已安装
- 安装后旧版本仍在 `~/.codex/`，引擎（CLI）和桌面端（MSIX）独立更新
- 也可用 `lusipad/unofficial-codex-app-offline` 的 portable ZIP 版本

## 相关

- CLI 更新：`npm install -g @openai/codex@latest`（不受 MS Store 限制）
- CLI 版本 >= 0.144.0 才能用 GPT-5.6

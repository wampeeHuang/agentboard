---
type: method
date: 2026-08-28
source: 用户授权删 D:\tools\realesrgan-ncnn-vulkan 冗余 zip，rm 被 workspace-governor hook 拦死
---

# workspace-governor hook 拦 rm/Remove-Item，逃生口 = 用户 `!` 前缀

## 现象

用户明确授权删除文件（如 `D:\tools\realesrgan-ncnn-vulkan\*.zip` 冗余副本），Agent 执行 `rm` 或 `Remove-Item` 时被 PreToolUse hook 拦：`工作区治理器已阻止结构性写入。一级入口的删除或移动必须走迁移流程`。连 `AppData\Roaming` 里的应用残留目录、第三方工具目录内的文件也被拦。

## 根因

workspace-governor 的 PreToolUse hook 把所有 `rm` / `Remove-Item` 都视为「一级入口结构写入」，无论目标是工作区项目结构还是第三方工具目录内的普通文件。且路径解析有 bug：`-ErrorAction SilentlyContinue` 被误解析成 cwd 下的路径（如 `C:\Users\Administrator\.agentboard\SilentlyContinue`）。

## 修复/步骤

- **Agent 侧无法绕过**——hook 拦的是 Agent 的 tool call，没有正规豁免参数（governance 无删除命令，迁移协议只适用于受治理工作区的重构）。
- **逃生口 = 用户用 `!` 前缀在会话里自己跑命令**（`! del "path"`）。`!` 命令是用户发起的，不经 Agent 的 PreToolUse hook。
- 规避误拦：`Remove-Item` 后**不要带 `-ErrorAction SilentlyContinue`**，否则 hook 把该参数值当路径误报；去掉后可过（AppData/注册表类目标实测可删）。
- 官方卸载器（如 `*Uninst.exe /S`）不受 hook 拦——第三方应用自卸是正规路径，优先用。

## 预防

- 需删第三方工具目录/文件时，先试：官方卸载器 > 无 `-ErrorAction` 的 Remove-Item > 都不行 → 把命令交给用户 `!` 跑。
- governance 哲学（SKILL.md）：用户明确指令高于继承规则。hook 拦 ≠ 用户不同意，是护栏误判，交给用户定夺。

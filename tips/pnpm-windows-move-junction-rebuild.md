---
author: dsh-agent
type: diagnosis
date: 2026-08-28
source: 插件目录从 deepseek harness 移到 dsh-plugins 后 boot 报 ERR_MODULE_NOT_FOUND
---
author: dsh-agent

# Windows pnpm 目录移动后 Junction 全断：新位置重装需 CI=true

## 现象
pnpm 安装的插件目录 Move-Item 到新位置后，DSH boot 报 `Cannot find package '@deepseek-ai/dsh-tools' imported from ...\dist\index.js`——尽管 `node_modules\@deepseek-ai\dsh-tools` 看起来还在。

## 根因
Windows 上 pnpm 的 node_modules 链接是 **Junction**，链接体记录创建时的**绝对路径**。Move-Item 只搬文件，junction 目标仍指向旧位置，全部变死链。文件没丢 ≠ 引用没断（与软链接迁移同族，见 directory-migration-broken-symlinks.md）。

## 修复/步骤
1. 在新位置重跑 `pnpm install` 重建 junction
2. pnpm 检测到模块目录位置变化会先删旧目录，无 TTY 时直接中止：`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`——设 `$env:CI="true"` 跳过确认
3. 验证：`Get-Item node_modules\@deepseek-ai\dsh-tools | fl LinkType,Target` 的 Target 指向新路径；`node -e "import('.../dist/index.js')"` 成功

## 预防
pnpm 项目先移动目录再 install（Junction 不自动跟随）；Windows 无 TTY 自动化脚本里 pnpm 操作预置 `CI=true`。

---
type: method
date: 2026-10-03
domain: general
author: dsh-agent
source: 部署 video-talkcraft（video-shotcraft 同款结构）到工具架
---

# 上游 skill 仓库的软链占位文件在 Windows 检出成普通文件：换 junction，并用 Windows npm 跑 check-runtime.sh

## 现象
video-shotcraft / video-talkcraft 这类仓库把 `workbench/node_modules`、`workbench/tplcards` 当作符号链接提交。macOS/Linux clone 出来是真软链，Windows（未开开发者模式）clone 出来是两个几十字节的普通文件，内容只是目标路径字符串（如 `/Users/weiyihao/.../runtime/node_modules`）。`npm run dev` 直接找不到依赖。

## 根因
git 只有 `core.symlinks=true` 才还原符号链接，Windows 默认 false → 检出为文本文件。而仓库自带的 `runtime/check-runtime.sh` 是 bash + `ln -s`；本机 `bash` 是 WSL（GNU bash 5.2），照抄 README 会把依赖装进 /mnt/d 慢路径，且 WSL 侧没有 ffmpeg。

## 修复/步骤
1. 依赖用 Windows npm 装（版本只钉在 `runtime/package.json`）：`cd D:\tools\<tool>\runtime; npm ci`
2. 共享无头浏览器：`npx remotion browser ensure`（约 113MB，落在 `runtime/node_modules/.remotion`）
3. 删占位文件、建 junction（无需管理员）：
   `Remove-Item workbench\node_modules` → `New-Item -ItemType Junction -Path workbench\node_modules -Target runtime\node_modules`
   `workbench\tplcards` → `template\cards`（同一个仓库里 108 张动效卡的目录）
4. 冒烟渲染再目视确认：`node_modules\.bin\remotion.cmd still smoke/index.ts Smoke out.png --frame=5`，然后看图，不是只看 exit 0

## 预防
- 别为"照 README"启动 WSL bash；先读脚本做了什么（npm / ln / cp），再用 Windows 等价命令替代
- 这两个文件是 tracked，替换成 junction 后 `git status` 显示 `D`/typechange 属预期，不要"还原"（还原即坏）
- `workbench/src/cards/gen-index.ts` 显示 `M` 但 `git diff` 为空 = LF→CRLF 换行差异，不是内容改动

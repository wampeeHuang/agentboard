---
type: diagnosis
date: 2026-08-20
source: ComfyUI 软链接断裂排查，D:\0-Software 目录迁移
---

# 目录迁移后软链接/启动脚本全量失效：绝对路径引用不跟随移动

## 现象
ComfyUI 里 controlnet/loras/vae/embeddings/hypernetworks 等目录全是断链（readlink 指向 `/d/0-Software/AI/sd-webui-aki/...`，原目录已删）。启动脚本 `启动ComfyUI.bat` 的 `cd` 也指向已删除路径。表面看"模型丢了"，实际模型文件还在别处。

**复发（2026-09-10）**：vae/loras 两个断链当时漏扫，三周后往里写新模型文件才炸（curl 报 `client returned ERROR on write`，任务还报 exit 0 假成功）。断链静默——读操作（ls 空目录）不炸，写操作才炸。修复：删悬空链，建本地实目录 `D:\tools\ComfyUI\models\vae`、`loras`。

## 根因
目录迁移（`D:\0-Software\AI` → `D:\tools\Stable-Diffusion` + `D:\software\AI`）只搬了文件，没有重写三类绝对路径引用：
1. **Windows 软链接** — 链接体存的是源绝对路径，源移动后链全断
2. **启动脚本** — `cd /d` 硬编码旧路径
3. **配置文件** — 工具内部的路径常量

文件没丢 ≠ 引用没断。迁移操作不会自动更新任何指向它的引用。

## 修复/步骤
迁移目录后跑一遍全量引用扫描：
1. `find <dir> -type l -exec readlink {} \;` 列出所有软链接目标，逐个重指到新位置
2. `grep -r "旧路径" <dir>` 扫启动脚本/配置里的硬编码路径
3. 真实模型新位置要单独确认（本案例：`D:\tools\Stable-Diffusion\` 14 个 controlnet、`D:\software\AI\sd-webui-aki\` 4 个重复 controlnet），别靠猜

## 预防
任何目录迁移/重命名，迁移清单必须包含"软链接 + 启动脚本 + 配置引用"三类重指向检查项，不只搬文件。验证标准：迁移后 `readlink` 全绿 + 启动脚本路径 `ls` 存在。扫描必须逐目录过（`find <dir> -type l` 全量列，不能按"哪些目录重要"挑着查）——本次 vae/loras 就是挑查漏掉的。往软链目录写文件前，先 `readlink` 验目标存在。

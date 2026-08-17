# git rm 子模块会自动删 .gitmodules 条目，不用手动编辑

type: method
date: 2026-08-14
source: claude-skills 清理 17 个已删 submodule（彻底清）

## 现象

submodule 目录从磁盘被手动删掉后，`git status` 显示 `deleted`。想"彻底清"时容易误解为要三步：`git rm` 删 gitlink + 手动编辑 .gitmodules + 手动改 README。

## 根因

submodule 有**三处**记录，删磁盘目录只动了一处：

1. 磁盘目录（`rm -rf path` 已删）
2. index 里的 gitlink（mode 160000）
3. `.gitmodules` 条目

`git rm <path>` 对 submodule 的行为和对普通文件不同——它一次删掉第 2、3 两处（gitlink + .gitmodules 条目），只留 README 之类的手写文档要自己改。

对**已经没有 .gitmodules 条目**的路径（比如条目被之前的 commit 移除了），`git rm` 只删 gitlink，并打印警告：

```
warning: Could not find section in .gitmodules where path=loop-audit
```

这警告不是错误，是提示"这个路径本就没条目，我只删了 gitlink"。

## 修复/步骤

彻底清 submodule：

```bash
git rm <path1> <path2> ...   # 一次删 gitlink + .gitmodules 条目
# README 等手写清单自己改（git rm 不碰）
```

验证三处对齐：

```bash
git ls-files -s | grep -c '^160000'        # gitlink 数
grep -c '^\[submodule' .gitmodules          # 条目数
# README 名单数 与上面两个一致
```

## 预防

- 清理 submodule 走 `git rm`，**不要** `rm -rf` 目录后再手动编辑 .gitmodules——手动删容易漏条目或改错，git rm 原子完成。
- "Could not find section" 警告 = 正常，不是失败；真正的失败要看 `git rm` 的退出码。
- 判断一个路径是不是还在 .gitmodules 里，用 `grep -n '^\[submodule "名"\]' .gitmodules` 确认，别凭记忆。

---
type: diagnosis
date: 2026-09-12
source: 灵感图库目录归位时两次 `git add A B`（A 已被 git mv 走）整条失败，commit 里只剩 rename 没有内容改动
author: dsh-agent
---

# git mv 之后别再 git add 旧路径：一条 pathspec 失败会整条中止，commit 静默少一半

## 现象
搬文件（`git mv workbench.py src/workbench.py`）之后，按习惯把"改过的文件 + rename"一起 stage：

```
git add -- README.html docs/manual index.html src/workbench.py ...
```

`README.html` 已经被 `git mv` 搬走了，于是 git 报
`fatal: pathspec 'README.html' did not match any files` —— **整条 `git add` 中止，一个文件都没 stage**。
接着 `git commit` 照常成功，因为 rename 早已在 index 里（`git mv` 自己就 stage 了），
于是这次提交看起来"有内容"，实际**只有 rename，没有任何内容改动**：
按钮 href、白名单、构建脚本的改动全留在工作区，下一个读历史的人会以为这批没做。

同一个 session 里发生两次（批 3 一次、说明书归位一次），两次都是靠事后 `git show --stat` 才发现。

## 根因
两个语义叠在一起：
1. **`git mv` 已经把"移动"这件事 stage 了**——rename 是 index 操作，不是工作区操作。
   所以再 `git add` 旧路径既无必要、又必然失败。
2. **`git add` 的 pathspec 是全有全无**：只要有一个参数匹配不上，它**不 stage 任何东西**并 exit 1。
   这与很多工具"部分成功"的直觉相反——失败是静默的，因为它看起来只是个警告级别的红字。

叠加结果：commit 成功、无报错、内容不全。属于"绿灯下的缺失"，比直接报错更危险。

## 修复/步骤
1. 发现方式固定：提交后立刻 `git show --stat --oneline HEAD`，核对**文件数**与预期一致；
   只有 `{old => new}` 的 rename 行、没有内容改动 = 出事。
2. 补救：把该 stage 的（不含已搬走的旧路径）重新 `git add`，然后
   `git commit --amend -F <msg文件>`；commit 未推送时这样最干净。
3. stage 前先 `git status --short`：搬过的路径显示为 `R `（已 staged）而不是 ` M`，
   看到 `R` 就别再对它 `git add`。

## 预防
- **`git mv` 之后只 `git add` "内容改过的文件"，永远不再 add 旧路径。**
- 一次 `git add` 里不要混"可能不存在的路径"。要混就分两条命令，或用 `--ignore-unmatch`
  （注意 `--ignore-unmatch` 只在部分子命令可用，`git add` 无此选项）。
- **提交后必看 `--stat`，提交前必看 `diff --cached --name-only`**：前者验证结果，后者验证意图。
  这条与 `git-commit-staged-index-trap.md`（commit 提交整个 index）是一对：
  那条讲"多提交了不该提交的"，这条讲"少提交了该提交的"，都只能靠提交前后各看一眼拦住。
- 批量搬迁的收尾动作固定成一条：`git show --stat HEAD` 的文件数 = `git status` 里预期变更数。

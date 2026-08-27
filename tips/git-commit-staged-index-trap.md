---
type: method
date: 2026-08-23
source: agentboard 左导航原型 git 拆提交——tips 300+ 文件被删提交
---

# git commit 提交的是整个 index，不是"本次 git add 的东西"

## 现象

只想提交本次改动（`git add web/_proto/ docs/tasks.md`），`git commit` 结果 374 files changed / 13500 deletions——300+ `tips/` 文件被当成删除提交了。

## 根因

`git add <path>` 只是把文件追加进 index，**不会清空 index 里已 staged 的内容**。`git commit` 提交的是 index 的**全部**内容，不是"本次 add 的那些文件"。

如果之前某次操作（比如 `git add -A`、`git rm`、`git add .`）残留了 staged 状态，之后再精确 `git add` 局部文件并 commit，会把残留内容一并带走。staged 残留是隐形的——`git status` 会显示，但如果只扫 Untracked 区就看不见。

## 修复/步骤

事故恢复：

```bash
git reset --soft HEAD~1   # 撤销 commit，改动回到 staged
git reset                 # 清空整个 index（staged → unstaged）
# 先确认磁盘文件完好（本例 tips/ 390 文件都在，git reset 不清磁盘）
git add <精确路径>         # 重新精确 staged
git diff --cached --stat  # 提交前核对：只该有想提交的文件
git commit
```

## 预防

- **commit 前必跑 `git diff --cached --stat`**，看 staged 范围是不是只有想提交的。
- 看到 staged 里有大面积 `D`（删除）文件，先核对是不是预期的，绝不 blind commit。
- 提交前 `git status` 扫全量，不只扫 Untracked 区——staged 残留藏在 Changes to be committed 区。
- **修复时别用会重新进 staged 的操作**（2026-08-27 二次踩坑）：soft-reset 撤销误提交后，用 `git restore --staged <file>` 把不该提交的移除即可，**不要**为了"恢复现场"再 `git add` 它——re-stage 会让下一次 commit 再次扫走。不是本次任务的 pre-staged 变更，留 unstaged 最安全。

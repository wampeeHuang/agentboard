# git init 默认分支 master 导致 push main 失败
type: diagnosis
date: 2026-06-20
source: 20 个 skill 批量独立建仓 + push GitHub，前 5 个全部报 `error: src refspec main does not match any`

## 现象

Windows 上 `git init` + `git commit` + `git push origin main` 报错：
```
error: src refspec main does not match any
error: failed to push some refs to '...'
```
本地分支名是 `master`，但 GitHub 新建仓库默认分支是 `main`。

## 根因

Windows 上多数 git 安装（包括 Git for Windows 默认）没有改 `init.defaultBranch`，`git init` 创建的初始分支仍是 `master`。GitHub 2020 年起默认分支改为 `main`，两边不匹配。

## 修复/步骤

**已发生**：在已 init 的仓库里：
```bash
git branch -M main
git push -u origin main --force
```

**预防（一劳永逸）**：
```bash
git config --global init.defaultBranch main
```

## 预防

- 新机器配环境时把 `init.defaultBranch main` 加入初始化清单
- 脚本化批量操作时，init 后立即 `git branch -M main`，不要假设默认分支名

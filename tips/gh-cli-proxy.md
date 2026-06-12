# gh CLI 不走 git proxy
type: feedback
date: 2026-06-12
source: gh repo clone 超时，git clone 正常

## 现象
`gh repo clone` 报 `dial tcp: connectex: A connection attempt failed`，但 `git clone` 和 `curl -x` 都正常。

## 根因
`gh` CLI 不读 `git config http.proxy`，有自己独立的网络层。git 配置了 `http.proxy http://127.0.0.1:7897`（SakuraCat），但 gh 不走这条代理。

## 修复
用 `git clone` 代替 `gh repo clone`。git 命令遵 `http.proxy` 配置，过代理正常。

```bash
# 不工作
gh repo clone owner/repo

# 工作
git clone https://github.com/owner/repo.git
```

## 也要检查的
- `gh auth status` — 也会超时，同因
- `gh pr create` / `gh issue view` — 所有 gh 子命令都不走代理
- SakuraCat 代理端口 7897，进程 `com.vortex.helper.exe`

## 预防
- 远程操作优先用 `git` 命令，不用 `gh`
- 记住 gh 和 git 是两套网络栈

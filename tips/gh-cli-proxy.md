# gh CLI 不走 git proxy
type: diagnosis
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
- **需要调 GitHub API 时**：`gh auth token` 取 token → `curl.exe --proxy http://127.0.0.1:7897` 发包，不要用 `gh api`

## API 调用模板

```bash
# 取 token（gh auth token 不需要网络，读本地凭证）
TOKEN=$(gh auth token)

# GET（读文件）
curl -s --proxy http://127.0.0.1:7897 --max-time 15 \
  -H "Authorization: Bearer $TOKEN" \
  "https://api.github.com/repos/owner/repo/readme"

# PUT（写文件，需要 SHA）
curl -s --proxy http://127.0.0.1:7897 --max-time 15 \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data-binary @payload.json \
  "https://api.github.com/repos/owner/repo/contents/path"

# PATCH（改仓库属性）
curl -s --proxy http://127.0.0.1:7897 --max-time 15 \
  -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  --data-binary @payload.json \
  "https://api.github.com/repos/owner/repo"
```

关键：`gh` 只用来取 token，所有网络请求走 `curl --proxy`。

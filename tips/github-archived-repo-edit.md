# Archived 仓库编辑三步法：解档 → 编辑 → 重归档
type: method
date: 2026-08-07
source: github-mgmt 审计，persona-article/evolution-cat-article/wechat-article-reader 三个归档仓库需更新 description

## 现象
对已归档仓库执行 `PATCH /repos/{owner}/{repo}` 或 `PUT .../contents/README.md` 返回 403：`"Repository was archived so is read-only"`。

## 步骤
三步，不可跳过：

```bash
TOKEN=$(gh auth token)

# 1. 解档
curl -s --proxy http://127.0.0.1:7897 --max-time 15 \
  -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  --data '{"archived":false}' \
  "https://api.github.com/repos/owner/repo"

# 2. 编辑（description / README 等）
curl -s --proxy http://127.0.0.1:7897 --max-time 15 \
  -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  --data '{"description":"新描述"}' \
  "https://api.github.com/repos/owner/repo"

# 3. 重归档
curl -s --proxy http://127.0.0.1:7897 --max-time 15 \
  -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  --data '{"archived":true}' \
  "https://api.github.com/repos/owner/repo"
```

## 预防
- 审计前先用 `gh api /users/{owner}/repos --paginate` 筛出 `archived: true` 的仓库
- 编辑归档仓库时默认在三步脚本里完成，不手动逐条 curl

# GitHub /readme 端点加 Accept header 反而返回错误格式
type: diagnosis
date: 2026-08-07
source: github-mgmt README 批量检查，所有仓库返回 NO README FOUND

## 现象
`GET /repos/{owner}/{repo}/readme` 加了 `Accept: application/vnd.github.raw+json` 后，返回体不再是 JSON，`json.loads()` 失败，静默返回 None → 19 个仓库全部报 "NO README FOUND"。

## 根因
`application/vnd.github.raw+json` 让 API 返回 **raw 文件内容**（纯文本），不是标准的 JSON `{content: "<base64>"...}`。代码按 JSON 解析 → `json.loads("raw text")` 抛异常 → except 块返回 None。

直觉是"我加了 raw 参数，返回的是 raw 内容，但外面应该还是 JSON 包着"——不对，raw 就是 raw，没有 JSON 外层。

## 修复
**不要传自定义 Accept header。** 用默认的 `application/vnd.github+json`，返回的 `content` 字段是 base64 编码的文件内容。

```python
# 错误（返回 raw，JSON 解析失败）
"-H", "Accept: application/vnd.github.raw+json"

# 正确（返回 JSON，content 字段是 base64）
# 不传 Accept header，或显式传 application/vnd.github+json
```

```python
def fetch_readme(repo):
    url = f"https://api.github.com/repos/owner/{repo}/readme"
    result = subprocess.run([
        "curl", "-s", "--proxy", "http://127.0.0.1:7897", "--max-time", "15",
        "-H", f"Authorization: Bearer {token}",
        url  # 不传 Accept header
    ], capture_output=True)
    data = json.loads(result.stdout)
    return base64.b64decode(data["content"]).decode("utf-8")
```

## 预防
- GitHub API 需要 raw 内容时，直接用 `download_url` 字段，不传 raw Accept header
- 任何 "NO FOUND" 批量结果先怀疑请求参数，不先怀疑数据

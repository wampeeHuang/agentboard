---
type: method
date: 2026-08-10
source: Skill 文件架构.md Anthropic skills 仓库结构分析
---

# 开源仓库结构分析：用 API 不靠记忆

## 现象

写文章引用开源仓库时，凭记忆或二手文章报数据——"仓库有 14 个目录""纯 prompt 模式占 40%"。实际一查：17 个目录，24%。错误数据传播到下游的所有分析和结论。

## 根因

LLM 训练数据中的仓库快照是冻结的——仓库在进化，记忆不会。二手文章互相引用，错误层层放大。数字断言不验证=胡编。

## 修复

用 `gh api` 直接读 GitHub 仓库结构，30 秒拿到一手数据：

```bash
# 列出目录下所有条目
gh api repos/{owner}/{repo}/contents/{path} --jq '.[].name'

# 循环取每个子目录结构
for item in $(gh api repos/{owner}/{repo}/contents/{path} --jq '.[].name'); do
  echo "=== $item ==="
  gh api "repos/{owner}/{repo}/contents/{path}/$item" --jq '.[].name'
done

# 取文件大小（字节）
gh api repos/{owner}/{repo}/contents/{path}/SKILL.md --jq '.size'
```

拿到原始数据后**用脚本计数**，不靠 LLM 心算。百分比写脚本算，不心算。

## 预防

任何涉及"N 个""~X%""约 Y 行"的数字断言 → `gh api` 或等效工具直读 → 脚本计数 → 写入文章。不经过中间人。

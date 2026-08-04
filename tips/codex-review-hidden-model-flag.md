# /codex:review 隐藏 --model 参数，--effort 真的不支持

type: fact
date: 2026-08-04
source: codex-companion.mjs 源码验证

## 现象

`/codex:review` 和 `/codex:adversarial-review` 的文档和 usage 均未列出 `--model` 参数。但传了能生效。

`/codex:review --wait --model gpt-5.6-sol` — 能用。
`/codex:adversarial-review --wait --model gpt-5.6-sol` — 也能用。

`--effort` 传了没用——review 路径的解析器没注册这个参数。

## 根因

`codex-companion.mjs` L712-719，`handleReviewCommand` 的 `valueOptions` 包含 `model` 但不含 `effort`。`model` 一路传到 `startThread`。`effort` 只在 `handleTask` (L763-765) 解析，review 路径不碰它。

## 三条实战命令

```
/codex:review --wait --model gpt-5.6-sol
/codex:adversarial-review --wait --model gpt-5.6-sol
/codex:rescue --wait --model gpt-5.6-sol --effort high 只读审查，不改文件
```

第三条是绕过 review 缺 `--effort` 的 workaround——rescue 是 task 路径，模型和强度都能传，提示词约束"只读"。

## 预防

长期给 openai/codex-plugin-cc 提 PR，在 review 路径补上 `--effort`。之前用命令行的 `--model` 或项目级 `.codex/config.toml` 兜底。

# rehype-sanitize 放在 highlight 之后会清除代码高亮
type: diagnosis
date: 2026-07-10
source: Forma 排版引擎安全审查 — XSS 修复时反复调整 rehype 管线排序

## 现象
加 `rehype-sanitize` 修复 XSS 后，代码高亮全部消失。`<span class="hljs-keyword">` 等节点被 sanitize 清除。反过来去掉 `allowDangerousHtml: true`，高亮 span 被 HTML-encode 成 `&lt;span&gt;` 显示为源码。

## 根因
unified/rehype 管线是顺序流水线。`rehype-sanitize` 默认 schema 只允许 safe HTML 元素，`raw` 类型节点（高亮 span）会被过滤。

`rehypeStringify` 的 `allowDangerousHtml: true` 是输出 `raw` 节点的必要条件，关掉它 raw 节点会被当成文本 encode。

## 修复/步骤
管线唯一正确排序：`rehypeRaw → rehypeSanitize → rehypeHighlightedCodeBlock → rehypeStringify`

1. `rehypeRaw` — 解析用户 HTML（最危险，必须先解析）
2. `rehypeSanitize` — 清除危险元素/属性（在 raw 之后、highlight 之前）
3. `rehypeHighlightedCodeBlock` — 注入安全的 `<span class="hljs-*">`（sanitize 之后注入，不会被清除）
4. `rehypeStringify({ allowDangerousHtml: true })` — 输出高亮 span（此时用户 HTML 已被清理，安全）

## 预防
- unified 管线加安全组件时，先在纸上画处理顺序，不在代码里试
- 排序原则：解析危险 → 清除危险 → 注入安全 → 输出。安全组件永远在"清除危险"位，不在"注入安全"位之后

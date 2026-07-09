# CSS 文件存在但未被 HTML 引用 → 所有改动静默失效
type: diagnosis
date: 2026-07-09
source: 工具架设计原则板块样式调整，改 _style.css 多轮无效

## 现象
改 `_style.css` 里的样式规则，刷新页面完全没变化。浏览器 DevTools 看不到对应的样式规则。

## 根因
`index.html` 没有 `<link>` 引用 `_style.css`。所有样式都在 HTML 内联 `<style>` 标签里。CSS 文件只是孤立的编辑器工件，对页面零影响。

## 修复/步骤
1. `grep "stylesheet\|style.css" index.html` — 确认引用链
2. 如果页面用内联 `<style>` 而不是外部 CSS，直接改 `<style>` 里的规则
3. 如果确认页面应该引用 CSS 文件，加 `<link rel="stylesheet" href="_style.css">`

## 预防
改任何样式前，先确认页面实际加载的样式源：
- `grep "<link.*css\|<style" index.html` 看引用结构
- 浏览器 DevTools → Sources 面板 → 确认文件是否在加载列表里
- 规则生效了再用 DevTools 验证，不靠"改了应该生效"的假设

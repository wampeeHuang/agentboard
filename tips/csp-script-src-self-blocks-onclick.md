---
type: method
date: 2026-08-06
source: source-rack v4.0 CSP 收紧实战
---

# CSP script-src 'self' 拦截 onclick 静默失效

## 现象
CSP 把 `script-src` 从 `'self' 'unsafe-inline'` 收紧为 `'self'` 后，页面按钮/芯片点击无响应。浏览器控制台**无报错**——事件静默不触发。

## 根因
CSP `script-src` 不仅管 `<script>` 标签里的内联代码，也管 HTML 属性里的内联事件处理器（`onclick`、`onerror`、`onload`、`onsubmit` 等）。这些属性值被视为 inline script，会被 CSP 拦截。

常见误区：只把 `<script>` 块移到外部文件就以为完了，漏了 onclick。

## 修复
1. `grep -rn "onclick=\|onerror=\|onload=\|onsubmit=" server.js` 找出所有内联事件
2. 替换为 `data-action` + `data-value` 属性（纯 HTML 属性，不受 CSP 管辖）
3. 客户端加全局事件委托 `setupActionDelegation()` 用 `switch` 分发
4. `onerror` 换 `data-error-hide` + 全局 `error` 事件监听（capture phase）
5. 确认 grep 清零后改 CSP

## 预防
- CSP 收紧前 checklist：`script-src` 去 unsafe-inline → 先 grep onclick/onerror 清零 → 再改 header
- 模板字符串里的 `onclick="...\\'...\\'..."`  转义最坑，写脚本批量替换，不手改

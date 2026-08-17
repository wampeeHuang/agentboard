# "刷新正常、跳转异常"是 Turbo 缓存污染特征信号

type: diagnosis
date: 2026-08-05
source: 版式画廊 /library 页面卡片预览不显示，iframe 全部不可见

## 现象

`/library` 页面从首页 Turbo 跳转过来时，卡片 iframe 预览不可见。刷新后正常。从不同页面跳回 `/library` 时，卡片视口大小、文案位置不一致。刷新始终正常。

## 根因

Turbo（Hotwire/Turbolinks）在页面导航时**合并 `<head>` 元素**，不替换。首页 `index.html` 的 `<style>` 中有 `.card-preview iframe { opacity: 0 }`，Turbo 将其带入 `/library` 页面的 `<head>`，污染了同名 class。首页的通用选择器（grid、card 等）也一并泄露。

刷新时浏览器完全重载，不走 Turbo 缓存，所以正常。

"刷新正常、跳转异常" = Turbo/Turbolinks/SvelteKit/pjax 等任何 SPA-style 导航框架的**缓存污染特征信号**，不是 JS 异步时序问题。

## 修复

1. 页面专属 `<style>` 加 `data-turbo-track="dynamic"`，Turbo 每次导航重新加载
2. 导航状态同步器加防重复注册（`window.siteNavTurboLoadBound`）
3. 首页移除跨页残留的事件监听器
4. iframe 改用根路径（`/templates/...`），先绑 onload 再设 src

## 预防

- Turbo 项目第一课：页面专属 CSS/JS 必须 `data-turbo-track="dynamic"`
- "刷新正常、跳转异常"出现 → 先查 Turbo head 合并，不陷入异步时序调试
- 同名 class 的样式在 Turbo 下会叠加——跨页 class 命名加命名空间前缀
- 诊断顺序：CSS 可见性（opacity/visibility/display）→ 框架缓存（Turbo/bfcache）→ JS 异步逻辑

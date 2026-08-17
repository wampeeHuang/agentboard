# SVG `<use>` 引用时不能用 `display:none` 隐藏 defs

type: diagnosis
date: 2026-07-17
source: 德城品牌套件 logo 区段用隐藏 SVG defs 提供 `<use href>` 引用路径

## 现象

`<svg style="display:none"><defs><path id="x" .../></defs></svg>` 隐藏后，页面中的 `<svg><use href="#x"/></svg>` 不渲染任何内容。没有控制台报错，没有 404，静默失败。

## 根因

`display:none` 会从渲染树中移除整个 `<svg>` 元素。部分浏览器（Firefox、部分 WebKit 版本）在移除渲染树元素的同时也会断开其内部 `<defs>` 的引用能力——`<use>` 找不到 `#x` 了就什么都不画。

`width="0" height="0"` 则不同：元素仍在渲染树中（`display` 未变），只是尺寸为零。`<defs>` 保持可引用状态。

## 修复

```html
<!-- ✅ 正确：width=0 height=0 + position:absolute -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <path id="x" .../>
  </defs>
</svg>

<!-- ❌ 不要用 display:none -->
<svg style="display:none"><defs>...</defs></svg>
```

`position:absolute` 不是技术上必需的（width=0 height=0 已经不可见），但作为防御——万一某处 CSS 覆盖了 width/height，absolute 确保不占布局空间。

## 预防

- 写 SVG sprite 时直接用 `width="0" height="0" style="position:absolute"`，不先用 `display:none` 再改
- 如果发现 `<use>` 不渲染，第一件事查 defs 的隐藏方式

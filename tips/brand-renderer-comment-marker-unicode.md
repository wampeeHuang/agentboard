# brand-renderer.js 注释标记必须是制表符 U+2500

type: pitfall
date: 2026-08-04
source: layout-gallery brand page textures/cursors 消失

## 现象
品牌页 `/brand/:slug` 纹理正常但光标和草地全部缺失。template.html 里 CSS 注释写的是 `/* --- Custom cursor --- */` 和 `/* --- Texture system --- */`。

## 根因
`brand-renderer.js` 的提取正则用的是 `─`（U+2500 制表符 BOX DRAWINGS LIGHT HORIZONTAL），不是 `-`（U+002D 连字符）：

```js
// extractCursorCSS  — 找不到注释直接 return ''
const cursorCommentStart = css.search(/\/\*\s*─{1,3}\s*Custom cursor/i);
if (cursorCommentStart < 0) return '';  // 哑火，无报错

// extractTextureCSS — 有 class-name 回退所以纹理还能工作
const texStart = css.search(/\/\*\s*─{1,3}\s*Texture system/i);
// 找不到 → 走 class name 匹配回退，纹理勉强幸存
```

纹理侥幸因为函数有回退路径（按 class name 搜 CSS 规则），光标没有回退直接返回空串。

## 修复
`template.html` 中所有 CSS 注释标记一律用 `─`（U+2500），不用 `-`：

```css
/* ─── Texture system ─── */
/* ─── Custom cursor ─── */
/* ─── Meadow ─── */
```

## 预防
- 往 `template.html` 加 CSS 注释时，复制已有的 `─` 字符，别手打 `-`
- 或在 `brand-renderer.js` 正则会同时匹配两种字符：`[\u{2500}\-]{1,3}`

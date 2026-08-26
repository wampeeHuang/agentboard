---
type: diagnosis
date: 2026-08-26
source: supervisor 说明书全景图 — 用户报告文字被色块压住；vision API 判不出（密集图螺旋），程序化 z-order 分析定位绘制顺序
---

# SVG 绘制顺序 = z-index：背景层 rect 后画会盖住内容标签

## 现象

SVG 图里"探活·挂了重启·退避""登录直接拉起"标签明明画了，渲染后被色块盖住/压底，文字半埋在色块下。用户在浏览器里看到，MCP 浏览器验证时未必暴露（取决于插入位置与当前选中的绘制顺序）。

## 根因

SVG 没有 z-index。元素按 **DOM 出现顺序** 绘制，**后画的盖先画的**。中途插入一个背景层 rect（如 accent 层色块），它排在原标签之后 → 绘制在原标签之上 → 直接盖住其后所有标签。背景层 rect 画在内容标签之后 = 标签被埋。

## 修复/步骤

1. **背景层 rect 必须排在内容标签之前**——先画底，再画字。
2. 改图时**不要中途插入背景块**——插在中间会盖住后续标签。新增色块 = 先查是否插在文字前。
3. 程序化验证（确定性，别用视觉 LLM）：

```js
// 页面里跑：返回"被后画 rect 盖住"的文字内容
const texts = [...document.querySelectorAll('svg text')];
const rects = [...document.querySelectorAll('svg rect')];
const covered = [];
texts.forEach(t => {
  const tb = t.getBBox();
  rects.forEach(r => {
    if (t.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING) {
      const rb = r.getBBox();
      const hit = tb.x < rb.x + rb.width && tb.x + tb.width > rb.x &&
                  tb.y < rb.y + rb.height && tb.y + tb.height > rb.y;
      if (hit) covered.push(t.textContent);
    }
  });
});
```

`covered` 非空 = 有标签被盖，逐个修。

## 预防

- 画 SVG 组织顺序固定：**先全部背景层 → 再连线 → 最后文字**。
- 精确布局/遮挡验证走程序化几何，不用视觉 LLM（密集图 reasoning 螺旋烧 token 零产出，见 `deepseek-vision-reasoning-content-empty.md`）。

---
type: diagnosis
date: 2026-08-02
source: dechpcba-landing 首页在 portfolio iframe 503px 视口下元素溢出，修 bug 过程中错误重构了整个断点体系
---

# CSS溢出修复：加规则不改模式 —— 断点重构失败的教训

## 现象

dechpcba.evopearl.com 嵌入 portfolio iframe，iframe 视口 503px。该宽度落在 480-767 平板范围，部分元素（story-tags、knowledge-tabs、link-agg text、nda-tip）溢出 62px。body 有 `overflow-x: clip` 所以无滚动条，但内容在右边缘硬截断。

## 根因

**直接根因：** 四个元素的 CSS 在平板宽度没有适配：
- `.story-tags` — `flex-wrap` 默认 nowrap，标签不换行
- `.knowledge-tabs` — 按钮栏无 `max-width` 约束
- `.link-agg-row .link-desc` / `.link-name` — 长文本无 `text-overflow`
- `.nda-tip` — 绝对定位 tooltip 固定 320px 宽

**第二轮错误的根因：** 修完溢出后，我判断"横滚卡片在 503px 看是坏的"，把 `max-width:767` 块里的横滚规则（focus-grid、link-agg-grid、knowledge-feed）搬到了 `max-width:479` 块。结果：
- focus-grid 从横滚卡片退回 2 列网格 → 卡片 220px 太挤
- link-agg-grid 退回 3 列网格 → 列宽 146px 不可读
- 已验证的手机交互模式被破坏

**判断失误的深层原因：** 把 CSS 细节 bug（四个元素溢出）和交互模式设计（横滚 card peek）混为一谈。溢出修完就该停。横滚在 503px 是正确的 UX——card peek 指示可滑动，不是缺陷。

## 修复

1. **第一轮（正确，已部署）：** 新增 `@media (min-width: 480px) and (max-width: 767px)` 块，四条规则：
   ```css
   .story-tags { flex-wrap: wrap; }
   .knowledge-tabs { max-width: 100%; }
   .link-agg-col { overflow: hidden; }
   .link-agg-row .link-desc { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
   .link-agg-row .link-name { overflow: hidden; text-overflow: ellipsis; }
   .nda-tip { max-width: 280px; left: auto; right: 0; white-space: normal; }
   ```

2. **第二轮（错误，已回滚）：** 把横滚规则从 767 块迁到 479 块 → 平板宽度失去横滚 → 回滚

3. **恢复后状态：** 767 块横滚不变，新增平板块只修溢出，三个断点互不打架。

## 预防

1. **修 bug 前先分类：** 是 CSS 细节（溢出/对齐/字号）还是交互模式（横滚/网格/折叠）？前者加规则，后者不碰。
2. **新增 `@media (min-width: X) and (max-width: Y)` 优于搬动现有断点规则。** 搬规则影响面不可控——你不知道哪些设备宽度会受影响。
3. **部署后必须验证实际效果再判断。** 我以为横滚在 503px 是问题，实际不是。看代码猜效果 ≠ 看页面判断。

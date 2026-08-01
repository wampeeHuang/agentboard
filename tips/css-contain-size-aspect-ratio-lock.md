# CSS contain:size 是锁死 aspect-ratio 的唯一手段

type: method
date: 2026-08-02
source: 作品集产品区卡片重构——aspect-ratio:16/9 设了不生效，子元素撑开容器

## 现象

给容器设 `aspect-ratio: 16/9`，子元素（scaled iframe、长图）会把容器撑到子元素高度，aspect-ratio 形同虚设。

## 根因

CSS `aspect-ratio` 在 block/flex 布局里只是 **preferred size**，不是强制约束。子元素显式高度 > 比例高度时，容器增长以包含子元素。这和 `min-height: auto` 行为一致——CSS 默认不让内容溢出。

## 修复

```css
.locked-frame {
  aspect-ratio: 16 / 9;
  overflow-y: auto;     /* 超出部分滚动 */
  contain: size;         /* 关键：告诉浏览器按"无子元素"计算尺寸 */
}
```

`contain: size` 让浏览器把元素当作没有子元素来算尺寸。此时 aspect-ratio 成为唯一尺寸来源，子元素再高也不影响容器。

JS 侧配合：`getComputedStyle(el).contain !== 'none'` 检测是否锁定，锁定时不动态设 `aspect-ratio: auto`。

## 限制

- `contain: size` 需要元素有明确宽度（来自父级或自身 `width`），否则宽度坍缩为 0
- 创建新层叠上下文和 containment context，内部 `position: fixed` 会受影响
- Chrome 83+, Firefox 69+, Safari 15.4+

## 预防

任何需要"预览框固定比例 + 内容可滚动"的场景，`aspect-ratio` + `contain: size` + `overflow: auto` 是首选方案。不加 `contain: size` 的 aspect-ratio 只是一厢情愿。

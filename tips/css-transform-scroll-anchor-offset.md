# CSS transform 导致锚点跳转首次/二次位置不一致
type: diagnosis
date: 2026-07-16
source: 德城B2B独立站 — section scroll-reveal 动画用 translateY(48px) 导致导航锚点首次点击偏位

## 现象
导航栏点击锚点链接跳转到页面 section，**首次点击和二次点击的停止位置不同**。首次偏上或偏下，二次点击后稳定在正确位置。排除项：图片加载（容器已预留尺寸）、字体加载（系统字体栈）、`scroll-behavior: smooth`（已移除）、`scroll-padding-top`（已设）。

**诊断签名**：首次点≠二次点，二次后稳定。只要这个模式出现，优先查 CSS transform。

## 根因
`section[id]` 用了 `transform: translateY(48px)` 做 scroll-reveal 入场动画。CSS transform 是**后布局阶段**——不影响 layout box 的尺寸和位置。浏览器锚点跳转按 layout box 计算目标位置，不认 transform 的视觉偏移。

首次点击：section 尚未被 IntersectionObserver 标记 `.visible`，`translateY(48px)` 仍生效 → 内容视觉位置比 layout 低 48px → 跳转位置看起来偏了。Observer 触发后加 `.visible`，0.7s transition 内 transform 归零，内容上移归位。二次点击时 section 已有 `.visible`，transform 已归零 → 位置正确。

## 修复
```css
/* 改前 */
section[id] {
  opacity: 0;
  transform: translateY(48px);
  transition: opacity 0.7s, transform 0.7s;
}
section[id].visible { opacity: 1; transform: none; }

/* 改后 — transform 完全移除，只留 opacity */
section[id] {
  opacity: 0;
  transition: opacity 0.7s;
}
section[id].visible { opacity: 1; }
```

子元素的 `.fade-up { transform: translateY(24px) }` 不受影响——子元素 transform 不改变 section 的 layout box，不影响锚点跳转。

## 预防
- section 级别的 scroll-reveal 动画只用 `opacity`，不要用 `transform`
- 如果必须用位移动画 → 用 `margin`/`padding`（影响布局，浏览器能正确计算）→ 但会有 layout thrashing，不如放弃位移
- 同理：`scroll-margin-top` 和 `scroll-padding-top` 只影响 layout-based 计算，不能补偿 transform 偏移

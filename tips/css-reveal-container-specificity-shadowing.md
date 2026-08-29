---
type: diagnosis
date: 2026-08-26
source: vivi-design-system 动效系统会话，批4 timeline 圆点过渡写对但未生效
---

# CSS reveal 容器规则遮蔽子组件动效——校验绿但效果死

## 现象
设计系统做滚动进场：容器类用 `.js .reveal--kids > * { opacity:0; transform:none; transition: opacity var(--dur) var(--ease) var(--d); }` 管全部直接子元素的错落渐现。子组件自己声明了过渡（如 `.timeline__dot { transition: transform 640ms var(--ease-pop); }`），CSS 里两条规则都在，grep/字符串校验全绿——但子组件的弹性过渡永远不生效，表现为效果"平"或错。同理，子元素的 hover 位移（`transform: translateY(-2px)`）被容器的 `transform: none` 吞掉。

## 根因
CSS specificity 遮蔽：`.js .reveal--kids > *` 是 (0,3,0)，压过子组件自己的 (0,1,0)/(0,2,0) 声明。**规则存在 ≠ 规则生效**——字符串校验只能验证"写了"，验证不了"cascade 谁赢"。容器用通配子选择器接管 transition/transform 后，子组件这些属性的定义权被抢走。

## 修复
两条路，按场景选：
1. **boosted 选择器**：给子组件要恢复的声明加更高 specificity 的容器内选择器，如 `.reveal--kids.is-visible .timeline__dot { transition: transform 640ms var(--ease-pop) var(--d); }`——`.is-visible` 多一级类，稳压 `> *`。
2. **属性分工**：容器进场只动 `opacity`，把 `transform` 留给子组件交互（hover 位移）。进场错落用 `transition: opacity ... var(--d)` 照样有节奏，transform 通道不冲突。

## 预防
- 设计系统里"容器管进场 + 子组件管交互"双层结构，先声明属性分工（谁动 opacity、谁动 transform），再写 CSS。
- 给通用类（如 `.icon`）加动效前先 grep 复用范围，避免误伤其他组件——限定到 `.component .icon`。
- 字符串/grep 校验通过 ≠ 效果生效。cascade 冲突类 bug 需要 getComputedStyle 实测或浏览器肉眼验收兜底；程序校验只覆盖存在性。

# vh 单位在移动端字号上的陷阱

type: trap
date: 2026-07-22
source: decheng-landing-page Hero headline mobile overflow

## 现象

`font-size: clamp(5rem, 22vh, 26rem)` 在桌面完美适配，但在手机上 PCBA 四字渲染宽度达 486-615px，远超 375px 视口，首屏崩坏。

## 根因

vh 单位在桌面(900-1200px高度)和手机(667-844px)上的物理值差异不直观。22vh 在桌面上是 198-264px，手机上仍有 147-186px——手机屏虽窄但高度不短。设计师用 vh 控制桌面垂直节奏，未意识到手机端 vh 产生的字号对窄视口是毁灭性的。

clamp() 下限 5rem=80px 也设太高——80px 字号下"PCBA"四字仍有 ~280px 宽，对 375px 视口依然溢出。

## 修复

1. 移动端 @media 内用 **vw 替代 vh** 做字号缩放。手机瓶颈是宽度(375px)不是高度，vw 比 vh 适合。
2. clamp() 下限降到移动端合理值：`clamp(2.5rem, 16vw, 5rem)` — 16vw of 375px = 60px，下限 2.5rem=40px。
3. 容器加 `flex-wrap: wrap` 兜底。

## 预防

- 每个用 vh 的字号 clamp()，写出来同时手动算移动端值。公式：`<vh值> × 667 / 100`（iPhone-SE 最小高度）。
- 如果这个值 × 字符数 > 视口宽度 × 0.6，必须加移动端 @media 覆盖。
- 默认用 vw 而非 vh 做字号中间值，除非你明确需要垂直节奏。

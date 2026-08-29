---
type: method
date: 2026-08-23
source: dashboard 字体参考 gallery，@font-face 声明 Inter/Noto Sans SC 但实际渲染 Segoe UI/微软雅黑
---

# 判断实际渲染字体：测 canvas 宽度，别信 @font-face 声明；中文全角同宽此法失效

## 现象

页面 @font-face 声明 `Inter` / `Noto Sans SC`，`getComputedStyle` 也返回这串名字，但实际渲染不是它们——Windows 上落 Segoe UI / 微软雅黑。想知道"真实显示的是哪个字体"，`font-family` 字符串给不了答案。

## 根因

`@font-face` 只声明字体名与来源，**不保证字体存在**。纯 `local()` 引用（如 `local("Segoe UI")`）的字体名是"假声明"：浏览器按字形逐个找可用字体，找不到就用系统 fallback。真实渲染 = fallback 链终点，不是声明第一个。

## 步骤（canvas 宽度匹配法）

```js
function detectFont(txt, candidates) {
  const p = document.createElement('span');
  p.textContent = txt; document.body.appendChild(p);
  const domW = p.getBoundingClientRect().width;   // 页面实际渲染宽度
  document.body.removeChild(p);
  const hits = [];
  candidates.forEach(f => {
    const c = document.createElement('canvas').getContext('2d');
    c.font = '13px ' + f;
    if (Math.abs(c.measureText(txt).width - domW) < 0.1) hits.push(f);
  });
  return hits;   // 宽度匹配的即实际字体
}
```

英文有效：`ComfyUI` 在 Inter 下 53.96px、Segoe UI 下 49.6px——能区分。

## 局限：中文全角同宽，此法失效

汉字是方形全宽，宋体/黑体/微软雅黑在 13px 下 5 个汉字宽度全相同（78px），宽度匹配法对中文无法区分 fallback。中文场景改用：`document.fonts.check('13px "候选字体"')` 检测系统是否装了该字体，或按已知系统字体推断（Windows 中文 fallback = 微软雅黑/宋体系）。

## 预防

- 想看"实际用什么字体"：宽度法测英文，fonts.check 或系统推断测中文
- 字体方案对齐参照站点时，先测参照站实际渲染，再抄 font-family 栈（声明 ≠ 渲染，见 `google-fonts-in-font-family.md`：声明不加载 = 永远回退）

---
type: diagnosis
date: 2026-08-23
source: 字荐字体库 CDP 几何验证，getBoundingClientRect 经 returnByValue 返回 {}
---

# CDP 验证里 getBoundingClientRect() 序列化成空对象 {}

## 现象
用 Chrome DevTools Protocol 的 Runtime.evaluate 取元素几何，表达式返回 `getBoundingClientRect()`，`returnByValue:true` 结果却只有 `{}`——width/height/left/right 全丢。"元素是否存在"的检查正常返回，唯独 DOMRect 是空的。

## 根因
`getBoundingClientRect()` 返回 DOMRect，x/y/width/height 等属性定义在原型上（不可枚举）。JSON 序列化只取自有可枚举属性，原型属性直接丢弃 → `{}`。

## 修复
不直接返回 DOMRect，先提取纯对象：
```js
function rr(el){var r=el.getBoundingClientRect();return {l:r.left,r:r.right,w:r.width};}
```
返回普通对象即正常。

## 预防
CDP/WebDriver 场景凡要序列化 DOM 几何，一律先包一层纯对象提取。返回值是 `{}` 不等于"元素没数据"——先怀疑原型属性序列化丢失。

---
type: diagnosis
date: 2026-09-23
source: Vivi 按钮收口时 styles/vivi-btn.css 的第一条规则整条失效
---

# CSS 注释里写通配路径，会提前闭合注释并吞掉下一条规则

## 现象

新样式表 link 进页面后，**第一条基准规则完全不生效**，按钮回落成浏览器默认样式
（`padding:1px 6px` / `border-radius:0` / `font-size:13.3333px` / `border:2px`），
而同文件里靠后的变体规则（`.vv-btn--primary` 之类）**正常生效**。HTTP 200、MIME 正确、
文件哈希与磁盘一致、`document.styleSheets` 里该表已加载 —— 全程**没有任何报错**。

## 根因

文件头部说明注释里写了消费方通配路径：

```css
/* 消费方：templates/mechanisms/*/library.html */
```

`*/` 出现在注释内部 → 注释提前闭合（CSS 注释不嵌套）→ 剩下的注释文本被当 CSS 解析 →
解析器报错后跳到下一个同步点，紧随其后的第一条规则被丢弃。

## 修复

```css
/* 消费方：templates/mechanisms/{principles,tips}/library.html */
```

## 预防

- 写完 CSS 数一遍注释开闭：`grep -c '/\*' f.css` 与 `grep -c '\*/' f.css` 必须相等。
- 注释里提 glob 用 `{a,b}`，不写"星号紧跟斜杠"。
- 判据：**"整条规则连内边距/圆角/字号一起回落成默认值" = 规则没被解析**（优先级问题只会覆盖个别声明）。
  遇到这种症状先查注释，再查选择器与优先级。

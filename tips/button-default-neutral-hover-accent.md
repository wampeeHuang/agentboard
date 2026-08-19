---
type: diagnosis
date: 2026-07-31
source: 版式画廊 library.html 弹窗按钮交互打磨（3轮迭代）
---

# 按钮默认中性，hover 才上色

## 现象

Agent 做按钮默认把主 CTA 设 accent 实心色（"这是主要操作，用品牌色突出"）。用户反复问"为什么默认就蓝色？鼠标一到哪里，哪里变蓝才对"。

## 根因

Agent 逻辑：主操作 = 品牌色 = 突出。用户逻辑：hover = 交互反馈色 = accent。两者对 accent 的语义理解相反。

当 accent 是蓝色时，默认蓝色按钮 hover 只有微弱色变（accent→accent-hover），用户感知不到交互反馈。"鼠标到哪变蓝"的前提是默认不是蓝的。

## 修复

按钮默认：白底 + accent 描边 + accent 文字。hover：accent 实心底 + 白字 + 上浮 + 阴影。

两个按钮用同一个交互模式，不需要 primary/secondary 区分。

## 预防

- 任何按钮/链接先问：默认状态下 accent 色占面积多大？超过边框/文字级别 = 已经"亮"了，hover 无空间
- 用户说"鼠标到哪变X" → 默认状态不能是 X 色
- 多个并列操作不需要区分主次时，统一交互模式，让内容（文字）区分意图

---
type: diagnosis
date: 2026-08-14
source: 写 Obsidian 概念笔记系列，check.js 报 bold 冒号错误，改完重跑又出一个
---

# check.js 报错只报第一个（.match() 非 global）

## 现象
`node scripts/check.js` 报一条「中文 bold 概念名后用冒号，不用句号或逗号」错误。改完这条重跑，又报另一条同类错误，像无穷尽，怀疑自己没改干净。

## 根因
check.js 第 362-367 行：`if (/\*\*[^*\n]+\*\*[。，]/u.test(text))` 先判断「存在」，再用 `withoutCode.match(...)` 取第一个匹配推入 errors。`.match()` 非 global，**每文件只返回第一个**。所以一次 run 只暴露一个，修完才暴露下一个。

## 修复
别靠 check.js 逐个暴露。改完报错后用 Grep 全量自查，一次找全：

```
Grep pattern: \*\*[^*\n]+\*\*[。，]
path: 笔记目录
```

命中即「bold 后紧跟句号/逗号」，逐个处理：句号移进 bold、或 bold 后补字、或去掉 bold。改完再跑 check.js 确认 exit 0。

## 预防
1. 写中文概念笔记时，bold 概念名后跟冒号（：）不跟句号/逗号——这是 check.js 的写作惯例。
2. 任何"改完一个又出一个"的 lint 报错，先怀疑 checker 用 `.match()` 非 global，全量 Grep 自查，不要迭代重跑。

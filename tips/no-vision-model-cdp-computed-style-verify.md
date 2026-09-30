---
type: method
date: 2026-08-24
source: 字荐黄绿白改版会话 — 模型 deepseek-v4-flash 无视觉, Read 截图返回 [Unsupported Image], 全部视觉验证改走 CDP；2026-09-24 补纠正：那条拒绝信息也可能是 DSH 配置声明造成的，先验服务端再退化
---

# 无视觉模型: 截图不可读 → CDP computed-style 数值验证

> ## ⚠ 2026-09-24 纠偏（先读这条，再决定要不要退化）
>
> 本文的出发点是「模型无视觉」，但**「读图被拒」不等于「模型无视觉」**：
> 灵感图库表单改造会话里，`read_image` 报 `model "deepseek-flash" does not declare image input`，
> 我照本文退化到 CDP 数值验证，还向用户声明「视觉复核没有独立证据」——
> 结果用户指出该模型有视觉能力，实测 API 证实：**是 `~/.dsh/settings.yaml` 的 `inputModalities` 少了 `image`**，
> 改一行、热加载，当场就能看图。详见 `tips/dsh/dsh-model-input-modalities-gate.md`。
>
> **修正后的顺序**：① 读图被拒 → ② 先花 5 分钟打服务端最小请求验能力（一个 POST + `usage.prompt_tokens`）
> → ③ 确认是服务端不支持，才退化到本文的 CDP 数值验证。
> **能力不足与配置没开，长得一模一样，但结论天差地别。**

## 现象

模型无视觉能力时, Read 工具读 PNG/JPG 截图返回 `[Unsupported Image]`, 无法靠"看"验证 UI。截图流程全部失效, 视觉 QA 出现盲区。

## 根因

部分模型是纯文本模型, 多模态输入在推理链中被丢弃。`Read` 读图片能返回内容, 但内容是"无法显示"占位符, 不是像素。**视觉验证依赖模型能力, 能力缺失时任何截图通道都白费。**

> ⚠ 补充（2026-09-24）：**harness 的能力声明也是根因之一**。模型能收图但配置声明没有 `image` 时，
> 工具层会先拒绝，症状与"纯文本模型"完全一样。两种根因的判别方法见文首纠偏。

## 修复/步骤

把"看截图"换成"读数值"——CDP 驱动 headless Chrome, 在页面内用 JS 断言计算样式与渲染状态, `returnByValue` 取回:

```js
// cdp-drive 模式: Runtime.evaluate({expression, awaitPromise:true, returnByValue:true})
(function(){
  var out = {};
  var t = document.querySelector('.hero-title');
  var cs = getComputedStyle(t);
  out.fontFamily = cs.fontFamily;            // 断言第一候选字体
  out.fontLoaded = document.fonts.check('16px "YouYou Yi Song"'); // 字体实际加载
  out.color = cs.color;                      // 断言主题色
  out.overlap = (function(){                 // 元素重叠检测
    var a = elA.getBoundingClientRect(), b = elB.getBoundingClientRect();
    return !(a.bottom <= b.top || b.bottom <= a.top || a.right <= b.left || b.right <= a.left);
  })();
  out.navText = [].slice.call(document.querySelectorAll('.nav-item')).map(function(n){return n.textContent.trim()}).join('|');
  return out;
})()
```

关键断言模式:

- **颜色/字体/尺寸**: `getComputedStyle` 取具体值, 不比视觉记忆
- **字体加载**: `document.fonts.check('16px "FontName"')` 确认 @font-face 真加载(不是 fallback)
- **重叠/对齐**: 取 `getBoundingClientRect()` 做几何比较(注意先包纯对象, 见 cdp-domrect-serialization-empty)
- **DOM 状态**: 文本/类名/存在性, 直接断言字符串
- **后端 round-trip**: 页面内 `fetch('/api/...')` 提交→回读→断言, 全链路在浏览器里验证

## 预防

- 改 UI 前先确认当前模型有无视觉：**先验服务端能力**（文首纠偏），确认无视觉才走数值验证
- 数值断言目标是"可验证的布尔/值", 不是打印给人看——表达式必须 `return` 值, cdp-drive 才取得到
- 视觉/排版类验收, 全部用几何+computed-style 断言写成脚本, 可重复跑
- ⚠ **数值断言有盲区**：它只能查你想到的结构属性。灵感墙那次「页眉与卡身同色」所有断言全绿
  （只查了"页眉有底色、有下边框"），是能看图之后才发现的——
  **结构断言 + 看图复核，两条都要，缺一条都会漏。**

## 已知坑（2026-08-27 实测补充）

- **`Page.reload` 会 abort iframe 导航**: 无头浏览器里 reload 父页面, iframe 的 `/manual` 请求可能 `ERR_ABORTED`, iframe 卡在 about:blank(外 HTML 只有 39 字符), 再也量不到. 测量 iframe 内元素别依赖 reload 刷新内容——用**全新 `--user-data-dir` 起 headless** 最稳, 或直接 `iframe.src` 赋值(但注意: 服务端若精确匹配路由, 别带 `?t=` query, 见 supervisor-web-static-refresh-iframe-cache)
- **跨 frame 测量**: 父页 sidebar + iframe 内文档各量一份 rect 时, 用 `iframe.contentDocument.querySelector(...)`; iframe 顶与父页视口同原点时(无偏移)可直接相加对齐

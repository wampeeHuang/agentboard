---
type: diagnosis
date: 2026-08-27
source: 原则库宪法格式区渲染 bug 排查（四、格式只显示一句话标题）
---

# 服务端 markdown 渲染器代码块被行级替换污染——占位符提取 + 恢复

## 现象

agentboard 服务端 renderMarkdown 渲染 /principles/CONSTITUTION.md，四、格式里 ```markdown 代码块只剩标题，后面 ## 是什么 / ## 怎么用 等全没了或变成真标题。

## 根因

渲染顺序错：``` 围栏先替换成 <pre><code>...</code></pre>，随后 /^## (.+)/gm、/^# (.+)/gm、/^(?!<[a-z]|$)(.+)$/gm 等行级替换继续对整段文本跑——把代码块内部 `## 是什么` 变成真 <h2>，段落包裹 <p> 漏进 <pre> 内部。

列表同样中招：列表包裹 `<ul>$&</ul>` 把尾换行带进 $&，</ul> 落单行 → 段落替换套出 <p></ul></p>。

## 修复

代码块先提取成占位符存数组，全部行级替换跑完再恢复：

```js
body = body.replace(/<p>\u0000CODE(\d+)\u0000<\/p>/g, function(_, i) { return codeBlocks[+i]; });
body = body.replace(/\u0000CODE(\d+)\u0000/g, function(_, i) { return codeBlocks[+i]; });
```

列表包裹尾空白剥离：`m.replace(/\s+$/, '')`。

## 预防

- 手写 markdown→HTML 渲染器：先保护代码块/预格式化内容（占位符提取），再跑行级正则，最后恢复。顺序反了必坏。
- 编辑 JS 源码用 `\u0000` 转义文本，别写裸 null 字节——裸 null 让 grep/diff 把文件当 binary。
- 改渲染器后跑「代码块 + 列表」fixture 复验，别只测纯文本页。

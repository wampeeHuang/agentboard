# bs4 的 replace_with/get_text 在嵌套 HTML 结构上会破坏正文——正文提取优先纯正则
type: diagnosis
date: 2026-08-13
source: Paul Graham 文章 HTML 提取，bs4 只返回 69 字符

## 现象

用 BeautifulSoup 提取 paulgraham.com 正文：`br.replace_with('\n')` + `get_text()`，正文只返回 69 字符（实际 24983）。

## 根因

正文包在 `<font size="2" face="verdana">` 内，内部嵌套 `<table>`。`replace_with` 改变 DOM 树节点，破坏嵌套 font>table 父子关系，`get_text()` 深度遍历时提前终止，大片正文丢失。

## 修复/步骤

弃用 bs4，纯正则定位：

1. `html.find('<font size="2" face="verdana">')` 定位正文起点
2. `html.find('</font></td></tr></table>', start)` 定位终点
3. `re.sub(r'(<br\s*/?>\s*){2,}', '\n\n', body)` 段落
4. `re.sub(r'<br\s*/?>', ' ', body)` 软换行
5. 剥标签 + unescape + 压缩空白

## 预防

从 HTML 提取正文时，若 DOM 嵌套深（font>table>div 多层），优先字符串定位/纯正则，不要 mutate DOM（replace_with / extract / decompose 会破坏父容器）。

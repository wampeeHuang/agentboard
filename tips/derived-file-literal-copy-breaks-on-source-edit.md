---
type: diagnosis
date: 2026-10-02
domain: general
author: dsh-agent
source: script-editor 会话：build_cloud.py 存着源 HTML 两段内容的逐字副本，编辑器一改就 Cloud patch drift，线上因此落后 9 天
---

# 构建脚本里存源文件的逐字副本：源文件一改就断，而且断得静默

## 现象

网站构建脚本 `checks/build_cloud.py` 的职责是把桌面版 HTML 改造成网站版：剥掉本机专用脚本、改写文案、注入云适配。它用 `replace_once(html, '精确字符串', '替换值')` 实现，不匹配就 `raise ValueError('Cloud patch drift')`。

同一天里它**断了两次**：

1. 一次是编辑器改了 `openSettings` 函数体（新增一个面板分支），补丁里的旧函数体副本失配；
2. 一次是改了 `#accountSyncSettings` 那段 CSS（新增几行规则），CSS 副本失配。

第一次断掉后**没人察觉**——本地有一周没跑构建，线上也就一直停在 9 天前的版本。用户看到的现象是"网页端和本机不一样/版本不同步"，而根因是构建早就跑不通了。

## 根因

补丁工具把**源文件的一段内容逐字复制进自己**，等于给源文件加了一份必须手工同步的镜像。源文件的任何相关改动都会让镜像过期，而过期的表现是**构建中止**——一个只在构建时暴露、不构建就完全无声的失败。

## 修复/步骤

把"逐字副本"换成**结构标记 / 结构锚点**：

```python
# 之前：整段 CSS 逐字比对（改一行就失配）
html = replace_once(html, '/* local-cloud-sync:start */#accountSyncSettings{...}/* local-cloud-sync:end */', '')

# 之后：按标记整体剥离，段内怎么改都不影响
html = re.sub(r'/\* local-cloud-sync:start \*/.*?/\* local-cloud-sync:end \*/', '', html, flags=re.S)

# 之前：整个函数体逐字比对
html = replace_once(html, "function openSettings(panel='settings'){...完整函数体...}", "...另一个完整实现...")

# 之后：只锚定函数结尾的唯一片段，函数内部任意改动都容忍
html = re.sub(r"function openSettings\(panel='settings'\)\{.*?if\(!isSpecial\)loadStorageSettings\(\)\.catch\(e=>\{\$\('#storageError'\)\.textContent=e\.message;\}\);\}",
              '', html, count=1, flags=re.S)
```

并在源文件里加**显式边界标记**（`/* X:start */ ... /* X:end */`），让剥离按约定而非按内容。

## 预防

- 构建/转换脚本里**不要出现源文件的逐字长副本**；要剥离用标记，要替换用锚定唯一后缀的正则。
- 若确实无法避免副本，就**把校验前移**：在门禁（`checks/`）里加一条"补丁仍能匹配"的检查，让构建断裂在提交前暴露，而不是等到发布。本例的教训就是"断了没人知道"比"断了"更贵。
- 改了源文件之后，**主动跑一次派生构建**——尤其当派生产物是线上部署的输入时。
- 同族风险：任何"从 A 生成 B"的脚本（代码生成、模板渲染、补丁式改造）都可能因 A 演化而静默失效；判断标准是"B 是否还会被按时生成"，而不是"A 改得对不对"。

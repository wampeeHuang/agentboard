# Mermaid live preview 源文件在 ~/.config/claude-mermaid/live/

type: fact
date: 2026-08-11
source: 架构图驱动写作 — 需要从 localhost:3737 预览提取 Mermaid 源码

## 现象

`http://localhost:3737/{diagram-id}` 显示 Mermaid 渲染结果，但需要拿到原始 `.mmd` 源文件（用于嵌入 Obsidian 笔记或其他文档）。浏览器看的是 SVG 渲染，不是源码。

## 根因

claude-mermaid MCP 的 live server 把每个 diagram 存为独立目录：

```
~/.config/claude-mermaid/live/{diagram-id}/
  diagram.mmd    ← Mermaid 源码
  diagram.json   ← 渲染选项（theme, scale 等）
```

Windows 上 `~` = `C:\Users\{username}`，实际路径：`C:\Users\Administrator\.config\claude-mermaid\live\`

## 怎么用

```powershell
# 列出所有 live diagram
Get-ChildItem "$env:USERPROFILE\.config\claude-mermaid\live\" -Directory | Select-Object Name

# 读取某个 diagram 的源码
Get-Content "$env:USERPROFILE\.config\claude-mermaid\live\{diagram-id}\diagram.mmd"
```

从浏览器 URL `http://localhost:3737/article-arch-current` → diagram-id = `article-arch-current`。

## 预防

不需要预防。这是正常的存储位置，知道就行。下次需要 Mermaid 源码时直接读 `.mmd` 文件，不用从 SVG 逆向或重新手打。

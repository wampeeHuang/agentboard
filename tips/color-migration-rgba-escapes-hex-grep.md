---
type: diagnosis
date: 2026-07-28
source: catalog 色系从蓝(#3B4A6B)迁到鼠尾草绿(#3D6B4A)，全局 hex 替换后 stack-badge 背景色仍为旧蓝
---

# rgba 颜色通道逃逸 hex grep 迁移盲区

## 现象
色系迁移完成，hex grep 确认无残留旧色。页面渲染 stack-badge 背景色仍是旧蓝。

## 根因
`rgba(59,74,107,0.08)` 这种 rgba 表示法无法被 `grep "#3B4A6B"` 或 `grep "3B4A6B"` 匹配。同一颜色存在 hex、rgb、rgba、hsl 多种表示，只搜 hex 必然漏。

## 修复/步骤
迁移颜色时同时搜四种表示：
```
grep -rPn "(3B4A6B|59,\s*74,\s*107|rgb\(59,\s*74,\s*107\))" --include="*.js" --include="*.css"
```
然后逐一替换。

## 预防
- 颜色迁移脚本第一步：列出目标颜色的所有表示形式
- 搜完 hex 后追加 rgba/rgb 通道搜索
- CSS 自定义属性迁移后，搜所有 `rgba(` 手动审计通道值是否对应旧色

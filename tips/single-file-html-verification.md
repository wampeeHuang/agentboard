# 单文件HTML编辑完成后四步验证

type: method
date: 2026-07-17
source: 德城落地页 index.html 多次重命名/删除 class 和 ID 后漏掉 JS 选择器和导航链接

## 步骤

编辑单文件 HTML（CSS+JS 内联）后，按顺序跑四步：

### ① CSS 括号平衡

```bash
# PowerShell: 统计 { 和 } 数量是否相等
$css = Get-Content index.html -Raw
($css.ToCharArray() | Where-Object {$_ -eq '{'}).Count
($css.ToCharArray() | Where-Object {$_ -eq '}'}).Count
```

### ② class/id 在 HTML/CSS/JS 三方引用一致

```bash
# 列出所有被 CSS 引用的 class，确认 HTML 中存在
# 列出所有被 JS querySelector 引用的 class/id，确认 HTML 中存在
grep -oP '\.([\w-]+)' style块 | sort -u  # CSS class
grep -oP 'querySelector(All)?\(["\047]#?\.([^"'\047]+)' js块 # JS 选择器
```

### ③ 被删除的 class/id 零残留

```bash
# 确认旧名在整个文件中不再出现
grep -cn "old-class-name\|#old-id" index.html
# 预期输出: 0
```

漏掉的常见位置：导航 `<a href="#old-id">`、JS `querySelector`、响应式 CSS `@media` 块、lightbox 选择器、carousel setup 的 track ID。

### ④ 字体栈实际渲染效果

```bash
# 浏览器中检查 computed font-family
# 确认第一候选字体在目标市场可加载，fallback 视觉效果可接受
document.querySelector('h2').computedStyleMap().get('font-family')
```

中国用户不能依赖 Google Fonts / Noto 系列。第一候选必须是 PingFang SC 或 system-ui。

## 为什么

单文件 HTML 没有编译器帮你检查引用完整性。class 重命名或删除后，CSS 规则静默失效（选择器没命中），JS `querySelector` 返回 `null` 也不报错。四步脚本化验证防止"改了A漏了B"。

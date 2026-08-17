# CSS 变量映射必须区分简写值和标量值
type: diagnosis
date: 2026-08-02
source: 版式画廊 49 模板标准化迁移，neo-brutalist 的 `--border: 3px solid #0d0d0d` 被 VAR_MAP 盲映射为 `--line: 3px solid #0d0d0d`，导致 `box-shadow: 0 0 0 var(--line)` 渲染异常

## 现象
CSS 变量迁移脚本将 `--border` 映射到 `--line` 后，neo-brutalist 模板的 box-shadow 边框消失或渲染异常。grep 确认映射已执行，但页面效果不对。

## 根因
CSS 自定义属性的值可以是**简写**（`3px solid #000`，包含多个分量）或**标量**（`#ccc`，单一颜色值）。同一个变量名 `--border` 在不同模板中语义不同：
- 标量用法：`--border: #e8e8e8` → 可以安全映射到 `--line`
- 简写用法：`--border: 3px solid #0d0d0d` → 映射到 `--line` 后，`var(--line)` 变成简写字符串，在 `box-shadow: 0 0 0 var(--line)` 中语法错误

VAR_MAP 是字符串替换，不感知值的语义。盲映射把简写值当颜色迁移，消费者处炸掉。

## 修复/步骤
1. 加 `isShorthandValue()` 检测函数：匹配 `\d+px \d+px`（spacing）、`\d+(px|em|rem|%) (solid|dashed|dotted)`（border）等模式
2. 三处加守卫：
   - `fixTokensColorNames()`：简写值不重命名
   - `extractPreservedVars()`：简写值不进 PRESERVE_PATTERNS 也被保留
   - `replaceVarRefs()`：如果旧 :root 中该变量是简写值，跳过 `var()` 引用替换
3. `--border` 从 VAR_MAP 中移除（注释标注原因），因为它有时是简写有时是颜色，无法统一映射

## 预防
- 任何 CSS 变量批量重命名/映射前，先用脚本分类：哪些变量的值是标量（可安全映射），哪些是简写（需人工判断）
- VAR_MAP 中标注每个映射的适用条件。不能"一刀切"映射的变量加 `// DANGER: can be shorthand` 注释
- 迁移后做渲染回归：不只是检查 CSS 语法，要实际打开页面看视觉效果

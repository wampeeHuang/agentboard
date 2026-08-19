---
type: method
date: 2026-07-24
source: scheduler dashboard renderCards 回退，两次 Edit 失败，最终用 node 脚本一次成功
---

# Edit 工具不适用于大函数替换

## 现象

用 Edit 工具替换 ≥50 行的函数，`old_string` 匹配成功但替换结果有 bug：
- 残留孤立语句（原模板和替换模板的闭合方式不同）
- 内容重复（替换未覆盖所有差异点）

## 根因

Edit 工具按 exact string match 做替换。大函数替换时：
1. `old_string` 需包含完整函数体（几百行），构造和验证困难
2. 原函数和替换函数的结构差异（如 `html += '</div>';` 独立语句 vs 内联闭合）不会被 diff 检测
3. 一次 Edit 只能替换一个 `old_string`，涉及多个分散修改时容易遗漏

## 修复

用脚本做程序化替换，不走 Edit 工具：

```javascript
// extract-and-replace.js
var fs = require('fs');
var curr = fs.readFileSync('target.js', 'utf8');
var orig = fs.readFileSync('original_from_git.js', 'utf8');

// 提取原函数
var origLines = orig.split('\n');
var origFunc = origLines.slice(startLine, endLine).join('\n');

// 提取当前函数
var currLines = curr.split('\n');
var currFunc = currLines.slice(startLine, endLine).join('\n');

// 精确替换
var result = curr.replace(currFunc, origFunc);
fs.writeFileSync('target.js', result, 'utf8');
```

来源用 `git show <commit>:<path> | sed -n 'start,endp'` 提取原始函数。

## 预防

- 替换函数 ≥50 行 → 用脚本，不用 Edit
- 替换前 `diff` 确认 old 和 new 的差异是预期的
- 替换后 grep 验证关键标记（`hasFeature: true/false`）确认变更到位

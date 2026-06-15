# Edit 工具在 Windows 文件上反复匹配失败
type: diagnosis
date: 2026-06-14
source: skill-html-showcase 项目多次 Edit 操作 index.html 均报 "String to replace not found"

## 现象

Edit 工具的 `old_string` 在 `index.html` 上反复匹配失败。文件内容肉眼确认存在目标字符串，但工具始终报 not found。最终只能用 Node.js 补丁脚本（`_runtime/patch.js`）绕过。

## 根因

Windows `core.autocrlf=true` 导致 Git checkout 时将仓库中的 LF 转换成 CRLF。Edit 工具内部使用 LF 做字符串匹配，但工作副本文件的行尾是 CRLF（`\r\n`），`old_string` 中的 `\n` 无法匹配实际文件中的 `\r\n`。

验证方法：
```bash
file index.html  # 如果显示 "CRLF line terminators" → 这个 bug
```

## 修复

项目根目录加 `.gitattributes`：
```
* text=auto eol=lf
```

然后重新 checkout 所有文件：
```bash
git rm --cached -r .
git checkout HEAD -- .
```

之后 `file index.html` 不再显示 CRLF。

## 预防

- 新 clone 的 Windows 项目如果要用 Edit 工具，先检查 `file <关键文件>` 确认行尾是 LF
- 如果显示 CRLF，加 `.gitattributes` 并 re-checkout
- 不要再写 `_runtime/patch.js` 绕行 — 修根因不治标

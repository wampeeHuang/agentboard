---
type: method
date: 2026-08-21
source: layout-gallery 英雄区轮播——python -c / heredoc / 长 curl 反复 unexpected EOF
---

# Git Bash 内联脚本反复被转义搞坏——写脚本文件再执行

## 现象

Windows Git Bash 里内联执行多行/含特殊字符的命令反复炸：

- `python -c "...代码..."` 里带引号、花括号、反斜杠 → `unexpected EOF while looking for matching '`
- heredoc（`<<EOF`）内嵌 python/JSON → 内容被吃掉或半截
- 长 `curl` 带 `-w "%{http_code}"`、`--resolve "host:443:ip"` → 引号错位、反斜杠被吃

症状随机出现，不是必现，排错浪费时间多轮。

## 根因

Git Bash（MSYS2 层）对引号、反斜杠、`%`、花括号有自己的转义规则，与 cmd/PowerShell 和 bash 的惯例都不同。多层嵌套（bash → 子 shell → python 字符串）每层各转义一次，最容易错的就是多层引号 + 正则/格式串里的 `\` 和 `{}`。curl 的 `-w "%{http_code}"` 里 `%{}` 在 MSYS 下还有路径转换（`/` 开头的参数被当 POSIX 路径转换）等叠加问题。

## 修复/步骤

1. 把命令写成脚本文件（`.py` / `.mjs` / `.sh`），落 `_runtime/`，再执行
2. 脚本内路径用绝对路径或相对脚本自身，不依赖 cwd
3. 验证脚本执行 = 执行完读输出，不靠肉眼检查命令本身

```bash
# 坏：内联
python -c "import json;print(json.dumps({'a':r'\d+'}))"

# 好：写文件
cat > _runtime/x.py <<'EOF'
import json
print(json.dumps({'a': r'\d+'}))
EOF
python _runtime/x.py
```

## 预防

- 命令超过 1 行、含引号/花括号/反斜杠/`%` 任何一个 → 直接写脚本文件，不内联
- 尤其是 `python -c`、heredoc、带 `-w "%{http_code}"` 的 curl
- PowerShell 侧同类问题见 `lark-cli-json-file-passing.md`——两端同一个原则：复杂入参走文件，不走命令行内联

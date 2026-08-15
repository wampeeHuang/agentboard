# 目录重命名：sed 顶层文件漏了被移动脚本内部的命令字符串

type: anti-pattern
date: 2026-08-15
source: layout-gallery platform/ → scripts/ 重命名后 check.mjs 命令门禁仍跑旧路径

## 现象

`platform/` 重命名为 `scripts/`，用 sed 改了「关键文件」（server.js 的 require、package.json 的 scripts、growth-agent.js 的路径），`validate.mjs --all` 也 exit 0。但 `check.mjs` 的总门禁在真正执行时仍调 `node platform/validate.mjs`——命令门禁断链，只是没跑到那步所以没暴露。

## 根因

重命名的残留引用不只藏在 caller 文件的 require/import 里，还藏在**被移动文件自身的字符串字面量**里。`check.mjs` 的 commandGate 数组存的是拼好的执行命令：

```js
const commandGate = [
  { cmd: `node platform/validate.mjs ${slug}`, ... },  // 字符串，不是 import
];
```

sed 只扫了「关键文件」（server.js / package.json / growth-agent.js），漏了 scripts/ 目录内部文件之间用旧路径互相引用。`validate.mjs --all` 不经过 commandGate，所以门禁过了，但 commandGate 是坏的。

## 修复

目录重命名后，残留扫描对象 = **全部文件，含被移动文件自身**：

```bash
grep -rn "旧目录名" . --include='*.mjs' --include='*.cjs' --include='*.js' --include='*.json'
```

不要只 grep caller 文件。被移动的脚本之间也互相引用旧路径。

## 预防

- 重命名目录 = 改「N 个文件互相引用」的分布式常量，与 `distributed-identifier-rename-cascade` 同类
- 判据：grep 旧目录名在**任何**文件出现 > 0 次，重命名就没完成
- 门禁命令（commandGate / spawn / exec 字符串）是经典漏网点——它们不是 import，sed 按 import 模式替换会漏

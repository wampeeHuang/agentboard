# PM2 Windows: script: 'npm' → SyntaxError Unexpected token ':'

type: capability
date: 2026-07-10
source: Forma 端口 3103 修复

## 现象
PM2 `script: 'npm'` + `args: 'run dev'`，启动后立即报错：
```
C:\PROGRAM FILES\NODEJS\NPM.CMD:1
:: Created by npm, please don't edit manually.
^
SyntaxError: Unexpected token ':'
```
进程反复重启（restart count 快速增长）。

## 根因
Windows 上 PM2 把 `npm` / `npm.cmd` 当成 JS 模块 `require()` 来加载，读到 `.cmd` 的批处理语法直接炸。

## 修复
`script` 直接指向实际的可执行 JS 文件，不经过 npm/cmd 壳：

```js
// 错误（Windows PM2 必炸）
script: 'npm',
args: 'run dev',

// 正确（以 Next.js 为例）
script: 'node_modules/next/dist/bin/next',
args: 'dev -p 3103',
```

通用公式：`node_modules/.bin/<command>` → 找到它实际指向的 JS 入口文件。

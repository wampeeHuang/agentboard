---
type: diagnosis
date: 2026-07-14
source: Forma 主题系统统一 + 部署到 forma.evopearl.com
---

# Vercel 部署：package.json 本地文件引用导致云构建失败

## 现象

`vercel --prod` 构建失败：
```
npm error enoent ENOENT: no such file or directory, open 'C:/Users/Administrator/AppData/Local/Temp/tailwindcss-postcss-4.3.2.tgz'
```
本地 `npm install` 正常，但 Vercel 云构建机器上是 Linux，不存在 C 盘路径。

## 根因

`package.json` 里写了 `"file:C:/Users/..."` 绝对路径依赖：
```json
"@tailwindcss/postcss": "file:C:/Users/Administrator/AppData/Local/Temp/tailwindcss-postcss-4.3.2.tgz"
```
这可能来自 `npm install some-package.tgz`（本地 tarball 安装），npm 在 package.json 和 lock 文件里都写入了绝对路径。本地能用，云端必炸。

## 修复

1. `package.json`：把 `file:` 依赖改为 npm registry 版本
   ```json
   "@tailwindcss/postcss": "^4.0.0"
   ```
2. 删 `package-lock.json`
3. `npm install` 重新生成干净 lock 文件
4. 提交 + push + 重新 `vercel --prod`

## 预防

- 安装 npm 包永远用 registry 版本（`npm install @scope/package@version`），不用本地 tarball
- 如果必须用本地包：放 `vendor/` 目录用相对路径 `file:vendor/xxx.tgz`，不写绝对路径

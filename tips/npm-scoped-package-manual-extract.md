---
type: method
date: 2026-07-10
source: 20260710_AI定价困局 Forma 推送
---

# npm scoped package 安装失败 → 手工解包兜底

## 现象

`npm install` 返回 "up to date" 但 `node_modules/@tailwindcss/postcss` 目录不存在。`npm pack` 下载 tgz 后 `npm install tgz` 同样 "up to date" 不安装。只有 `--force` 才实际写入。

## 根因

npm 的 install 状态检查依赖 package-lock.json 中的 integrity hash。lock 文件中已存在条目时跳过实际文件写入——即使 node_modules 目录被部分删除（如 `Remove-Item` 因文件锁失败跳过部分包）。

## 修复

1. `npm pack @scope/package@version --pack-destination $env:TEMP` — 下载 tgz
2. `New-Item -ItemType Directory -Force -Path "node_modules/@scope/package"`
3. `tar -xzf tgz -C "node_modules/@scope/package" --strip-components=1` — 手工解包

如果包无额外依赖，手工解包完全等价于 npm install。

## 预防

- `Remove-Item node_modules -Recurse` 失败时不静默继续——检查退出码和残留文件
- 删 node_modules 后必须同时删 package-lock.json，否则 npm install 误判"已安装"
- PowerShell `Push-Location` 比 `npm --prefix` 可靠——后者在某些情况下 cwd 不生效

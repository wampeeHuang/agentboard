# manifest JSON 编码损坏导致工具卡片静默消失
type: diagnosis
date: 2026-06-14
source: cron-scheduler 卡片从工具架消失，API 返回不包含该工具

## 现象
工具架某个卡片突然不显示，`GET /api/tools` 返回的列表里缺少该工具。
目录和 manifest.json 文件存在，但服务器跳过不报错。

## 根因
`server.js` 的 `scanTools()` 在 `JSON.parse` 失败时静默 catch 跳过：
```js
try { mf = JSON.parse(read(mfPath)); } catch(_) { return; }
```
manifest.json 中文字符在多次编辑中编码损坏（UTF-8 字节被当作 Latin-1 重新编码），
导致 JSON 结构断裂，解析失败，工具被静默丢弃。

## 修复/步骤
1. 检查 manifest 是否有效 JSON：`Get-Content manifest.json -Raw | ConvertFrom-Json`
2. 无效则用正确 UTF-8 编码重写整个文件
3. 无需重启服务器 — manifest 每次请求都会重新扫描

## 预防
- server.js 已改为：`catch(e) { console.error('[scanTools] 跳过无效 manifest:', mfPath, e.message); return; }`
- 下次再有同样问题，控制台会直接打印文件路径和错误原因
- ~~写 manifest 类文件时用 Write 工具~~ — 2026-07-02 实测 Write 工具同样带 BOM，不可靠。写完后用 `node -e "JSON.parse(fs.readFileSync('manifest.json','utf8'))"` 验证，报 Unexpected token '﻿' 就是 BOM，用 `node -e "const fs=require('fs');let r=fs.readFileSync('manifest.json','utf8');if(r.charCodeAt(0)===0xFEFF)fs.writeFileSync('manifest.json',r.slice(1))"` 去之

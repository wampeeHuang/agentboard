---
type: method
date: 2026-07-29
source: 飞书Base数据治理——分类依据枚举和点位计算方式枚举在文件夹外，HANDOFF记录"CLI不支持"
---

# lark-cli 有 base-block-move 命令，别再说"CLI不支持移动block"

## 现象

两张枚举表在 Base 根目录不在"数据治理"文件夹里。查 lark-cli help 没找到 block-move，在 HANDOFF 里写了"待用户手动移入文件夹（CLI不支持 block-move）"。

## 根因

`+base-block-move` 命令一直有，但：
1. 不在最常用的命令列表里（table/field/record/view 占大头）
2. 需要 auth scope `base:block:read`，之前的 auth 没加这个 scope

## 修复/步骤

```bash
# 1. 加 scope（需要扫码授权）
lark-cli auth login --scope "base:block:read" --no-wait --json
# → 拿 verification_url → 生成二维码 → 用户扫码

# 2. 完成授权
lark-cli auth login --device-code <code>

# 3. 列出所有 block（找文件夹 ID）
lark-cli base +base-block-list --base-token <token>
# → folder 的 id 就是 parent_id

# 4. 移动
lark-cli base +base-block-move --base-token <token> --block-id <table_id> --parent-id <folder_id>
```

**scope 常见错误**：`base:block:write` 不是有效 scope——只需要 `base:block:read`，写权限由已有的 `base:block:update` 覆盖。

## 预防

- 看到 `--help` 输出里不认识的命令别跳过，逐个扫一遍
- block 操作（folder/table move）的大前提是 scope 到位
- `+base-block-list` 返回完整的父子关系树，`parent_id: null` = 根目录

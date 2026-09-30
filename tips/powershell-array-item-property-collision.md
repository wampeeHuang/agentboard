---
type: diagnosis
date: 2026-09-22
domain: general
author: dsh-agent
source: 相机导入清单脚本在逐个哈希之前就退出，汇总行报 property Length cannot be found
---

# PowerShell 的 $objs.Item 会撞上数组自带的 Item 索引器

## 现象

一段"列文件并汇总体积"的脚本：

```powershell
$srcs = @(Get-ChildItem $dir -Filter *.JPG | ForEach-Object { [pscustomobject]@{ Kind='JPG'; Item=$_ } })
"待哈希: $($srcs.Count) 个, $([math]::Round((($srcs.Item) | Measure-Object Length -Sum).Sum/1GB,2)) GB"
```

报错退出，而且**发生在真正的工作（逐个哈希）之前**：

```
Measure-Object : The property "Length" cannot be found in the input for any objects.
```

## 根因

`$srcs` 是数组。`$srcs.Item` 不会做成员枚举取每个对象的 `Item` 属性，而是命中 **`System.Array` 自带的 `Item` 索引器**（等价于 `$srcs[0]`），于是 `Measure-Object Length` 拿到的是 PSCustomObject 而不是 FileInfo，找不到 Length。

对比：`$srcs.Count`、`$srcs.Name` 这类**不撞数组内置成员**的属性名会正常做成员枚举，所以问题只出现在少数撞名属性上（`Item`、`Count`、`Length`、`Rank`、`IsReadOnly` 等）。

## 修复

给自定义属性换一个不与数组/集合内置成员撞名的名字：

```powershell
[pscustomobject]@{ Kind='JPG'; File=$_ }        # 不要用 Item
$srcs | ForEach-Object { $_.File.Length }       # 需要聚合时显式遍历最稳
```

## 预防

- 给 PSCustomObject 起属性名时避开 `Item` / `Count` / `Length` / `Rank` 等数组与集合成员。
- **汇总行也能让整段作业前功尽弃**：本例汇总行在第 7 行就把脚本打断，真正的哈希一个都没跑，白等一轮。汇总/报告语句统一用 `ForEach-Object { ... }` 显式遍历，不依赖隐式成员枚举。

---
type: method
date: 2026-08-05
source: 猫波信号站 — 三段管线（curation→feishu→catwave）数据漂移无人知，加 verify_chain.ps1 终检
---

# 多段管线必须在末端接验证闸门

## 现象

猫波管线三段：agent 出 JSON → 脚本写飞书 → 同步到 catwave。每段看起来都跑通了（exit 0），但数据对不上：飞书缺 record_id、catwave 条目数 ≠ curation 候选数、状态面板三天没更新。所有失败都是静默的。

## 根因

每段脚本只验证自己的逻辑（"我写入了"），不验证下游消费者是否收到正确数据。没有跨段终检验证，故障只有人眼检查才能发现——但人不天天看。

## 修复

在管线末端加 verify_chain.ps1，三段闸门：

```
Gate 1: curation JSON candidates.count == catwave output videos.count
Gate 2: all today candidates have record_id AND Feishu status != "候选"
Gate 3: status panel last write time == today
```

任一闸门失败 → 飞书通知 + exit 1 阻断下游。验证脚本作为管线的最后一步执行，不是可选的人眼检查。

## 模板

```powershell
# verify_chain.ps1 — 三段模板
$failures = @()

# Gate 1: 上游产出 = 下游消费
if ($upstreamCount -ne $downstreamCount) {
    $failures += "GATE1: upstream=$upstreamCount, downstream=$downstreamCount"
}

# Gate 2: 所有记录进入目标状态
foreach ($item in $items) {
    if (-not $item.target_field) {
        $failures += "GATE2: $($item.id) missing target_field"
    }
}

# Gate 3: 产出文件时间戳 = 今天
if ((Get-Item $outputPath).LastWriteTime.ToString("yyyy-MM-dd") -ne $today) {
    $failures += "GATE3: output timestamp mismatch"
}

if ($failures.Count -gt 0) {
    # 通知 + 阻断
    Send-Alert -failures $failures
    exit 1
}
```

## 预防

- 每段管线结尾加验证脚本，不靠人眼
- 验证脚本作为管线的最后一步执行，失败 = 管线失败
- 通知机制不要嵌在验证逻辑里——验证脚本只收集 failure，通知是独立步骤

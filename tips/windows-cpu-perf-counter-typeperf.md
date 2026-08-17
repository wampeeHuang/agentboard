# Windows CPU/磁盘/网络监控：只用 typeperf/PDH，不碰 WMI

type: diagnosis
date: 2026-07-22
source: Supervisor 面板 CPU 数值与任务管理器对不齐，5 轮迭代从 wmic→WMI→Get-Counter→typeperf

## 现象

Node.js `execSync` 读取 CPU/磁盘/网络利用率，数值与任务管理器差 5-15%，用户反复说"明明就不一样"。

## 根因

任务管理器读的是 **PDH 性能计数器**（Performance Data Helper），不是 WMI。

| 方案 | 问题 |
|------|------|
| `wmic cpu get loadpercentage` | UTF-16 LE 编码，Node.js `encoding:'utf8'` 不处理 BOM+null 字节，结果乱码 |
| `Get-CimInstance Win32_Processor` | `LoadPercentage` 是 WMI 快照值，不是 PDH 计数器，偏低 5-10% |
| `Get-Counter` PowerShell | 反斜杠转义在 Node.js execSync 字符串中不可靠，间歇性失败 |
| **`typeperf`** | Windows 内置 CLI，直接读 PDH 计数器，两样本取平均，数值与任务管理器一致 |

typeperf 用法：
```bash
typeperf "\Processor(_Total)\% Processor Time" -sc 1    # CPU
typeperf "\PhysicalDisk(_Total)\% Disk Time" -sc 1       # 磁盘
typeperf "\Network Interface(*)\Bytes Total/sec" -sc 1   # 网络
```

## 修复/步骤

1. 用 `typeperf` 替换所有 WMI/Get-Counter 传感器
2. 输出是 CSV，解析最后一行含逗号且不含"PDH"的数据行
3. 网络需要遍历所有网卡求和，再 `×8 ÷ 1024²` 转 Mbps

## 预防

Windows 上要对齐任务管理器 = 直接用 typeperf/PDH。WMI 数值来自不同采样机制，永远对不齐。

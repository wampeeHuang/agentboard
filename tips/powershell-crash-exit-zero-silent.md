---
type: diagnosis
date: 2026-08-20
source: supervisor guard.ps1 静默 18 小时未拉起服务排查
---

# PowerShell 脚本顶部崩溃却 exit 0，静默失败

## 现象

supervisor 守护的 agentboard 挂了 18 小时，guard.ps1（Task Scheduler 每 5 分钟触发）从没拉起它。飞书告警一条没发。但 Task Scheduler 显示 `LastTaskResult=0`（"成功"）。

## 根因

`Join-Path` 只接受 2 个参数（`-Path` + `-ChildPath`）。原脚本写成多参数：

```powershell
$BackoffFile = Join-Path $SupervisorDir '_runtime' 'state' 'backoff.json'  # 4 个位置参数 → 炸
$StderrDir = Join-Path $SupervisorDir '_runtime' 'crash'                  # 3 个 → 炸
```

脚本在**第 7 行就抛 ParameterBindingException**，检测/拉起/告警逻辑一行没执行到。

关键陷阱：PowerShell `-File` 模式跑脚本，**脚本抛未捕获异常后 exit code 仍是 0**。于是 Task Scheduler 的 LastTaskResult=0 看起来"跑成功了"，实际脚本顶部就崩了。

## 修复/步骤

1. `Join-Path` 多参数 → 把子路径并进 ChildPath 用反斜杠分隔：
   ```powershell
   $BackoffFile = Join-Path $SupervisorDir '_runtime\state\backoff.json'
   ```
2. 验证 PowerShell 脚本**必须真跑一遍**，不能只看语法检查。

## 预防

- `PSParser::Tokenize` 只做词法/语法 token 分析，**查不出运行时参数绑定错误**。别拿它当"脚本能跑"的证明。
- PowerShell 脚本排查静默失败，第一动作是手动 `& powershell -File x.ps1` 跑一遍看 stderr，而不是读代码猜逻辑。
- 给守护/定时脚本加"心跳日志"（每次运行写一条结果），否则崩了是黑盒，只能等事故暴露。

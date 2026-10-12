# Agentboard 工具架「能开能停」演练纪要

## 已完成

1. **PATH 补全**：用户已执行 machine PATH 追加命令（Python311 / Scripts / Docker / Git / .local / WindowsApps），18 个路径缺失工具已可解析。
2. **停起演练**：通过 `node D:\agent-skills\skills\agentboard-service-recovery\scripts\stack.js stop` 后再 `start`，验证完整生命周期。

## 演练结果

| 阶段 | 结果 |
|---|---|
| `stack.js stop` | 17/18 运行中服务经守护 API 正常停止；守护 3097 进程已杀；关键端口（3099/3100/3102/3095/3119）全部释放。 |
| 权限缺口 | 当前非管理员会话无法停用 Windows 计划任务 `SupervisorGuard`，`stop` 中「停用外部守卫」会提示手动以管理员执行 `Disable-ScheduledTask -TaskName SupervisorGuard`。 |
| `stack.js start` | 守护 3097 20s 内就绪；所有 `autoStart=true` 服务自动拉起；关键端口全部恢复。 |
| 最终状态 | 共 40 个服务，16 个 running（均为 autoStart），0 个 dead；关键端口 3099/3100/3102/3095/3119 全部 200。 |

## 后续待办

- **问题 2**：`_runtime` 677MB 清理（用户已表示会处理）。
- **定时任务**：用户已表示会去全面取消失败的 cron 任务。
- **外部守卫彻底关停**：若需要「关干净」，请用管理员 PowerShell 手动 `Disable-ScheduledTask -TaskName SupervisorGuard`；重新启用则 `Enable-ScheduledTask -TaskName SupervisorGuard`。
- **脚本改进**：已更新 `stack.js`，对计划任务权限失败给出明确提示，不再误报「已停用」。

---
type: method
date: 2026-08-02
source: evopearl-data 部署依赖 cron 触发，机器未开机导致数据未部署
---

# 本地调度器：事件触发为主，cron 兜底

## 现象
本地调度器的 cron 触发看似"定时执行"，但机器没开 = cron 不会补跑。
evopearl-data 部署设了 9:30 cron 兜底，实际上游 agent 因开机延迟到 9:03 才启动，
部署 9:06 就触发了（早于 cron），但数据文件 9:08 / 9:16 才落盘——部署失败。

## 根因
本地调度器不是 7×24 服务。cron 可靠性 = 开机概率。
对于"上游产出 → 下游部署"这类流水线，唯一可靠的触发机制是事件（chain trigger），不是时间。

## 设计原则
**新 pipeline 设计时，第一个问题是"上游完成事件是什么？"而不是"几点跑？"**

```
事件触发（主）→ chain edge，upstream 完成 → 30s → downstream
cron 兜底（辅）→ 设晚 1-2 小时，仅处理事件触发失败的情况
```

## 预防
- pipeline 类型的 job 全部配 chain edge，cron 只做兜底
- 兜底 cron 设在正常完成时间 + 1h 以后（不是上游 cron 时间 + 30min）
- agent 产出文件后 git push，下游 deploy 的 gate check（Test-Path）保证幂等——触发早了只是 skip，不炸

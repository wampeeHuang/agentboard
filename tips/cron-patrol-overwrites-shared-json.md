# Cron 巡检重写共享 JSON，非巡检字段被静默丢弃
type: diagnosis
date: 2026-07-03
source: 深圳保障房导航 dashboard — personal data 反复消失，根因是 scheduler patrol 重写 data.json

## 现象
- Dashboard 页面正常工作，`/data` 端点返回完整数据
- 个人信息（档案、进度、对比、避坑）随机消失，不是每次都消失
- 查 git log：data.json 被 cron agent 提交覆盖，只剩巡检字段
- 用户反馈"怎么又没了？上次也是没有了"

## 根因
Scheduler cron agent（外部进程）每周一 9:00 执行巡检，产出 data.json。agent 的做法是：

1. 读取旧的 data.json
2. 只更新巡检相关字段（最新配租动态、信息源、更新时间）
3. **把整个对象写回 data.json**

问题在步骤 3——agent 只认识巡检字段，写入时把所有非巡检字段丢弃了。

```
巡检前: data.json = { 巡检字段, 个人档案, 申请进度, 避坑指南, 快捷入口, ... }
巡检后: data.json = { 巡检字段 }   ← 其他全丢
```

Git push 后，下次 `git pull` 或重新部署时个人数据就没了。

这和 `dual-writer-state-overwrite.md` 不同——那里是两个模块同一进程竞争。这里是**外部 cron agent 不认识完整 schema**，把共享文件当自己独占的输出。

## 修复
拆分文件 + API 层合并：

```
data.json      ← 只有巡检字段（cron agent 独占写入）
personal.json  ← 个人数据（永不被自动化触碰）
server.js      ← /data 端点合并二者返回
```

server.js 合并逻辑：personal 优先级 > patrol，同名 key personal 覆盖。

## 预防
- 任何 cron/scheduler/外部 agent 写共享 JSON → 先问：agent 认识完整 schema 吗？不认识 → 拆分文件
- 人机共享的 JSON 文件天然有竞争风险——人写字段 ≠ 机器写字段，机器重写全文件 = 人的字段丢失
- 设计原则：每个 JSON 文件只有一个写者。多个写者 → 多个文件 + merge layer

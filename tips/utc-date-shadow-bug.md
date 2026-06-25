# UTC 时区影子 Bug：toISOString() 在非 UTC 时区凌晨截出前一天日期

type: bug-pattern
date: 2026-06-25
source: evopearl-data 调度器日报缺失排查

## 现象

凌晨到早 8 点（CST）运行的定时任务，调度器报告 `output_missing` 或 `文件修改时间早于执行窗口`，但 Agent 实际已生成正确的当日文件。

## 根因

`new Date().toISOString().slice(0, 10)` 返回的是 **UTC 日期**，不是本地日期。

CST = UTC+8，凌晨 0:00-7:59 CST 的 UTC 日期是**前一天**。

```
北京时间 2026-06-25 07:30
       = UTC 2026-06-24 23:30
       
toISOString() → "2026-06-24T23:30:00.000Z"
slice(0,10)   → "2026-06-24"  ← 前一天！
```

调度器用这个日期去检查 `data/ai-signal/2026-06-24.json`（昨天的旧文件），发现修改时间早于执行窗口 → 报告 output_missing → git push + deploy 断链。

## 影响面

调度器 `scheduler.js` 中共 4 处用 `toISOString().slice(0,10)` 做日期比较，全部受影响：
- `verifyOutput()` 文件路径中的 YYYY-MM-DD 替换
- `wasMissed()` 补跑判断
- `tick()` 每日重置逻辑
- `gitPushAndDeploy()` commit message

下午运行时 UTC 日期 = 本地日期，bug 不可见。只在凌晨到早 8 点暴露。

## 修复

写 `localDate(d)` 辅助函数，用本地时间拼日期：

```js
function localDate(d) {
  d = d || new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
```

所有日期比较统一用 `localDate()`。

对于 `lastRun` 这种已存储为 UTC ISO 字符串的时间戳，比较时转回本地：
```js
localDate(new Date(ts.lastRun))
```

## 预防

- Node.js 后端：日期比较优先用 `date-fns` 或 dayjs 的 `format('yyyy-MM-dd')`（默认本地时区）
- 或者直接用 `Intl.DateTimeFormat`
- 凡是看到 `toISOString().slice(0,10)` 做业务逻辑判断的，一律替换

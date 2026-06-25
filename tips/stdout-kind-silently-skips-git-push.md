# output.kind: "stdout" 导致 git push 静默跳过

type: config-gap
date: 2026-06-25
source: evopearl-data 调度器重构后日报持续不出

## 现象

定时任务显示"成功"（绿色），Agent 确实生成了正确的产出文件，但文件永远在 `git status` 的 untracked 里，从未被 commit/push，网站看不到更新。

## 根因

`scheduler.js` 的 `gitPushAndDeploy` 触发条件：

```js
if (outputCheck.ok && outputCheck.method === 'file' &&
    outputCheck.path && outputCheck.path.indexOf(EVOPEARL_DATA_DIR) === 0) {
    gitPushAndDeploy(job, outputCheck.path);
}
```

`method` 来自 `job.output.kind`：
- `kind: "file"` → verifyOutput 检查产出文件 → method = "file" → gitPushAndDeploy 触发
- `kind: "stdout"` → verifyOutput 检查 stdout 捕获文件 → method = "stdout" → **gitPushAndDeploy 跳过**
- `kind: "side_effect"` → method = "side_effect" → **跳过**

"stdout" 虽然能捕获 Agent 的控制台输出，但它不是业务产出文件。当架构重构把 git push 职责从 Agent（Gate 5/6）移交给调度器后，如果 jobs.json 里的 output.kind 没同步改成 file，调度器不会替你做这个动作。

表象：job 绿了但什么都没发生。

## 影响面

任何满足以下条件的 job：
1. `output.kind` 不是 `"file"`
2. 产出是文件且需要 git push + deploy
3. 依赖调度器（而非 Agent 自己）做 git 操作

evopearl-data 三个日报任务从项目创建以来就是 `kind: "stdout"`，重构前由 Agent 自己调 git push（走 Gate 5/6），重构后调度器接管但配置未同步。

## 修复

jobs.json 中把 `output.kind` 从 `"stdout"` 改为 `"file"`，确保 `output.path` 指向正确路径（支持 YYYY-MM-DD 变量）。

```json
"output": {
    "kind": "file",
    "path": "D:\\workspace\\evopearl-data\\data\\daily-selection\\YYYY-MM-DD.json"
}
```

## 预防

- 新 job 用 `kind: "file"` 不要用 `"stdout"`
- "stdout" 只适用于仅需 stdout 日志、不依赖调度器二次处理的任务
- 架构重构时检查：改了谁做 git push → 同步改所有相关 job 的 output.kind
- dashboard 卡片上 `method: "stdout"` 不显示产出路径，可作为快速筛查信号

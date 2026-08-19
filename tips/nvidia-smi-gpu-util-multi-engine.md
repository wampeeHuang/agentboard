---
type: fact
date: 2026-07-22
source: Supervisor GPU 显示 0%，用户质疑"cpu又没显存 都是靠gpu渲染的 怎么会是0"
---

# nvidia-smi utilization.gpu 只含 3D 核心，不是 GPU 总利用率

## 现象

`nvidia-smi --query-gpu=utilization.gpu` 返回 0-2%，但 GPU 明显在渲染桌面。

## 根因

NVIDIA GPU 有多个独立引擎：3D 核心、显存控制器、编码器、解码器。

`utilization.gpu` **只报告 3D 计算核心利用率**。桌面合成/浏览器渲染走显存控制器（`utilization.memory`），不走 3D 核心。

任务管理器显示的 GPU 利用率 = **所有引擎中的最高值**。

## 修复/步骤

```bash
nvidia-smi --query-gpu=utilization.gpu,utilization.memory,memory.used,memory.total --format=csv,noheader,nounits
```

```javascript
const m = out.trim().match(/(\d+),\s*(\d+),\s*(\d+),\s*(\d+)/);
const gpuUtil = Math.max(parseInt(m[1]), parseInt(m[2])); // max engine
```

## 预防

任何显示 GPU 利用率的地方，取多引擎 max，不单看 `utilization.gpu`。3D 核心只对游戏/3D 渲染有意义。

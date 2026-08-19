---
type: fact
date: 2026-07-17
source: ACE Step 启动诊断，杀完 ComfyUI+MiniCPM-V 后 nvidia-smi 数字不降，误判显存不足
---

# Windows 上 nvidia-smi 报告的显存"已用"不可信：WDDM 模式含 DWM 缓存

## 真相

Windows WDDM（Windows Display Driver Model）模式下，nvidia-smi 报告的 "Used" / "Free" 包含三层：
1. DWM 桌面窗口合成缓存（每个窗口都有）
2. Driver standby 内存池（WDDM 预留，CUDA 请求时可释放）
3. 实际 CUDA 上下文（PyTorch/TensorFlow 等）

杀掉 CUDA 进程后，driver 把释放的显存放入 standby 池而非 "Free" 桶。nvidia-smi 数字不变，但 CUDA 实际可分配。

## 怎么判断真正可用

**不要看 nvidia-smi 的 "Used"。看 CUDA API 返回值**：

```python
import torch
props = torch.cuda.get_device_properties(0)
print(f"Total: {props.total_memory / 1024**3:.1f} GB")
# 能分配多少由 CUDA 驱动动态管理，WDDM 会为 CUDA 请求让出 standby 内存
```

或者直接启动工具，看它自己的 GPU 检测日志。ACE Step 日志：
```
CUDA GPU detected: NVIDIA GeForce RTX 5060 Ti (15.9 GB)
Detected 15.93GB VRAM — treating as 16GB class GPU
```

这比 nvidia-smi 的 `12675 MiB / 16311 MiB` 准确得多。

## 什么时候 nvidia-smi 数字有用

- 看**趋势**：正在跑 CUDA 任务时，Used 上升 = 模型在加载
- 看**进程列表**：`nvidia-smi` 的 Processes 表告诉你谁在用 GPU，类型是 C+G（共用图形）还是 C（纯计算）
- **不要用来判断"能不能再启动一个 CUDA 程序"**

## 已知受影响工具

ComfyUI、Stable Diffusion WebUI、MiniCPM-V、ACE Step——所有 Windows CUDA 工具都受 WDDM 报告偏差影响。Linux 上（非 WDDM）nvidia-smi 数字准确。

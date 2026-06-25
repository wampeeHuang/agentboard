# faster-whisper GPU 检测：用 ctranslate2 而非 torch.cuda

type: diagnosis
date: 2026-06-24
source: 猫波信号站 stage_03 GPU 转写调试

## 现象
RTX 5060 Ti 16GB 显卡，CUDA 已安装，但 `torch.cuda.is_available()` 返回 `False`，
faster-whisper 回落到 CPU 模式，转写速度 ~1x 实时（vs GPU 55x）。

## 根因
faster-whisper 底层用 CTranslate2 做推理，不是 PyTorch。CUDA 可用性判断应该用
`ctranslate2.get_cuda_device_count()`，而非 `torch.cuda.is_available()`。
本机 PyTorch 是 CPU-only 版本（python 3.14 的 pip 默认安装），`torch.cuda` 不含 CUDA 扩展。

此外 CTranslate2 需要 `cublas64_12.dll` 等 CUDA 12 runtime DLL，
这些 DLL 在 `site-packages/nvidia/cublas/bin/` 下但不在系统 PATH。

## 修复
```python
from ctranslate2 import get_cuda_device_count
device = "cuda" if get_cuda_device_count() > 0 else "cpu"
```
DLL 路径：`python -m pip install nvidia-cublas-cu12`，然后在 faster_whisper import 之前：
```python
_nv_root = Path(sys.base_prefix) / "Lib" / "site-packages" / "nvidia"
if _nv_root.exists():
    for _d in ["cublas/bin", "cuda_nvrtc/bin", "cufft/bin", "curand/bin",
               "cusolver/bin", "cusparse/bin"]:
        _p = str(_nv_root / _d)
        if os.path.isdir(_p) and _p not in os.environ["PATH"]:
            os.add_dll_directory(_p)
```

## 预防
faster-whisper 项目：永远用 `ctranslate2.get_cuda_device_count()` 做 GPU 检测。
Windows + NVIDIA 环境：在 faster_whisper import 前注册 NVIDIA DLL 路径。

# Blackwell GPU 自回归模型数值偏差诊断

type: diagnosis
date: 2026-06-28
source: Confucius4-TTS 本地推理 vs 官方 demo 对比

## 现象
TTS 模型本地推理产出极短（0.5-1s vs 官方 3-9s）、极安静（peak 0.02-0.10 vs 官方 0.70-0.89）的音频。合成正弦波 prompt 正常、真人录音 prompt 失败，但官方 demo 用同一录音正常。

## 根因
RTX 5060 Ti (Blackwell sm_120, 2026年3月发布) + PyTorch 2.11 + CUDA 12.8 的 Flash Attention/cuDNN kernel 尚未充分优化。自回归生成每一步的微小数值偏差在 50-150 步后累积放大，导致 T2S 语义 token 序列与 A100/H100 结果显著分化。

## 修复
短期用官方 Gradio API (`gradio_client` → `confucius4-tts.youdao.com/gradio`)，长期等 PyTorch/CUDA 更新。

## 诊断步骤
1. 官方 demo 验证：排除录音格式/代码/权重问题
2. 管道分段注入：确认 W2V-BERT、CAMPPlus 特征提取正常
3. T2S token 计数：发现 greedy 退化为重复循环 (1479 tokens)，sampling 产出 15-53 tokens（正常应 50-170）
4. 排除 SDPA backend：math/mem_efficient/flash 表现一致
5. CPU 推理不可行（2.6GB 模型），但已足够锁定 GPU 架构差异

## 预防
- 新 GPU 架构跑自回归模型前，先用官方 demo/Colab 做基准对比
- `gradio_client` 兼容性坑：`_json_schema_to_python_type` 遇到 bool schema 会炸，需 monkey-patch

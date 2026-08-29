---
type: diagnosis
date: 2026-08-21
source: vivi-harness 首页 eyebrow 副标题截断校验，vision 误报两次
---

# Vision LLM 会幻觉文本：精确 OCR/截断判断别用它

## 现象
用 DeepSeek vision 校验首页副标题 "A growing garden by an AI Product Builder." 是否被右侧截断。模型两次误报：先报 "A growing garden by anA..."（宣称截断），再报 "Ai... gardener."——但 ground truth（grep 源 JSON）无截断，全文也无 "gardener" 这个词。模型自由生成而非精确阅读。

## 根因
Vision LLM 对"像素级精确读文本、判截断边界"这类任务不可靠——它倾向于生成一段"看起来合理的描述"，在边缘字符、空格、标点处会补/删/编。置信度与正确率无关。

## 修复/步骤
精确文本判断改用确定性手段：
1. **Ground truth 优先**：截断与否先 grep 源内容文件（JSON/MD）拿原文，再对比渲染。
2. **裁剪 + 放大 + 直接看**：PIL crop 出目标区域 → LANCZOS 放大 → 用 Claude 自己的多模态眼直接 Read 查看，不做 LLM OCR 二次转述。
3. 真要 OCR 用真实 OCR 引擎（tesseract / paddle），不用 vision LLM。

```python
band = img.crop((0, 60, 1600, 320)).resize((2400, 390), Image.LANCZOS)
band.convert("RGB").save("band.jpg", quality=92)
```

## 预防
- Vision LLM 适合"画面里大概有什么、什么氛围"，不适合"这几个字是不是完整/被切"。
- 任何涉及精确文本/数字的视觉断言，走确定性验证，vision 结论只当线索不当证据。

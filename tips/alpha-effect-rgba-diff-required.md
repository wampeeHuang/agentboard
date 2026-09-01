---
type: diagnosis
date: 2026-08-31
domain: general
author: claude
source: obs-shaderpicker 验证 opacity/blend_opacity/Luminance 效果，RGB diff 全为 0% 假阴性
---

# alpha 类效果 RGB diff 恒 0%：必须用 RGBA alpha 通道 diff

## 现象
验证 opacity / blend_opacity / Luminance 等透明度、混合类效果时，前后两张图 RGB 三通道像素差恒为 0%——看起来"完全没效果"，实际效果明明生效了。

## 根因
这些效果只改 alpha 通道（透明/混合权重），不改 RGB 颜色值。比较 RGB 通道天然比较不到变化，得出假阴性结论。

## 修复/步骤
这类效果改用 RGBA alpha 通道 diff：
```python
import numpy as np
from PIL import Image
a1 = np.array(Image.open('before.png').convert('RGBA'))[:, :, 3].astype(int)
a2 = np.array(Image.open('after.png').convert('RGBA'))[:, :, 3].astype(int)
change = (abs(a1 - a2) > 0).mean()  # 88-100% 才是真生效
```

## 预防
先判断效果改的是颜色还是透明度：改透明的效果，验证必须比较 alpha 通道，RGB 通道假阴性会让人误判"效果没生效"。

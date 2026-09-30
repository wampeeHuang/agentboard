---
type: diagnosis
date: 2026-09-24
source: 宋连达品牌项目——对中文路径下的工厂照片做 cv2.imread 返回 None、cv2.imwrite 静默失败不写文件
---

# OpenCV 在非 ASCII 路径上静默失败：读图返回 None，写图不报错也不写

## 现象

两处，都在中文（非 ASCII）路径下：

1. `cv2.imread(r"D:\...\宋连达变压器工厂\DSC01736.JPG")` **返回 None**，不抛异常。
   代码里若写成 `if im is None: continue`，会静默跳过全部 110 张图，最后报"处理 0 张"。
2. **更隐蔽的一处**：`cv2.imwrite(中文路径, img)` **返回 False 且不抛异常**。
   脚本跑完打印了完整的分析报告（"命中 71 张 / 已保存 JSON"），
   但打开输出目录是**空的**——20 张裁切图一张都没写出来。
   报告显示成功，产物不存在。

## 根因

OpenCV 的文件 IO 走 `fopen` 一类的窄字符接口，不认 Windows 的 UTF-16 路径。
失败时返回 `None` / `False`，不抛异常。

## 修复/步骤

读写都改成"自己读字节 + OpenCV 解码/编码"：

```python
import numpy as np, cv2

# 读
buf = np.fromfile(path, dtype=np.uint8)
im = cv2.imdecode(buf, cv2.IMREAD_COLOR)      # 失败仍返回 None，需显式判空

# 写
ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 88])
if not ok:
    raise RuntimeError("encode failed")
buf.tofile(path)                               # numpy 的 tofile 支持 Unicode 路径
```

## 预防

- **路径含中文/空格/特殊字符时，默认不信任任何图像库的直接 IO**，一律走 `np.fromfile` + `imdecode` / `imencode` + `tofile`。
- **写文件的步骤必须回读验证**：写完立刻 `os.path.getsize()` 或列出目录计数，
  并在报告里输出"实际写出 N 个文件"。只打印"已完成"不算。
- 这条与 `cv2.imwrite` 同类的一整族问题：**返回码被忽略时，"成功"只是没报错**。

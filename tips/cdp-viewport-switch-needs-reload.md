---
type: method
date: 2026-08-23
source: 字荐字体库 CDP 响应式验证，1920/1440/390 三档视口切换
---

# CDP 换视口后必须 reload，否则量到过期布局

## 现象
用 `Emulation.setDeviceMetricsOverride` 从桌面切到手机视口，紧接着 `Runtime.evaluate` 量 `.font-card`/grid，报横向溢出（overflow-x），实际手机上并不溢出。数值是旧视口下的残留布局。

## 根因
`setDeviceMetricsOverride` 立即改视口，但页面布局是异步重排的。CDP 调用返回时不代表 CSS 布局已完成，紧接的 evaluate 量到的是上一视口尺寸算出的旧几何。

## 修复
每次 `setDeviceMetricsOverride` 之后、测量之前，先 `Page.reload{ignoreCache:true}`，再 sleep 等字体/资源加载：

```js
await send('Page.enable');
for (const w of [1920, 1440, 390]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 600 });
  await send('Page.reload', { ignoreCache: true });
  await sleep(1200);
  // 此处再量几何，数值才对
}
```

## 预防
凡是 CDP 换视口/换设备后测量 DOM 几何，一律先 reload。看到"手机溢出"先怀疑是视口切换伪溢出，用全新加载验证一次再下结论。

# 手机框架状态栏不能是纯色块
type: diagnosis
date: 2026-06-14
source: 折光 MVP 手机预览——phone-frame.html 构建

## 现象
在 iPhone 15 Pro 框架里加载 App 时，顶部状态栏区域显示为纯黑块，不像真手机。

## 根因
phone-frame 的直觉做法是把 iframe 放在状态栏下方（`top: 54px`），状态栏区域用纯色背景填充。但真手机的状态栏是**透明的**——上面只浮着时间文字和信号图标，下方内容透过状态栏可见。纯色块让手机看起来像假模型。

第二个问题：iframe 满屏后，被加载的 App 如果 header 是 `position: sticky; top: 0`，内容会冲到状态栏区域（和时钟/信号图标重叠），因为没有 safe area padding。

## 修复/步骤

**两层修复，必须一起做：**

### 层 1：phone-frame 侧——渐变 scrim 替代纯色块
状态栏背景不是纯色，是极淡的渐变 scrim，从上方稍微压暗保证文字可读，下方完全透明：
```css
#statusScrim {
  position: absolute; top: 0; left: 0; right: 0; height: 60px; z-index: 14;
  background: linear-gradient(to bottom,
    rgba(0,0,0,0.35) 0%,
    rgba(0,0,0,0.08) 65%,
    transparent 100%);
  pointer-events: none;
}
/* iframe 满屏，不设 top 偏移 */
#contentArea { position: absolute; top: 0; left: 0; width: 390px; height: 100%; }
```

### 层 2：App 侧——safe area 参数联动
phone-frame 加载 App 时传入 `inPhoneFrame=1` URL 参数。App 检测到此参数后自动加 padding：

```javascript
// phone-frame 侧
function loadApp(url) {
  const u = new URL(url, window.location.origin);
  u.searchParams.set('inPhoneFrame', '1');
  appFrame.src = u.toString();
}

// App 侧
if (new URLSearchParams(window.location.search).get('inPhoneFrame') === '1') {
  document.body.style.paddingTop = '54px';
}
```

## 预防
- 做手机框架预览时，状态栏始终用渐变 scrim，不用纯色、不用 solid background
- 被预览的 App 必须有 safe area 感知——要么检测 `inPhoneFrame` 参数，要么用 CSS `env(safe-area-inset-top)`
- 框架和 App 是一对联动关系，只改一边必然出问题

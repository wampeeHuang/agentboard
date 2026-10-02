---
type: diagnosis
date: 2026-10-02
domain: general
author: dsh-agent
source: script-editor：线上「打开任何项目弹 creationContract is not defined」，本机完全正常；根因是云构建只复制字体，前端引用的两个 .js 从未被打包
---

# 白名单式构建与"引用面"脱钩：本机永远不复现的线上 undefined

## 现象

- 线上站点打开**任何**项目都报错：`creationContract is not defined`。
- **本机同一份源码完全正常**，无法复现。
- 产物里 `index.html` 引用了 `/media/creation-constraints.js` 与 `/media/planning-media.js`，但这两个文件**不在部署包内** → 请求 404 → 全局函数未定义。

## 根因

该项目的部署包是**白名单组装**的：构建脚本把源目录里"选中的东西"复制到发布目录。而这份白名单只按**扩展名**筛选了字体：

```python
for file in (ROOT/'media').rglob('*'):
    if file.suffix.lower() in ('.woff2','.woff','.ttf','.otf'):
        shutil.copy2(file, OUT/'media'/...)
```

于是 `media/` 下的**所有 `.js` 都没进包**。但源 HTML 仍原样引用它们，且构建脚本只剥离了另外两个本机专用脚本（`local-cloud-controls.js`、`planning-relations.js`）——**它并不知道还有第三个、第四个**.

**为什么本机不复现**：本机服务是"从仓库根直接提供静态文件"（`_server_static` 解析 `ROOT/path`），`media/` 一应俱全。**部署产物是白名单子集，本机服务是全量目录**——两者对"文件是否存在"的答案不同。

## 修复

把被引用却未打包的共享脚本显式加入白名单：

```python
# 站点同样引用的共享前端脚本（纯前端，无 fetch / 无 /api/）
for script in ('creation-constraints.js', 'planning-media.js'):
    shutil.copy2(ROOT/'media'/script, OUT/'media'/script)
```

上线后验证（对**生产**站点，不是本地）：

```
/media/creation-constraints.js → HTTP 200
typeof creationContract        → "function"   （修复前是 undefined）
4xx/5xx 响应                    → 无
page error                     → 无
```

## 为什么这类故障特别容易长时间存活

1. **它只在部署环境出现**，本机开发全程绿灯，测试若只跑本机就永远抓不到。
2. **它的表现是"某个全局函数 undefined"**，看起来像代码 bug，排查方向会被引向源码而不是打包。
3. **构建日志里其实有线索**：调试期间日志打印过这两条 404，但被当成"探针环境缺文件"忽略掉——**把真实故障读成了工具噪音**。

## 预防

- **核对"引用面"**：源文件 `src=` / `import` 引用了哪些资源，构建就必须打包哪些。最稳的做法是让构建**按引用清单复制**，而不是按扩展名白名单猜。
- **本机 vs 部署产物要做等价性检查**：凡是"全量目录"与"白名单子集"两套供给逻辑并存的项目，都要有一条检查比对「源 HTML 引用的资源」⊆「产物中的资源」。这类检查成本极低，却能拦住整条故障线。
- **验证部署产物要看资源与控制台，不要只查标记**：数 `index.html` 里某字符串出现几次，证明不了页面能跑。
  ```python
  page.on('response', lambda r: bad.append(r.url) if r.status >= 400 else None)
  page.evaluate("() => ({fn: typeof creationContract})")   # 期望 "function"
  ```
- **调试日志里的 404 不要默认归因于"探针环境"**：先确认该资源在生产上是否也存在。

## 判据

> **"本机好好的，线上报某个函数 undefined"** —— 第一反应查该文件在不在构建白名单里，而不是读源码找 bug。

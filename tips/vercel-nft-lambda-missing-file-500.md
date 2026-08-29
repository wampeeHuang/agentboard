---
type: diagnosis
date: 2026-08-25
source: layout-gallery 推公网，品牌套件 /brand 线上 500（自 08-18 潜伏）
---

# Vercel lambda 缺数据文件 500：参数化路径喂不饱 nft，__dirname 派生才能进包

## 现象

本地 `node server/server.js` 一切正常，`vercel --prod` 部署后某个路由 500，报错指向一个数据文件不存在（如 `ENOENT /var/task/data/token-defaults.json`）。代码没变，本地/线上表现不同。

## 根因

Vercel 打包 serverless 函数时用 nft 做静态文件追踪：只把代码里**能静态分析到的** `readFile` 路径收进 `.func/` 包。写法决定是否被追踪：

```js
// ❌ 参数化路径：projectDir 运行时才确定，nft 追不到 → 文件不进包 → 线上 500
const configPath = path.join(projectDir, 'data', 'token-defaults.json')

// ✅ __dirname 派生路径：打包时就确定，nft 自动收录
const configPath = path.join(__dirname, '..', 'data', 'token-defaults.json')
```

同一文件里已有别处用 `__dirname` 读文件（如 brand-template.html），新读法照抄即可。

## 诊断

`npx vercel build` 后查打包清单，和运行时报错路径逐条比对：

```bash
# 本地构建，看 serverless 包实际收进了哪些文件
ls .vercel/output/functions/server/*.func/       # 缺哪个数据文件一目了然
find .vercel/output/functions/server -name '*.json'
```

本地正常 + 线上 500 + 报错在 `ENOENT /var/task/...` = 高概率是文件没进包，不是代码 bug。

## 预防

- 凡 lambda 运行时读的数据文件，一律用 `__dirname` 派生的相对路径，不拼接参数化目录
- 部署后按路由清单逐个探测（/brand、/api/*、文章页），不抽检首页——潜伏 bug 的隐蔽性在于"一直没被访问"
- 用 `npx vercel build` 检查 `.func/` 清单是上线前的廉价保险

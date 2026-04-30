# 支付宝记账本支出看板 V15 - Cloudflare Worker 同步版

## 这版解决什么问题

V15 不再把 GitHub Token 放在前端代码或 `data.json` 里。

同步逻辑：

```text
GitHub Pages 网页
        ↓
Cloudflare Worker
        ↓
GitHub API
        ↓
更新仓库根目录 data.json
```

这样其他手机/电脑打开同一个 GitHub Pages 地址时，会自动读取最新的 `data.json`。

---

## 一、上传 GitHub Pages 项目

把这些文件上传到你的 GitHub 仓库根目录：

```text
index.html
data.json
manifest.json
service-worker.js
cloudflare-worker.js
README.md
css/
js/
assets/
```

---

## 二、部署 Cloudflare Worker

1. 打开 Cloudflare Dashboard
2. Workers & Pages
3. Create Worker
4. 把本项目里的 `cloudflare-worker.js` 内容复制进去
5. Deploy

---

## 三、设置 Worker 环境变量

在 Cloudflare Worker 的 Settings / Variables 里添加：

```text
GH_TOKEN   你的 GitHub Token
GH_OWNER   evanlliu
GH_REPO    alipay-bookkeeping
GH_BRANCH  main
DATA_PATH  data.json
```

`GH_TOKEN` 需要 GitHub 仓库 `Contents: Read and write` 权限。

---

## 四、配置网页使用 Worker

打开：

```text
js/sync-config.js
```

把里面的：

```js
workerUrl: ''
```

改成你的 Worker 地址，例如：

```js
workerUrl: 'https://alipay-cashbook-sync.xxx.workers.dev'
```

然后上传覆盖 GitHub。

如果不想改文件，也可以在网页里的“Cloudflare Worker 同步”里填 Worker URL 并保存，但这样只会保存在当前浏览器。

---

## 五、使用流程

```text
打开网页
        ↓
自动通过 Worker 读取 GitHub data.json
        ↓
导入支付宝 CSV / Excel
        ↓
如果勾选“导入时覆盖现有数据”，则覆盖整个 data.json
        ↓
Worker 自动提交 data.json 到 GitHub
        ↓
其他设备刷新网页后自动读取最新数据
```

---

## 缓存提醒

上传新版本后，如果页面还是旧版：

```text
电脑：Ctrl + F5
手机 Safari 主屏幕 App：删除图标后重新添加
```

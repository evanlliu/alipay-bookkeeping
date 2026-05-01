# 支付宝记账本支出看板 V17 - 页面同步设置版

## 这版解决什么问题

V17 把 Cloudflare Worker 同步配置做成了页面弹窗：

```text
同步设置
Cloudflare Worker API 地址
访问密码
```

保存后，配置会写入仓库根目录的 `data.json`：

```json
{
  "sync": {
    "provider": "cloudflare-worker",
    "workerUrl": "https://your-worker.workers.dev/data",
    "accessPassword": "你的访问密码"
  },
  "records": []
}
```

任意设备只要打开同一个 GitHub Pages 地址，就会先读取 `data.json` 里的同步配置，然后自动通过 Worker 读取最新数据。

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
2. 进入 Workers & Pages
3. Create Worker
4. 把本项目里的 `cloudflare-worker.js` 内容复制进去
5. Deploy

---

## 三、设置 Worker 环境变量

在 Cloudflare Worker 的 Settings / Variables 里添加：

```text
GH_TOKEN         你的 GitHub Token
GH_OWNER         evanlliu
GH_REPO          alipay-bookkeeping
GH_BRANCH        main
DATA_PATH        data.json
ACCESS_PASSWORD  访问密码，可选，但建议设置
```

`GH_TOKEN` 需要 GitHub 仓库 `Contents: Read and write` 权限。

如果设置了 `ACCESS_PASSWORD`，页面同步设置里的“访问密码”必须和这里一样。

---

## 四、在页面保存同步设置

打开 GitHub Pages 网站后：

```text
点击“同步设置”
        ↓
输入 Cloudflare Worker API 地址
        ↓
输入访问密码
        ↓
保存同步设置
```

保存成功后，Worker 会把这些配置写入 `data.json`。以后其他设备打开页面，会自动读取这些配置。

---

## 五、使用流程

```text
打开网页
        ↓
自动读取 data.json 里的同步配置
        ↓
自动通过 Worker 读取 GitHub data.json
        ↓
导入支付宝 CSV / Excel
        ↓
勾选“导入时覆盖现有数据”则覆盖整个 data.json
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


## V17 修复

- 修复 GitHub Pages 请求 Cloudflare Worker 时可能出现的 `Failed to fetch` / CORS 预检失败。
- Worker 同时支持 `/`、`/data`、`/health` 路径。
- 请把 `cloudflare-worker.js` 的代码复制到 Cloudflare Worker，并点击 Deploy。


## V18 更新

- 修复移动端 iPhone/PWA 顶部状态栏安全区不兼容问题。
- 优化移动端明细记录卡片布局，金额固定在右侧，不再被备注内容挤压换行。
- 长备注、账户、来源、标签自动截断或换行，避免卡片横向溢出。

## V19 更新：退款冲减支出

支付宝记账本中，退款通常记录为：`分类 = 退款` 且 `收支类型 = 不计收支`。V19 开始，总支出卡片改为“净支出”：

```text
净支出 = 原始支出合计 - 退款合计
```

例如 2026-04：原始支出 5,591.17，退款 1,281.79，净支出 4,309.38。

注意：不会用“备注包含退货/退款”作为冲减规则，避免把“淘宝退货-寄件费”等真实成本误扣掉。

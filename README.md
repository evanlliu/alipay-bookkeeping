# Alipay Cashbook Dashboard V14

静态 GitHub Pages 记账看板，数据以根目录 `data.json` 为准。

## V14 重点

- 页面打开时自动读取 `data.json`
- 导入 CSV / XLS / XLSX 后自动通过 GitHub API 覆盖仓库根目录的 `data.json`
- 勾选“导入时覆盖现有数据”后，会用本次导入数据覆盖整个 `data.json.records`
- GitHub Token 输入后，点击“保存同步设置”，会直接写入 `data.json.github.token`
- 其他设备打开同一个 GitHub Pages 地址，会自动从 `data.json` 读取 Token 和账本数据

## data.json 结构

```json
{
  "app": "alipay-cashbook-dashboard",
  "version": 14,
  "updatedAt": "",
  "github": {
    "owner": "evanlliu",
    "repo": "alipay-bookkeeping",
    "branch": "main",
    "token": ""
  },
  "total": 0,
  "records": []
}
```

## 使用方式

1. 部署到 GitHub Pages。
2. 打开页面，展开“GitHub 同步”。
3. 输入 GitHub Token。
4. 点击“保存同步设置”，Token 会写入 `data.json`。
5. 导入支付宝记账本 CSV / Excel。
6. 页面会自动提交更新后的 `data.json` 到 GitHub。
7. 其他手机或电脑打开网站，会自动加载最新 `data.json`。

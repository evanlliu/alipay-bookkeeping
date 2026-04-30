# Alipay Cashbook Dashboard V13

静态 GitHub Pages 记账看板。

## V13 重点

- 页面数据只从根目录 `data.json` 自动加载。
- 第一次在页面里填写 GitHub Token 并保存。
- 之后导入 CSV / XLS / XLSX 时，会自动调用 GitHub API 覆盖仓库根目录的 `data.json`。
- 其他手机/电脑打开同一个 GitHub Pages 地址，会自动读取最新 `data.json`。

## 使用流程

1. 上传本项目全部文件到 GitHub 仓库根目录。
2. 打开 GitHub Pages。
3. 在“GitHub 同步”里确认 Owner / Repository / Branch，粘贴 Token，点保存。
4. 导入支付宝记账本文件。
5. 勾选“导入时覆盖现有数据”时，会覆盖整个 `data.json`。

## Token 权限

使用 Fine-grained personal access token，选择当前仓库，给 Contents: Read and write 权限。

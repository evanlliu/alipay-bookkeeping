# 支付宝记账本支出看板

这是一个纯前端静态项目，可以直接部署到 GitHub Pages。

## 功能

- 导入支付宝记账本导出的 CSV / XLS / XLSX
- 按你的模板识别字段：
  - 记录时间
  - 分类
  - 收支类型
  - 金额
  - 备注
  - 账户
  - 来源
  - 标签
- 导入时自动生成中文 / 英文 / 土耳其语显示字段
- 支持移动端和 PC 端
- 支持按月查看支出
- 支持按年查看支出
- 支持分类、收支类型、标签、搜索筛选
- 支持本地备份和恢复
- 支持 Safari 添加到主屏幕后以独立 App 形式打开

## 使用方法

1. 打开 `index.html`
2. 点击“选择文件导入”
3. 选择支付宝导出的记账本 CSV / Excel
4. 页面会自动生成支出看板

## 部署到 GitHub Pages

1. 新建一个 GitHub 仓库，例如：`cashbook-dashboard`
2. 把本项目所有文件上传到仓库根目录
3. 打开仓库 `Settings`
4. 找到 `Pages`
5. Source 选择：
   - `Deploy from a branch`
   - Branch 选择 `main`
   - Folder 选择 `/root`
6. 保存后等待 GitHub 生成访问地址

## 重要说明

这个项目没有服务器。你的记账数据只保存在当前浏览器的 `localStorage` 里，不会上传到 GitHub，也不会上传到任何服务器。

所以：

- 换手机 / 换浏览器后，看不到之前导入的数据
- 清空浏览器缓存可能会删除数据
- 建议定期点击“备份”，保存 JSON 文件
- 需要恢复时点击“恢复”，选择之前备份的 JSON

## 翻译说明

支付宝导出的中文字段会在导入时根据本地字典自动转换为英文和土耳其语。

当前已经覆盖：

- 分类
- 收支类型
- 账户
- 来源
- 常见备注关键词

如果后续你有新的分类或备注，需要补充翻译，可以修改：

```text
js/i18n.js
```

重点修改里面的：

```text
DATA.category
DATA.type
DATA.account
DATA.source
DATA.words
```

## 文件结构

```text
cashbook-dashboard/
├── index.html
├── manifest.json
├── service-worker.js
├── css/
│   └── style.css
├── js/
│   ├── i18n.js
│   ├── storage.js
│   ├── import.js
│   └── app.js
└── assets/
    ├── icon-192.png
    └── icon-512.png
```

## 注意

页面使用 CDN 加载：

- jQuery
- SheetJS

如果你的网络环境无法访问 CDN，需要把这两个库下载到本地 `lib/` 目录，然后修改 `index.html` 里的 `<script>` 地址。

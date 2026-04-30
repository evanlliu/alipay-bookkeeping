# 支付宝记账本支出看板 V10

## V10 更新

- 项目根目录新增 `data.json`。
- 页面打开时会自动读取 GitHub Pages 上的 `data.json`。
- 如果本机没有本地数据，会自动用 `data.json` 里的记录生成看板。
- 导入 CSV / Excel 后，可以点击“生成 data.json”下载新的 `data.json`。
- 把下载的 `data.json` 上传覆盖到 GitHub 仓库根目录后，多台设备访问同一个 GitHub Pages 地址即可读取同一份数据。

## data.json 多设备同步用法

1. 在电脑端导入支付宝记账本 CSV / Excel。
2. 点击“生成 data.json”。
3. GitHub 仓库根目录上传并覆盖 `data.json`。
4. 等 GitHub Pages 更新 1-2 分钟。
5. 手机、电脑、平板打开同一个 GitHub Pages 地址。
6. 没有本地数据的设备会自动读取 `data.json`；已有旧本地数据的设备可以点击“读取 data.json”强制同步。

> 重要说明：GitHub Pages 是纯静态网站，浏览器不能直接把数据写回 GitHub 仓库文件。所以目前的同步方式是“下载 data.json → 上传覆盖到 GitHub”。如果以后要完全自动同步，需要再接 GitHub API、后端服务或数据库。

---

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

这个项目没有后端服务器。你的记账数据默认保存在当前浏览器的 `localStorage` 里。

如果你希望多台设备共用同一份数据，可以使用 V10 的 `data.json` 同步方式：

- 点击“生成 data.json”下载数据文件
- 把 `data.json` 上传覆盖到 GitHub 仓库根目录
- 其他设备打开 GitHub Pages 后读取同一份 `data.json`

注意：纯 GitHub Pages 不能自动把浏览器里的新数据写回 GitHub 仓库，仍然需要手动上传覆盖 `data.json`。

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
├── data.json
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


## V2 Bugfix

本版本基于 `alipay_cashbook_dashboard_v2_github` 修复：PC 端不再显示移动端明细卡片，移动端不再显示 PC 表格。修复原因是旧版 JS 使用 `.toggle()` 给移动端容器写入了内联 `display:block`，覆盖了 CSS 媒体查询。


## V2 PC/移动端显示修复

本版本基于 V2，只修复明细区域显示问题：PC 端只显示表格，移动端只显示卡片，避免两个版本同时出现。


## V8 更新

- 分类支出支持点击查看明细。
- 标签支出支持点击查看明细。
- 点击同一个分类/标签可取消该筛选。
- 明细记录上方会显示当前分类/标签筛选条件，并提供“清除筛选”。
- PC 端和移动端都生效。

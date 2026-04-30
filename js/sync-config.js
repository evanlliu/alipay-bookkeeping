// V16 Cloudflare Worker sync config
// 通常不需要在这里写死地址；页面里的“同步设置”保存后，会把 Worker URL 和访问密码写入 data.json。
// 只有在 data.json 还没有配置时，才会使用这里的默认值。
window.CASHBOOK_SYNC_CONFIG = {
  workerUrl: '',
  accessPassword: ''
};

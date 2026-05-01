/**
 * Alipay Cashbook Dashboard - Cloudflare Worker Sync API V17
 *
 * 环境变量（Cloudflare Worker Settings -> Variables）：
 * GH_TOKEN  必填：GitHub fine-grained token，需要 Contents: Read and write
 * GH_OWNER  必填：例如 evanlliu
 * GH_REPO   必填：例如 alipay-bookkeeping
 * GH_BRANCH 可选：默认 main
 * DATA_PATH 可选：默认 data.json
 * ACCESS_PASSWORD 可选：访问密码；如果设置，前端请求必须带 X-Access-Password
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Access-Password, Authorization, Accept',
  'Access-Control-Max-Age': '86400'
};

function withCors(headers = {}) {
  return { ...CORS_HEADERS, ...headers };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: withCors({
      'Content-Type': 'application/json;charset=utf-8',
      'Cache-Control': 'no-store'
    })
  });
}

function verifyAccessPassword(request, env) {
  const expected = env.ACCESS_PASSWORD || '';
  if (!expected) return;
  const provided = request.headers.get('X-Access-Password') || '';
  if (provided !== expected) {
    const err = new Error('Invalid access password');
    err.status = 401;
    throw err;
  }
}

function requireEnv(env, name) {
  const value = env[name];
  if (!value) throw new Error(`Missing Worker environment variable: ${name}`);
  return value;
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToUtf8(base64) {
  const clean = String(base64 || '').replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function githubRequest(env, path, options = {}) {
  const token = requireEnv(env, 'GH_TOKEN');
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'alipay-cashbook-dashboard-worker',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch (e) { body = { message: text }; }
  }

  if (!response.ok) {
    const message = body && body.message ? body.message : `GitHub API ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.body = body;
    throw err;
  }

  return body;
}

function getRepoConfig(env) {
  return {
    owner: requireEnv(env, 'GH_OWNER'),
    repo: requireEnv(env, 'GH_REPO'),
    branch: env.GH_BRANCH || 'main',
    dataPath: env.DATA_PATH || 'data.json'
  };
}

async function readDataJson(env) {
  const { owner, repo, branch, dataPath } = getRepoConfig(env);
  const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(dataPath)}?ref=${encodeURIComponent(branch)}`;
  const res = await githubRequest(env, path);
  const content = res && res.content ? base64ToUtf8(res.content) : '{}';
  let payload = {};
  try { payload = JSON.parse(content); } catch (e) { payload = {}; }

  if (!Array.isArray(payload.records)) payload.records = [];
  payload.total = payload.records.length;
  payload.githubSha = res.sha;
  return payload;
}

async function writeDataJson(env, payload) {
  const { owner, repo, branch, dataPath } = getRepoConfig(env);
  const records = Array.isArray(payload.records) ? payload.records : [];
  const incomingSync = payload && payload.sync && typeof payload.sync === 'object' ? payload.sync : {};
  const nextPayload = {
    app: 'alipay-cashbook-dashboard',
    version: 17,
    updatedAt: new Date().toISOString(),
    sync: {
      provider: 'cloudflare-worker',
      workerUrl: incomingSync.workerUrl || '',
      accessPassword: incomingSync.accessPassword || ''
    },
    total: records.length,
    records
  };

  let sha = '';
  try {
    const current = await readDataJson(env);
    sha = current.githubSha || '';
  } catch (err) {
    if (err.status !== 404) throw err;
  }

  const body = {
    message: `Update data.json from cashbook dashboard ${new Date().toISOString()}`,
    content: utf8ToBase64(JSON.stringify(nextPayload, null, 2)),
    branch
  };
  if (sha) body.sha = sha;

  const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(dataPath)}`;
  const res = await githubRequest(env, path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  return {
    ok: true,
    total: records.length,
    updatedAt: nextPayload.updatedAt,
    commit: res.commit ? { sha: res.commit.sha, html_url: res.commit.html_url } : null
  };
}

function routeName(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  return path;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      const path = routeName(request);

      if (path === '/health') {
        return jsonResponse({ ok: true, service: 'alipay-cashbook-worker', version: 17 });
      }

      // 允许根路径和 /data，都按同一个 data.json API 处理，避免 URL 填写差异导致失败。
      if (path !== '/' && path !== '/data') {
        return jsonResponse({ error: 'Not found', path }, 404);
      }

      verifyAccessPassword(request, env);

      if (request.method === 'GET' || request.method === 'HEAD') {
        const payload = await readDataJson(env);
        delete payload.githubSha;
        if (request.method === 'HEAD') {
          return new Response(null, { status: 200, headers: withCors({ 'Cache-Control': 'no-store' }) });
        }
        return jsonResponse(payload);
      }

      if (request.method === 'POST' || request.method === 'PUT') {
        const payload = await request.json();
        const result = await writeDataJson(env, payload);
        return jsonResponse(result);
      }

      return jsonResponse({ error: 'Method not allowed' }, 405);
    } catch (err) {
      return jsonResponse({
        error: 'Worker request failed',
        message: err.message || String(err),
        status: err.status || 500,
        detail: err.body || null
      }, err.status || 500);
    }
  }
};

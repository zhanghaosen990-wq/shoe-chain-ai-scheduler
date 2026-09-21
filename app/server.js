const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
// 只在服务端读取 .env；密钥绝不会发送给网页浏览器。
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  });
}
const { runAgent, generateInquiryMessages, data: agentData } = require('./agent');
const { createStore } = require('./portal-store');
const { parseFactory } = require('./factory-import');
const portalStore = createStore(process.env.PORTAL_STATE_FILE || path.join(root, 'data/portal-state.json'));
function syncFactories() {
  agentData.factories = portalStore.snapshot().factories.map(f => {
    let booked = f.analytics.booked;
    const capacity = Array.from({ length: 10 }, () => { const used = Math.min(booked, f.dailyCapacity); booked -= used; return f.dailyCapacity - used; });
    return { ...f, name: `${f.name}（模拟）`, available_capacity_by_day: capacity };
  });
}
syncFactories();
const { toAgentOrder } = require('./payload');
const { parseBomWithDeepSeek, parseMultipartFile } = require('./deepseek-bom');
// 该项目当前优先使用 DeepSeek；未来要改用 OpenAI 时，在 .env 显式填写 AI_PROVIDER=openai。
const provider = process.env.AI_PROVIDER || 'deepseek';
// 不在供应商之间复用密钥，避免把 OpenAI 密钥误发送到 DeepSeek。
const apiKey = provider === 'deepseek' ? process.env.DEEPSEEK_API_KEY : process.env.OPENAI_API_KEY;
const model = process.env.AI_MODEL || (provider === 'deepseek' ? 'deepseek-chat' : 'gpt-5.6-luna');

const reviewAnalyzer = require('./review-analysis').createReviewAnalyzer(portalStore,{provider,apiKey,model});

const contentTypes = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8'};

const port = Number(process.env.PORT) || 4173;
const maxBodySize = 32 * 1024 * 1024;

function collectBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBodySize) {
        const error = new Error('上传文件过大，请控制在 32MB 以内。');
        error.statusCode = 413;
        reject(error);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'}).end(JSON.stringify(payload));
}

http.createServer(async (request, response) => {
  const urlPath = new URL(request.url, 'http://localhost').pathname;
  if (urlPath.startsWith('/api/portal')) {
    try {
      if (request.method === 'GET' && urlPath === '/api/portal') return sendJson(response, 200, portalStore.snapshot());
      if (request.method !== 'POST') return sendJson(response, 405, { error: '不支持的请求。' });
      const actor = request.headers['x-account-id'];
      if (urlPath === '/api/portal/profile') {
        const input = JSON.parse((await collectBody(request)).toString('utf8'));
        if (input.id !== actor) throw new Error('账号与企业资料不匹配');
        const result = portalStore.syncProfile(input); syncFactories(); return sendJson(response, 200, result);
      }
      if (!portalStore.account(actor)) return sendJson(response, 401, { error: '请先登录账号。' });
      if (urlPath === '/api/portal/factory-import') {
        if (portalStore.account(actor).role !== 'factory') return sendJson(response, 403, { error: '仅工厂账号可识别入驻资料。' });
        const file = parseMultipartFile(await collectBody(request), request.headers['content-type']);
        return sendJson(response, 200, await parseFactory(file, process.env.DEEPSEEK_API_KEY));
      }
      const input = JSON.parse((await collectBody(request)).toString('utf8'));
      let result;
      if (urlPath === '/api/portal/factory') result = portalStore.updateFactory(actor, input);
      else if (urlPath === '/api/portal/orders') result = portalStore.createOrders(actor, input);
      else if (urlPath === '/api/portal/order-status') result = portalStore.transition(actor, input.orderId, input.status, input);
      else if (urlPath === '/api/portal/reviews') {
        result = portalStore.review(actor, input);
        const review = result.reviews.find(r=>r.orderId===input.orderId && r.brandId===actor);
        reviewAnalyzer.enqueue(actor,review.id);
        result = portalStore.snapshot();
      } else if (/^\/api\/portal\/reviews\/[^/]+\/analyze$/.test(urlPath)) {
        reviewAnalyzer.enqueue(actor,decodeURIComponent(urlPath.split('/')[4]));
        result = portalStore.snapshot();
      }
      else return sendJson(response, 404, { error: '接口不存在。' });
      syncFactories();
      return sendJson(response, 200, result);
    } catch (error) { return sendJson(response, 400, { error: error.message || '操作失败。' }); }
  }
  if (request.method === 'GET' && urlPath === '/data/demo_data.json') return sendJson(response, 200, agentData);
  if (request.method === 'GET' && request.url === '/api/status') {
    response.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'}).end(JSON.stringify({
      configured: Boolean(apiKey),
      provider,
      model,
      endpoints: { bomParse: '/api/bom/parse' },
      integrations: { deepseek: Boolean(apiKey) }
    }));
    return;
  }
  if (request.method === 'POST' && request.url === '/api/bom/parse') {
    try {
      const body = await collectBody(request);
      const file = parseMultipartFile(body, request.headers['content-type']);
      const bomData = await parseBomWithDeepSeek(file, apiKey);
      sendJson(response, 200, { bom_data: bomData });
    } catch (error) {
      const status = error.statusCode || (error.message?.startsWith('DeepSeek') || error.message?.startsWith('未检测到 DEEPSEEK_API_KEY') ? 502 : 400);
      sendJson(response, status, { error: error.message || 'BOM 识别失败，请重新上传或手动填写。' });
    }
    return;
  }
  if (request.method === 'POST' && request.url === '/api/agent') {
    try {
      const payload = JSON.parse((await collectBody(request)).toString('utf8'));
      const demand = require('./order-contract').normalizeDemand(payload);
      const order = { ...toAgentOrder(demand), bom_data: demand.bom_data, production_requirements: demand.production_requirements };
      syncFactories();
      const result = await runAgent(order, { provider, apiKey, model });
      return sendJson(response, 200, result);
    } catch (error) { return sendJson(response, 400, { error: error.message || '需求分析失败' }); }
  }
  if (request.method === 'POST' && request.url === '/api/inquiry') {
    let body = '';
    request.on('data', (chunk) => { body += chunk; if (body.length > 100000) request.destroy(); });
    request.on('end', async () => {
      try {
        if (!apiKey) throw new Error('未检测到 API 密钥。请检查项目根目录的 .env 文件。');
        const payload = JSON.parse(body);
        const result = await generateInquiryMessages(payload.order || {}, payload.allocations, { provider, apiKey, model });
        response.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'}).end(JSON.stringify(result));
      } catch (error) {
        response.writeHead(500, {'Content-Type': 'application/json; charset=utf-8'}).end(JSON.stringify({ error: error.message || '询单消息生成失败' }));
      }
    });
    return;
  }
  const portalRoute = urlPath === '/' || urlPath === '/brand' || urlPath === '/factory' || /^\/profile\/[^/]+$/.test(urlPath);
  const cleanPath = portalRoute ? '/app/portal/index.html' : urlPath === '/workspace' ? '/app/index.html' : urlPath;
  const publicAsset = /^\/app\/(?:portal\/(?:index.html|dist\/(?:main.js|main.css))|index.html|styles.css|app.js|payload.js|interaction-state.js|presentation.js|bom-linkage.js)$/.test(cleanPath);
  if (!publicAsset) { response.writeHead(404).end('Not found'); return; }
  const filename = path.resolve(root, `.${cleanPath}`);
  if (!filename.startsWith(root)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filename, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Not found');
      return;
    }
    response.writeHead(200, {'Content-Type': contentTypes[path.extname(filename)] || 'application/octet-stream'});
    response.end(content);
  });
}).listen(port, () => console.log(`鞋链智排原型运行于 http://localhost:${port}`));

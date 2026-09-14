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
const { runAgent, generateInquiryMessages } = require('./agent');
// 该项目当前优先使用 DeepSeek；未来要改用 OpenAI 时，在 .env 显式填写 AI_PROVIDER=openai。
const provider = process.env.AI_PROVIDER || 'deepseek';
// 不在供应商之间复用密钥，避免把 OpenAI 密钥误发送到 DeepSeek。
const apiKey = provider === 'deepseek' ? process.env.DEEPSEEK_API_KEY : process.env.OPENAI_API_KEY;
const model = process.env.AI_MODEL || (provider === 'deepseek' ? 'deepseek-chat' : 'gpt-5.6-luna');

const contentTypes = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8'};

const port = Number(process.env.PORT) || 4173;

http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/api/status') {
    response.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'}).end(JSON.stringify({ configured: Boolean(apiKey), provider, model }));
    return;
  }
  if (request.method === 'POST' && request.url === '/api/agent') {
    let body = '';
    request.on('data', (chunk) => { body += chunk; if (body.length > 100000) request.destroy(); });
    request.on('end', async () => {
      try {
        if (!apiKey) throw new Error('未检测到 API 密钥。请检查项目根目录的 .env 文件。');
        const result = await runAgent(JSON.parse(body), { provider, apiKey, model });
        response.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'}).end(JSON.stringify(result));
      } catch (error) {
        response.writeHead(500, {'Content-Type': 'application/json; charset=utf-8'}).end(JSON.stringify({ error: error.message || 'Agent 服务异常' }));
      }
    });
    return;
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
  const cleanPath = request.url === '/' ? '/app/index.html' : request.url.split('?')[0];
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

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('mainland demo deployment builds the app and keeps portal state on a volume', () => {
  const dockerfile = read('Dockerfile');
  const compose = read('deploy/docker-compose.yml');
  const caddyfile = read('deploy/Caddyfile');

  assert.match(dockerfile, /npm ci/);
  assert.match(dockerfile, /npm run build/);
  assert.match(dockerfile, /PORTAL_STATE_FILE=\/app\/data\/portal-state\.json/);
  assert.match(dockerfile, /api\/status/);
  assert.match(compose, /portal_data:/);
  assert.match(compose, /PORTAL_STATE_FILE: \/app\/data\/portal-state\.json/);
  assert.match(compose, /80:80/);
  assert.match(compose, /443:443/);
  assert.match(caddyfile, /reverse_proxy app:4173/);
  assert.match(caddyfile, /max_size 32MB/);
});

test('deployment instructions explicitly cover domestic public access and collaboration roles', () => {
  const guide = read('docs/deployment-mainland-demo.md');
  const contributing = read('CONTRIBUTING.md');

  assert.match(guide, /中国大陆/);
  assert.match(guide, /TCP `80`/);
  assert.match(guide, /`443`/);
  assert.match(guide, /docker compose/);
  assert.match(guide, /DOMAIN/);
  assert.match(contributing, /前端同事/);
  assert.match(contributing, /后端负责人/);
  assert.match(contributing, /main/);
});

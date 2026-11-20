const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = 5099;
const API_KEY = 'frictionflow-smoke-test-key';
const DB_PATH = path.join(os.tmpdir(), `frictionflow-smoke-${process.pid}.db`);
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

const server = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DB_PATH, API_KEY, NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let ready = false;
server.stdout.on('data', (chunk) => {
  const output = chunk.toString();
  process.stdout.write(output);
  if (!ready && output.includes('Backend running')) ready = true;
});
server.stderr.on('data', (chunk) => process.stderr.write(chunk.toString()));

function request(method, route, body, authenticated = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (authenticated) headers['X-API-Key'] = API_KEY;
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  return fetch(`http://127.0.0.1:${PORT}${route}`, options).then(async (response) => ({
    status: response.status,
    json: await response.json().catch(() => null),
  }));
}

async function main() {
  const deadline = Date.now() + 10000;
  while (!ready && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
  if (!ready) throw new Error('Server did not start');

  const health = await request('GET', '/health');
  if (health.status !== 200 || health.json.status !== 'healthy') throw new Error('Health check failed');

  const unauthorized = await request('GET', '/api/analytics', null, false);
  if (unauthorized.status !== 401) throw new Error('Analytics endpoint did not require an API key');

  const invalid = await request('POST', '/api/analytics', { domain: 'bad domain', action: 'nope', duration: -1 });
  if (invalid.status !== 400) throw new Error('Validation did not reject bad payload');

  const created = await request('POST', '/api/analytics', { domain: 'youtube.com', action: 'bypassed', duration: 30, user_id: 'smoke' });
  if (created.status !== 201 || !created.json.id) throw new Error('Create failed');

  const list = await request('GET', '/api/analytics');
  if (list.status !== 200 || !Array.isArray(list.json) || list.json.length !== 1) throw new Error('List failed');

  const stats = await request('GET', '/api/stats');
  if (stats.status !== 200 || stats.json.total !== 1) throw new Error('Stats failed');

  const notfound = await request('GET', '/does-not-exist');
  if (notfound.status !== 404) throw new Error('404 handling failed');

  console.log('SMOKE TEST PASSED');
}

main()
  .then(() => { server.kill(); if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH); process.exit(0); })
  .catch((error) => {
    console.error('SMOKE TEST FAILED:', error && error.message ? error.message : error);
    server.kill();
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
    process.exit(1);
  });

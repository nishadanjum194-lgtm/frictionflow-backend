const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = 5099;
const DB_PATH = path.join(os.tmpdir(), `frictionflow-smoke-${process.pid}.db`);
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

const server = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, PORT: String(PORT), DB_PATH, NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let ready = false;
server.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);
  if (!ready && text.includes('Backend running')) ready = true;
});
server.stderr.on('data', (chunk) => process.stderr.write(chunk.toString()));

function request(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`http://127.0.0.1:${PORT}${path}`, opts).then(async (res) => ({
    status: res.status,
    json: await res.json().catch(() => null),
  }));
}

async function main() {
  const deadline = Date.now() + 10000;
  while (!ready && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  if (!ready) throw new Error('Server did not start');

  const health = await request('GET', '/health');
  if (health.status !== 200 || health.json.status !== 'healthy') throw new Error('Health check failed');

  const bad = await request('POST', '/api/analytics', { domain: 'bad domain', action: 'nope', duration: -1 });
  if (bad.status !== 400) throw new Error('Validation did not reject bad payload');

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
  .catch((err) => { console.error('SMOKE TEST FAILED:', err && err.message ? err.message : err); server.kill(); if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH); process.exit(1); });
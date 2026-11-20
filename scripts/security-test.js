const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');

const port = 5107;
const database = path.join(os.tmpdir(), 'frictionflow-security-' + process.pid + '.db');
const server = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, PORT: String(port), DB_PATH: database, API_KEY: 'test-secret-key', NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '';
server.stdout.on('data', chunk => { output += chunk.toString(); });
server.stderr.on('data', chunk => { output += chunk.toString(); });

function request(method, route, body, token) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['X-API-Key'] = token;
  return fetch('http://127.0.0.1:' + port + route, {
    method, headers, body: body ? JSON.stringify(body) : undefined
  }).then(async response => ({ status: response.status, json: await response.json().catch(() => null) }));
}

async function main() {
  const deadline = Date.now() + 10000;
  while (!output.includes('Backend running') && Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error('Server exited: ' + output);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.match(output, /Backend running/, 'server starts');
  const health = await request('GET', '/health');
  assert.equal(health.status, 200);
  assert.equal(Object.hasOwn(health.json, 'database'), false, 'health endpoint does not expose filesystem path');

  assert.equal((await request('GET', '/api/analytics')).status, 401, 'analytics list requires key');
  assert.equal((await request('GET', '/api/stats')).status, 401, 'stats requires key');
  assert.equal((await request('POST', '/api/analytics', { domain: 'example.com' })).status, 401, 'analytics writes require key');

  const invalid = await request('POST', '/api/analytics', { domain: 'bad..domain', action: 'bypassed' }, 'test-secret-key');
  assert.equal(invalid.status, 400, 'invalid hostname labels are rejected');

  const created = await request('POST', '/api/analytics', {
    domain: 'example.com', action: 'bypassed', duration: 12
  }, 'test-secret-key');
  assert.equal(created.status, 201, 'valid authenticated event is saved');

  const rows = await request('GET', '/api/analytics', null, 'test-secret-key');
  assert.equal(rows.status, 200);
  assert.equal(rows.json.length, 1);
  console.log('BACKEND SECURITY TESTS PASSED (9 assertions)');
}

main().then(() => server.kill()).catch(error => {
  console.error('BACKEND SECURITY TESTS FAILED:', error);
  server.kill();
  process.exitCode = 1;
}).finally(() => {
  setTimeout(() => {
    for (const suffix of ['', '-journal', '-shm', '-wal']) {
      try { fs.unlinkSync(database + suffix); } catch {}
    }
  }, 100);
});

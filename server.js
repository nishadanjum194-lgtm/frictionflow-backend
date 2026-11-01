require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = Number(process.env.PORT) || 5001;
const HOST = process.env.HOST || '0.0.0.0';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'frictionflow.db');
const API_KEY = process.env.API_KEY || '';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const ANALYTICS_MAX_LIMIT = 200;

app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',') }));
app.use(express.json({ limit: '16kb' }));

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exitCode = 1;
  } else {
    console.log('Connected to SQLite database at', DB_PATH);
  }
});

// Schema (idempotent; also migrates older installs that lack the extra columns).
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL,
    action TEXT NOT NULL,
    duration INTEGER NOT NULL DEFAULT 0,
    user_id TEXT,
    occurred_at INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  for (const stmt of [
    `ALTER TABLE analytics ADD COLUMN user_id TEXT`,
    `ALTER TABLE analytics ADD COLUMN occurred_at INTEGER`,
  ]) {
    db.run(stmt, (err) => {
      if (err && !/duplicate column name/i.test(err.message)) {
        console.warn('Migration warning:', err.message);
      }
    });
  }
  db.run(`CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics(timestamp DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_analytics_domain ON analytics(domain)`);
});

const ALLOWED_ACTIONS = new Set(['bypassed', 'abandoned', 'blocked']);

function requireApiKey(req, res, next) {
  if (!API_KEY) return next();
  const provided = req.get('x-api-key') || (typeof req.query.api_key === 'string' ? req.query.api_key : '');
  if (provided !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: missing or invalid API key.' });
  }
  next();
}

function validateAnalytics(body) {
  const errors = [];
  if (!body || typeof body !== 'object') return { ok: false, errors: ['Request body must be a JSON object.'] };

  const domain = String(body.domain || '').trim().toLowerCase();
  if (!domain || domain.length > 253) errors.push('domain is required and must be <= 253 characters.');
  if (!/^[a-z0-9.-]+$/.test(domain)) errors.push('domain contains invalid characters.');

  const action = String(body.action || 'bypassed').trim().toLowerCase();
  if (!ALLOWED_ACTIONS.has(action)) errors.push(`action must be one of: ${[...ALLOWED_ACTIONS].join(', ')}.`);

  const duration = Number.isFinite(Number(body.duration)) ? Math.trunc(Number(body.duration)) : 0;
  if (duration < 0 || duration > 86400) errors.push('duration must be between 0 and 86400 seconds.');

  const userId = body.user_id == null ? null : String(body.user_id).trim().slice(0, 128);
  const occurredAtRaw = body.occurred_at == null ? null : Number(body.occurred_at);
  const occurredAt = Number.isFinite(occurredAtRaw) ? Math.trunc(occurredAtRaw) : null;

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { domain, action, duration, userId, occurredAt } };
}

app.get('/health', (_req, res) => {
  db.get('SELECT COUNT(*) AS count FROM analytics', [], (err, row) => {
    if (err) return res.status(500).json({ status: 'unhealthy', error: err.message });
    res.json({
      status: 'healthy',
      service: 'frictionflow-backend',
      database: DB_PATH,
      analyticsCount: row ? row.count : 0,
      time: new Date().toISOString(),
    });
  });
});

app.post('/api/analytics', requireApiKey, (req, res) => {
  const result = validateAnalytics(req.body);
  if (!result.ok) return res.status(400).json({ error: 'Validation failed.', details: result.errors });

  const { domain, action, duration, userId, occurredAt } = result.value;
  db.run(
    `INSERT INTO analytics (domain, action, duration, user_id, occurred_at)
     VALUES (?, ?, ?, ?, ?)`,
    [domain, action, duration, userId, occurredAt],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ success: true, id: this.lastID });
    }
  );
});

app.get('/api/analytics', (req, res) => {
  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(ANALYTICS_MAX_LIMIT, Math.max(1, Math.trunc(rawLimit)))
    : 50;
  const rawOffset = Number(req.query.offset);
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.trunc(rawOffset)) : 0;

  db.all(
    `SELECT id, domain, action, duration, user_id, occurred_at, timestamp
     FROM analytics
     ORDER BY timestamp DESC, id DESC
     LIMIT ? OFFSET ?`,
    [limit, offset],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.get('/api/stats', (_req, res) => {
  const sql = `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN action = 'bypassed' THEN 1 ELSE 0 END) AS bypassed,
      SUM(CASE WHEN action = 'abandoned' THEN 1 ELSE 0 END) AS abandoned,
      ROUND(AVG(duration), 2) AS avgDurationSeconds
    FROM analytics
  `;
  db.get(sql, [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || { total: 0, bypassed: 0, abandoned: 0, avgDurationSeconds: 0 });
  });
});

app.use(express.static(path.join(__dirname, 'public')));

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Backend running on http://${HOST}:${PORT}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}; shutting down gracefully.`);
  server.close(() => {
    db.close(() => process.exit(0));
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { isValidDomain } = require('./lib/domain');

const app = express();
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = Number(process.env.PORT) || 5001;
const HOST = process.env.HOST || '127.0.0.1';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'frictionflow.db');
const API_KEY = process.env.API_KEY || '';
const CORS_ORIGINS = (process.env.CORS_ORIGIN || '').split(',').map((v) => v.trim()).filter(Boolean);
const ANALYTICS_MAX_LIMIT = 200;

if (NODE_ENV === 'production' && !API_KEY) {
  throw new Error('API_KEY must be configured in production.');
}
if (NODE_ENV === 'production' && CORS_ORIGINS.includes('*')) {
  throw new Error('CORS_ORIGIN must not be "*" in production. Use explicit origins.');
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const browserExtensionOrigin = /^chrome-extension:\/\/[a-p]{32}$/.test(origin) || origin.startsWith('moz-extension://');
    const explicitlyAllowed = CORS_ORIGINS.includes(origin);
    const developmentWildcard = NODE_ENV !== 'production' && CORS_ORIGINS.includes('*');
    return callback(null, browserExtensionOrigin || explicitlyAllowed || developmentWildcard);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-API-Key'],
  maxAge: 600,
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '16kb', strict: true }));

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exitCode = 1;
  } else {
    console.log('Connected to SQLite database.');
  }
});

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
  // Local development may intentionally run without an API key. Production fails closed above.
  if (!API_KEY && NODE_ENV !== 'production') return next();
  const provided = req.get('x-api-key') || '';
  const providedBuffer = Buffer.from(provided, 'utf8');
  const expectedBuffer = Buffer.from(API_KEY, 'utf8');
  const valid = providedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, expectedBuffer);

  if (!valid) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  next();
}

function validateAnalytics(body) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errors: ['Request body must be a JSON object.'] };
  }

  const domain = typeof body.domain === 'string' ? body.domain.trim().toLowerCase() : '';
  if (!isValidDomain(domain)) errors.push('domain must be a valid hostname.');

  const action = String(body.action || 'bypassed').trim().toLowerCase();
  if (!ALLOWED_ACTIONS.has(action)) errors.push('action must be bypassed, abandoned, or blocked.');

  const durationNumber = body.duration == null ? 0 : Number(body.duration);
  const duration = Number.isFinite(durationNumber) ? Math.trunc(durationNumber) : -1;
  if (duration < 0 || duration > 86400) errors.push('duration must be between 0 and 86400 seconds.');

  const userId = body.user_id == null ? null : String(body.user_id).trim().slice(0, 128);
  const occurredAtRaw = body.occurred_at == null ? null : Number(body.occurred_at);
  const occurredAt = occurredAtRaw == null ? null : Math.trunc(occurredAtRaw);
  if (occurredAtRaw != null && (!Number.isFinite(occurredAtRaw) || occurredAtRaw < 0 || occurredAtRaw > 8640000000000000)) {
    errors.push('occurred_at must be a valid Unix timestamp in milliseconds.');
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { domain, action, duration, userId, occurredAt } };
}

app.get('/health', (_req, res) => {
  db.get('SELECT COUNT(*) AS count FROM analytics', [], (err, row) => {
    if (err) {
      console.error('Health database check failed:', err.message);
      return res.status(503).json({ status: 'unhealthy' });
    }
    res.json({
      status: 'healthy',
      service: 'frictionflow-backend',
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
      if (err) {
        console.error('Analytics insert failed:', err.message);
        return res.status(500).json({ error: 'Could not save analytics event.' });
      }
      res.status(201).json({ success: true, id: this.lastID });
    }
  );
});

app.get('/api/analytics', requireApiKey, (req, res) => {
  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(ANALYTICS_MAX_LIMIT, Math.max(1, Math.trunc(rawLimit)))
    : 50;
  const rawOffset = Number(req.query.offset);
  const offset = Number.isFinite(rawOffset) ? Math.min(1000000, Math.max(0, Math.trunc(rawOffset))) : 0;

  db.all(
    `SELECT id, domain, action, duration, user_id, occurred_at, timestamp
     FROM analytics
     ORDER BY timestamp DESC, id DESC
     LIMIT ? OFFSET ?`,
    [limit, offset],
    (err, rows) => {
      if (err) {
        console.error('Analytics query failed:', err.message);
        return res.status(500).json({ error: 'Could not load analytics.' });
      }
      res.json(rows);
    }
  );
});

app.get('/api/stats', requireApiKey, (_req, res) => {
  const sql = `
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN action = 'bypassed' THEN 1 ELSE 0 END), 0) AS bypassed,
      COALESCE(SUM(CASE WHEN action = 'abandoned' THEN 1 ELSE 0 END), 0) AS abandoned,
      COALESCE(ROUND(AVG(duration), 2), 0) AS avgDurationSeconds
    FROM analytics
  `;
  db.get(sql, [], (err, row) => {
    if (err) {
      console.error('Analytics stats query failed:', err.message);
      return res.status(500).json({ error: 'Could not load analytics stats.' });
    }
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

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./frictionflow.db', (err) => {
  if (err) console.error('DB Error:', err.message);
  else console.log('Connected to SQLite database.');
});

db.run(`CREATE TABLE IF NOT EXISTS analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  domain TEXT,
  action TEXT,
  duration INTEGER,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

app.get('/health', (req, res) => res.json({ status: 'healthy' }));

app.post('/api/analytics', (req, res) => {
  const { userId, domain, action, duration } = req.body;
  if (!userId || !domain) return res.status(400).json({ error: 'Missing fields' });

  const stmt = db.prepare(`INSERT INTO analytics (user_id, domain, action, duration) VALUES (?, ?, ?, ?)`);
  stmt.run(userId, domain, action || 'blocked', duration || 0, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, id: this.lastID });
  });
  stmt.finalize();
});

app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
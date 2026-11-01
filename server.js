const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});
app.use(cors());

// Serve static dashboard files from a 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 5001;

// Initialize SQLite database
const db = new sqlite3.Database('./frictionflow.db', (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to SQLite database.');
  }
});

// Create analytics table if it doesn't exist
db.run(`CREATE TABLE IF NOT EXISTS analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT,
  action TEXT,
  duration INTEGER,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// POST: Receive logs from the extension
app.post('/api/analytics', (req, res) => {
  const { domain, action, duration } = req.body;
  
  db.run(
    `INSERT INTO analytics (domain, action, duration) VALUES (?, ?, ?)`,
    [domain, action, duration],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true, id: this.lastID });
    }
  );
});

// GET: Fetch logs for your web dashboard
app.get('/api/analytics', (req, res) => {
  db.all('SELECT * FROM analytics ORDER BY timestamp DESC LIMIT 50', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

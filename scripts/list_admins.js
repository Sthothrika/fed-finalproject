const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'data', 'users.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT id, username, role, created_at FROM users WHERE role = 'admin'", (err, rows) => {
  if (err) {
    console.error('DB_ERROR', err.message || err);
    process.exit(1);
  }
  if (!rows || rows.length === 0) {
    console.log('NO_ADMIN_ROWS');
  } else {
    console.log(JSON.stringify(rows, null, 2));
  }
  db.close();
});

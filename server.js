require('dotenv').config();
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'resources.json');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');
app.use(session({
  secret: process.env.SESSION_SECRET || 'stuhealth_secret_dev',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 4 }
}));

// Expose session to views
app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

// Initialize SQLite DB for users
const DB_PATH = path.join(__dirname, 'data', 'users.db');
async function initUserDB() {
  await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
  const db = new sqlite3.Database(DB_PATH);
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // If no admin exists and env admin credentials provided, create one
    db.get("SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'", (err, row) => {
      if (err) return console.error('DB error checking admin count', err);
      const cnt = row && row.cnt ? row.cnt : 0;
      const ADMIN_USER = process.env.ADMIN_USER;
      const ADMIN_PASS = process.env.ADMIN_PASS;
      if (cnt === 0 && ADMIN_USER && ADMIN_PASS) {
        bcrypt.hash(ADMIN_PASS, 10, (errHash, hash) => {
          if (errHash) return console.error('Error hashing admin pass', errHash);
          db.run('INSERT OR IGNORE INTO users (username, password, role) VALUES (?,?,?)', [ADMIN_USER, hash, 'admin'], (insErr) => {
            if (insErr) return console.error('Error inserting admin user', insErr);
            console.log('Initial admin user created from .env');
          });
        });
      }
    });
  });
  return db;
}

// Ensure profile columns exist (adds full_name, email, routine columns if missing)
async function ensureProfileColumns() {
  if (!userDbHandle) return;
  userDbHandle.all("PRAGMA table_info('users')", (err, cols) => {
    if (err) return console.error('Error checking user table columns', err);
    const names = (cols || []).map(c => c.name);
    const toAdd = [];
    if (!names.includes('full_name')) toAdd.push("ALTER TABLE users ADD COLUMN full_name TEXT");
    if (!names.includes('email')) toAdd.push("ALTER TABLE users ADD COLUMN email TEXT");
    if (!names.includes('routine')) toAdd.push("ALTER TABLE users ADD COLUMN routine TEXT");
    if (!names.includes('avatar')) toAdd.push("ALTER TABLE users ADD COLUMN avatar TEXT");
    if (!names.includes('phone')) toAdd.push("ALTER TABLE users ADD COLUMN phone TEXT");
    if (!names.includes('programs')) toAdd.push("ALTER TABLE users ADD COLUMN programs TEXT");
    toAdd.forEach(sql => {
      userDbHandle.run(sql, (aErr) => {
        if (aErr) console.error('Error adding column', aErr);
      });
    });
  });
}

let userDbHandle;
initUserDB().then(db => { userDbHandle = db; }).catch(err => console.error('Failed to init user DB', err));
// After DB handle is available, ensure profile columns are present
initUserDB().then(db => { userDbHandle = db; ensureProfileColumns(); }).catch(err => console.error('Failed to init user DB', err));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// Serve static assets from the `public` folder at the site root
app.use(express.static(path.join(__dirname, 'public')));
// Keep legacy mount for `/public/*` paths (some templates may reference it)
app.use('/public', express.static(path.join(__dirname, 'public')));

// Multer setup for avatar uploads (store in public/uploads). If multer isn't installed, fall back
// to a no-op middleware so the rest of the app continues to work.
const uploadsDir = path.join(__dirname, 'public', 'uploads');
let upload = (req, res, next) => next();
try {
  const _multer = require('multer');
  const storage = _multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdir(uploadsDir, { recursive: true }).then(() => cb(null, uploadsDir)).catch(() => cb(null, uploadsDir));
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      const name = `${Date.now()}-${Math.round(Math.random()*1e6)}${ext}`;
      cb(null, name);
    }
  });
  upload = _multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } });
} catch (e) {
  console.warn('multer not installed; avatar upload disabled');
}

async function readData() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return { resources: [] };
  }
}

async function writeData(data) {
  await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Landing (first page) - only login/signup links
// Root now shows the unified auth page as the first page
app.get('/', (req, res) => {
  res.render('auth', { active: 'login', error: null, page: 'auth' });
});

// Unified auth page
app.get('/auth', (req, res) => {
  res.render('auth', { active: 'login', error: null, page: 'auth' });
});

// POST login from unified form
app.post('/auth/login', express.urlencoded({ extended: true }), (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  const role = req.body.role || 'student';
  if (!username || !password) return res.render('auth', { active: 'login', error: 'Missing credentials', page: 'auth' });
  if (!userDbHandle) return res.render('auth', { active: 'login', error: 'Server not ready', page: 'auth' });

  userDbHandle.get('SELECT * FROM users WHERE username = ? AND role = ?', [username, role], (err, row) => {
    if (err) { console.error(err); return res.render('auth', { active: 'login', error: 'Login error', page: 'auth' }); }
    if (!row) return res.render('auth', { active: 'login', error: 'Invalid credentials', page: 'auth' });
    bcrypt.compare(password, row.password, (bcryptErr, same) => {
      if (bcryptErr || !same) return res.render('auth', { active: 'login', error: 'Invalid credentials', page: 'auth' });
      if (role === 'student') {
        req.session.student = { username };
        return res.redirect('/resources');
      }
      req.session.isAdmin = true;
      return res.redirect('/admin');
    });
  });
});

// POST signup from unified form
app.post('/auth/signup', express.urlencoded({ extended: true }), (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  const role = req.body.role || 'student';
  if (!username || !password) return res.render('auth', { active: 'signup', error: 'Missing fields' });
    if (!username || !password) return res.render('auth', { active: 'signup', error: 'Missing fields', page: 'auth' });
  if (!userDbHandle) return res.render('auth', { active: 'signup', error: 'Server not ready' });
    if (!userDbHandle) return res.render('auth', { active: 'signup', error: 'Server not ready', page: 'auth' });

  // For admin signup: allow multiple admins. Creation falls through to the general username-exists check below,
  // which will prevent duplicate usernames. If role === 'admin', the user will be created with that role.

  // student creation path
  userDbHandle.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
    if (err) return res.render('auth', { active: 'signup', error: 'DB error' });
      if (row) return res.render('auth', { active: 'signup', error: 'Username already taken', page: 'auth' });
    bcrypt.hash(password, 10, (hashErr, hash) => {
      if (hashErr) return res.render('auth', { active: 'signup', error: 'Error creating account' });
        if (hashErr) return res.render('auth', { active: 'signup', error: 'Error creating account', page: 'auth' });
        userDbHandle.run('INSERT INTO users (username, password, role) VALUES (?,?,?)', [username, hash, role], function(insErr) {
          if (insErr) return res.render('auth', { active: 'signup', error: 'Could not create account', page: 'auth' });
        req.session.student = { username };
        return res.redirect('/resources');
      });
    });
  });
});

// List of resources - require student login
app.get('/resources', requireStudent, async (req, res) => {
  const data = await readData();
  res.render('resources', { resources: data.resources || [], title: 'All Resources' });
});

// View single resource and increment views
app.get('/resources/:id', async (req, res) => {
  const id = req.params.id;
  const data = await readData();
  const resource = (data.resources || []).find(r => r.id === id);
  if (!resource) return res.status(404).send('Resource not found');
  resource.views = (resource.views || 0) + 1;
  await writeData(data);
  res.render('resource', { resource });
});

// Programs page (filter)
app.get('/programs', async (req, res) => {
  const data = await readData();
  const programs = (data.resources || []).filter(r => r.category === 'program');
  res.render('resources', { resources: programs, title: 'Wellness Programs' });
});

// Support page
app.get('/support', (req, res) => {
  res.render('support');
});

// Health tips page: counseling, daily routines, yoga videos
app.get('/health-tips', async (req, res) => {
  const data = await readData();
  // find any counseling resource to link from this page
  const counseling = (data.resources || []).find(r => r.category === 'mental-health');
  res.render('health_tips', { counseling });
});

/* Admin routes - simple JSON-backed admin */
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect('/admin/login');
}

app.get('/admin/login', (req, res) => {
  res.render('admin_login', { error: req.query.error });
});

app.post('/admin/login', express.urlencoded({ extended: true }), (req, res) => {
  const user = req.body.username;
  const pass = req.body.password;
  if (!user || !pass) {
    console.log(`Admin login attempt missing credentials`);
    return res.redirect('/admin/login?error=1');
  }
  if (!userDbHandle) {
    console.log('User DB not ready yet');
    return res.redirect('/admin/login?error=1');
  }
  userDbHandle.get('SELECT * FROM users WHERE username = ? AND role = ?', [user, 'admin'], (err, row) => {
    if (err) {
      console.error('DB error during admin login', err);
      return res.redirect('/admin/login?error=1');
    }
    if (!row) {
      console.log(`Admin login attempt user="${user}" success=false (no user)`);
      return res.redirect('/admin/login?error=1');
    }
    bcrypt.compare(pass, row.password, (bcryptErr, same) => {
      console.log(`Admin login attempt user="${user}" success=${!!same}`);
      if (bcryptErr || !same) return res.redirect('/admin/login?error=1');
      req.session.isAdmin = true;
      return res.redirect('/admin');
    });
  });
});

// Admin signup (only if no admin exists)
app.get('/admin/signup', (req, res) => {
  if (!userDbHandle) return res.redirect('/admin/login?error=1');
  // Allow creating additional admin accounts — render signup page for admins.
  res.render('admin_signup', { error: null });
});

app.post('/admin/signup', express.urlencoded({ extended: true }), (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  if (!username || !password) return res.render('admin_signup', { error: 'Username and password required' });
  if (!userDbHandle) return res.render('admin_signup', { error: 'Server not ready, try again' });

  // Create admin account. We rely on username uniqueness enforced by the DB; if the username exists insertion will fail.
  bcrypt.hash(password, 10, (hashErr, hash) => {
    if (hashErr) return res.render('admin_signup', { error: 'Error creating account' });
    userDbHandle.run('INSERT INTO users (username, password, role) VALUES (?,?,?)', [username, hash, 'admin'], function(insErr) {
      if (insErr) {
        console.error('Error inserting admin user', insErr);
        return res.render('admin_signup', { error: 'Could not create admin (maybe username taken)' });
      }
      // Set session as admin and redirect
      req.session.isAdmin = true;
      return res.redirect('/admin');
    });
  });
});

app.get('/admin', requireAdmin, async (req, res) => {
  const data = await readData();
  const resources = data.resources || [];
  const total = resources.reduce((s, r) => s + (r.views || 0), 0);
  res.render('admin', { resources, totalViews: total, resourceCount: resources.length });
});

app.get('/admin/new', (req, res) => {
  if (!req.session.isAdmin) return res.redirect('/admin/login');
  res.render('admin_edit', { resource: null });
});

app.post('/admin/add', async (req, res) => {
  if (!req.session.isAdmin) return res.redirect('/admin/login');
  const data = await readData();
  const resource = {
    id: uuidv4(),
    title: req.body.title || 'Untitled',
    description: req.body.description || '',
    category: req.body.category || 'general',
    image: req.body.image || '/public/images/placeholder.svg',
    link: req.body.link || '#',
    views: 0
  };
  data.resources = data.resources || [];
  data.resources.unshift(resource);
  await writeData(data);
  res.redirect('/admin');
});

app.get('/admin/edit/:id', async (req, res) => {
  if (!req.session.isAdmin) return res.redirect('/admin/login');
  const data = await readData();
  const resource = (data.resources || []).find(r => r.id === req.params.id);
  if (!resource) return res.status(404).send('Not found');
  res.render('admin_edit', { resource });
});

app.post('/admin/update/:id', async (req, res) => {
  if (!req.session.isAdmin) return res.redirect('/admin/login');
  const data = await readData();
  const idx = (data.resources || []).findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).send('Not found');
  data.resources[idx] = Object.assign({}, data.resources[idx], {
    title: req.body.title || data.resources[idx].title,
    description: req.body.description || data.resources[idx].description,
    category: req.body.category || data.resources[idx].category,
    image: req.body.image || data.resources[idx].image,
    link: req.body.link || data.resources[idx].link
  });
  await writeData(data);
  res.redirect('/admin');
});

app.post('/admin/delete/:id', async (req, res) => {
  if (!req.session.isAdmin) return res.redirect('/admin/login');
  const data = await readData();
  data.resources = (data.resources || []).filter(r => r.id !== req.params.id);
  await writeData(data);
  res.redirect('/admin');
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Student auth
function requireStudent(req, res, next) {
  if (req.session && req.session.student) return next();
  return res.redirect('/student/login');
}

app.get('/student/login', (req, res) => {
  res.render('student_login', { error: req.query.error });
});

app.post('/student/login', express.urlencoded({ extended: true }), (req, res) => {
  const username = req.body.username;
  const password = req.body.password; // Not validated in prototype
  if (!username) return res.redirect('/student/login?error=1');
  req.session.student = { username };
  res.redirect('/student/dashboard');
});

// Student signup
app.get('/student/signup', (req, res) => {
  res.render('student_signup', { error: null });
});

app.post('/student/signup', express.urlencoded({ extended: true }), (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  if (!username || !password) return res.render('student_signup', { error: 'Username and password required' });
  if (!userDbHandle) return res.render('student_signup', { error: 'Server not ready, try again' });

  // ensure username not taken
  userDbHandle.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
    if (err) {
      console.error('DB error creating student', err);
      return res.render('student_signup', { error: 'Database error' });
    }
    if (row) return res.render('student_signup', { error: 'Username already taken' });

    bcrypt.hash(password, 10, (hashErr, hash) => {
      if (hashErr) return res.render('student_signup', { error: 'Error creating account' });
      userDbHandle.run('INSERT INTO users (username, password, role) VALUES (?,?,?)', [username, hash, 'student'], function(insErr) {
        if (insErr) {
          console.error('Error inserting student user', insErr);
          return res.render('student_signup', { error: 'Could not create account' });
        }
        req.session.student = { username };
        return res.redirect('/student/dashboard');
      });
    });
  });
});

app.get('/student/dashboard', requireStudent, (req, res) => {
  // Render a student dashboard showing quick info and links to profile
  const username = req.session.student && req.session.student.username;
  if (!username) return res.redirect('/student/login');
  if (!userDbHandle) return res.redirect('/student/login?error=1');
  userDbHandle.get('SELECT id, username, full_name, email, routine, created_at FROM users WHERE username = ? AND role = ?', [username, 'student'], (err, row) => {
    if (err || !row) {
      return res.redirect('/student/login?error=1');
    }
    // Provide some default routine if none set
    const routine = row.routine || 'Morning: Stretch 5 minutes\nMidday: Walk 10 minutes\nEvening: Unwind & journal';
    res.render('student_dashboard', { user: row, routine });
  });
});

// Student profile view
app.get('/student/profile', requireStudent, (req, res) => {
  const username = req.session.student && req.session.student.username;
  if (!username) return res.redirect('/student/login');
  userDbHandle.get('SELECT id, username, full_name, email, routine, created_at FROM users WHERE username = ? AND role = ?', [username, 'student'], (err, row) => {
    if (err || !row) return res.redirect('/student/login?error=1');
    const routineLines = (row.routine || '').split('\n').filter(Boolean);
    res.render('student_profile', { user: row, routineLines });
  });
});

// Generic profile route redirects to the appropriate profile page based on session
app.get('/profile', (req, res) => {
  if (req.session && req.session.isAdmin) return res.redirect('/admin');
  if (req.session && req.session.student) return res.redirect('/student/profile');
  return res.redirect('/auth');
});

// Profile edit
app.get('/student/profile/edit', requireStudent, (req, res) => {
  const username = req.session.student && req.session.student.username;
  if (!username) return res.redirect('/student/login');
  userDbHandle.get('SELECT id, username, full_name, email, routine FROM users WHERE username = ? AND role = ?', [username, 'student'], (err, row) => {
    if (err || !row) return res.redirect('/student/login?error=1');
    res.render('student_profile_edit', { user: row, error: null });
  });
});

app.post('/student/profile/update', requireStudent, upload.single('avatar'), (req, res) => {
  const username = req.session.student && req.session.student.username;
  if (!username) return res.redirect('/student/login');
  const full_name = req.body.full_name || '';
  const email = req.body.email || '';
  const routine = req.body.routine || '';
  const phone = req.body.phone || '';
  const programs = req.body.programs || '';
  if (req.file) {
    const avatarPath = '/uploads/' + req.file.filename;
    userDbHandle.run('UPDATE users SET full_name = ?, email = ?, routine = ?, avatar = ?, phone = ?, programs = ? WHERE username = ? AND role = ?', [full_name, email, routine, avatarPath, phone, programs, username, 'student'], function(err) {
      if (err) {
        console.error('Profile update error', err);
        return res.render('student_profile_edit', { user: { username, full_name, email, routine, phone, programs }, error: 'Could not save profile' });
      }
      return res.redirect('/student/profile');
    });
  } else {
    userDbHandle.run('UPDATE users SET full_name = ?, email = ?, routine = ?, phone = ?, programs = ? WHERE username = ? AND role = ?', [full_name, email, routine, phone, programs, username, 'student'], function(err) {
      if (err) {
        console.error('Profile update error', err);
        return res.render('student_profile_edit', { user: { username, full_name, email, routine, phone, programs }, error: 'Could not save profile' });
      }
      return res.redirect('/student/profile');
    });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Minimal health metrics endpoint
app.get('/metrics', async (req, res) => {
  const data = await readData();
  const total = (data.resources || []).reduce((s, r) => s + (r.views || 0), 0);
  res.json({ totalViews: total, resourceCount: (data.resources || []).length });
});

// Admin-friendly metrics page (HTML + chart)
app.get('/admin/metrics', requireAdmin, async (req, res) => {
  const data = await readData();
  const total = (data.resources || []).reduce((s, r) => s + (r.views || 0), 0);
  const resources = data.resources || [];
  res.render('metrics', { totalViews: total, resourceCount: resources.length, resources });
});

app.listen(PORT, () => {
  console.log(`StuHealth running on http://localhost:${PORT}`);
});

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
    if (!names.includes('phone')) toAdd.push("ALTER TABLE users ADD COLUMN phone TEXT");
    if (!names.includes('programs')) toAdd.push("ALTER TABLE users ADD COLUMN programs TEXT");
    if (!names.includes('age')) toAdd.push("ALTER TABLE users ADD COLUMN age INTEGER");
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

// Simple server-side math captcha helper (no external keys needed)
function generateCaptcha(req) {
  // choose simple addition/subtraction
  const a = Math.floor(Math.random() * 10) + 1; // 1..10
  const b = Math.floor(Math.random() * 10) + 1; // 1..10
  const op = Math.random() < 0.5 ? '+' : '-';
  const question = `${a} ${op} ${b}`;
  const answer = op === '+' ? (a + b) : (a - b);
  // store the numeric answer in session for later validation
  if (req && req.session) req.session.captchaAnswer = answer;
  return { question, answer };
}

// Note: avatar upload support removed (we keep phone/programs fields only)

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
  // generate a simple math captcha for the login form
  const captcha = generateCaptcha(req);
  res.render('auth', { active: 'login', error: null, page: 'auth', captchaQuestion: captcha.question });
});

// Unified auth page
app.get('/auth', (req, res) => {
  // generate a simple math captcha for the login form
  const captcha = generateCaptcha(req);
  res.render('auth', { active: 'login', error: null, page: 'auth', captchaQuestion: captcha.question });
});

// POST login from unified form
app.post('/auth/login', express.urlencoded({ extended: true }), (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  const role = req.body.role || 'student';
  // validate captcha first
  const provided = req.body.captcha_answer ? req.body.captcha_answer.toString().trim() : '';
  const expected = req.session && (typeof req.session.captchaAnswer !== 'undefined') ? req.session.captchaAnswer.toString() : null;
  if (!provided || !expected || provided !== expected) {
    // regenerate captcha for the rendered form
    const captcha = generateCaptcha(req);
    return res.render('auth', { active: 'login', error: 'Captcha incorrect. Please try again.', page: 'auth', captchaQuestion: captcha.question });
  }
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
  const phone = req.body.phone ? req.body.phone.trim() : null;
  const ageVal = req.body.age ? parseInt(req.body.age, 10) : null;
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
        userDbHandle.run('INSERT INTO users (username, password, role, age, phone) VALUES (?,?,?,?,?)', [username, hash, role, ageVal, phone], function(insErr) {
          if (insErr) return res.render('auth', { active: 'signup', error: 'Could not create account', page: 'auth' });
        if (role === 'admin') {
          req.session.isAdmin = true;
          return res.redirect('/admin');
        }
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
  // load doctors for the booking form (if available)
  let doctors = [];
  try {
    const file = path.join(__dirname, 'data', 'doctors.json');
    const dtxt = await fs.readFile(file, 'utf8');
    const djson = JSON.parse(dtxt || '{}');
    doctors = djson.doctors || [];
  } catch (e) {
    doctors = [];
  }
  res.render('resource', { resource, doctors });
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

// Doctors listing page
app.get('/doctors', async (req, res) => {
  try {
    const file = path.join(__dirname, 'data', 'doctors.json');
    let data = { doctors: [] };
    try { data = JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { data = { doctors: [] }; }
    return res.render('doctors', { doctors: data.doctors || [] });
  } catch (err) {
    console.error('Error loading doctors', err);
    return res.render('doctors', { doctors: [] });
  }
});

// Note: doctors are not exposed as a separate page; they are used in booking forms.

// Health tips page: counseling, daily routines, yoga videos
app.get('/health-tips', async (req, res) => {
  const data = await readData();
  // find any counseling resource to link from this page
  const counseling = (data.resources || []).find(r => r.category === 'mental-health');
  res.render('health_tips', { counseling });
});

// Counseling details (guides & motivation)
app.get('/health-tips/counseling', async (req, res) => {
  const data = await readData();
  const resources = (data.resources || []).filter(r => r.category === 'mental-health');
  res.render('health_counseling', { resources });
});

// Feedback page
app.get('/feedback', (req, res) => {
  res.render('feedback', { success: false, error: null });
});

app.post('/feedback', express.urlencoded({ extended: true }), async (req, res) => {
  const name = req.body.name || '';
  const email = req.body.email || '';
  const message = req.body.message || '';
  const rating = req.body.rating ? parseInt(req.body.rating, 10) : null;
  const category = req.body.category || '';
  let urgency = req.body.urgency || 'low';
  // normalize urgency to expected values
  if (!['low', 'medium', 'high'].includes(urgency)) urgency = 'low';
  if (!message) return res.render('feedback', { success: false, error: 'Message is required' });
  const item = { id: uuidv4(), name, email, message, rating, category, urgency, resolved: false, created_at: new Date().toISOString() };
  const fbFile = path.join(__dirname, 'data', 'feedback.json');
  try {
    let existing = { feedback: [] };
    try { existing = JSON.parse(await fs.readFile(fbFile, 'utf8')); } catch (e) { existing = { feedback: [] }; }
    existing.feedback = existing.feedback || [];
    existing.feedback.unshift(item);
    await fs.writeFile(fbFile, JSON.stringify(existing, null, 2), 'utf8');
    return res.render('feedback', { success: true, error: null });
  } catch (err) {
    console.error('Error saving feedback', err);
    return res.render('feedback', { success: false, error: 'Could not save feedback' });
  }
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
        req.session.admin = { username: user };
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
  const phone = req.body.phone ? req.body.phone.trim() : null;
  const ageVal = req.body.age ? parseInt(req.body.age, 10) : null;
  if (!username || !password) return res.render('admin_signup', { error: 'Username and password required' });
  if (!userDbHandle) return res.render('admin_signup', { error: 'Server not ready, try again' });

  // Create admin account. We rely on username uniqueness enforced by the DB; if the username exists insertion will fail.
  bcrypt.hash(password, 10, (hashErr, hash) => {
    if (hashErr) return res.render('admin_signup', { error: 'Error creating account' });
    userDbHandle.run('INSERT INTO users (username, password, role, age, phone) VALUES (?,?,?,?,?)', [username, hash, 'admin', ageVal, phone], function(insErr) {
      if (insErr) {
        console.error('Error inserting admin user', insErr);
        return res.render('admin_signup', { error: 'Could not create admin (maybe username taken)' });
      }
      // Set session as admin and redirect
      req.session.isAdmin = true;
      req.session.admin = { username };
      return res.redirect('/admin');
    });
  });
});

app.get('/admin', requireAdmin, async (req, res) => {
  try {
    const data = await readData();
    const resources = data.resources || [];
    const total = resources.reduce((s, r) => s + (r.views || 0), 0);
    // get student count from users DB
    let studentCount = 0;
    if (userDbHandle) {
      studentCount = await new Promise((resolve) => {
        userDbHandle.get("SELECT COUNT(*) AS cnt FROM users WHERE role = 'student'", (err, row) => {
          if (err) return resolve(0);
          return resolve(row && row.cnt ? row.cnt : 0);
        });
      });
    }
    // load feedback file and analyze
    const fbFile = path.join(__dirname, 'data', 'feedback.json');
    let feedbackData = { feedback: [] };
    try { feedbackData = JSON.parse(await fs.readFile(fbFile, 'utf8')); } catch (e) { feedbackData = { feedback: [] }; }
    const feedbackList = (feedbackData.feedback || []);
    const feedbackCount = feedbackList.length;
    const urgencyBreakdown = feedbackList.reduce((acc, it) => { const u = it.urgency || 'low'; acc[u] = (acc[u]||0)+1; return acc; }, {});
    const categoryBreakdown = feedbackList.reduce((acc, it) => { const c = it.category || 'general'; acc[c] = (acc[c]||0)+1; return acc; }, {});
    // recent 10
    const recentFeedback = feedbackList.slice(0,10);
    // top resources by views
    const topResources = resources.slice().sort((a,b) => (b.views||0) - (a.views||0)).slice(0,5);
    // counts by resource category
    const resourceCategoryCounts = (resources || []).reduce((acc, r) => { const c = r.category || 'general'; acc[c] = (acc[c]||0)+1; return acc; }, {});
    // recent logout events
    const logoutFile = path.join(__dirname, 'data', 'logout_events.json');
    let logoutData = { events: [] };
    try { logoutData = JSON.parse(await fs.readFile(logoutFile, 'utf8')); } catch (e) { logoutData = { events: [] }; }
    const recentLogouts = (logoutData.events || []).slice(0,10);
    // recent signups from users DB (last 5 students)
    let recentSignups = [];
    if (userDbHandle) {
      recentSignups = await new Promise((resolve) => {
        userDbHandle.all("SELECT id, username, full_name, created_at FROM users WHERE role = 'student' ORDER BY created_at DESC LIMIT 5", (err, rows) => {
          if (err) return resolve([]);
          return resolve(rows || []);
        });
      });
    }
    return res.render('admin', { resources, totalViews: total, resourceCount: resources.length, studentCount, feedbackCount, urgencyBreakdown, categoryBreakdown, recentFeedback, topResources, resourceCategoryCounts, recentLogouts, recentSignups });
  } catch (err) {
    console.error('Error preparing admin dashboard', err);
    const data = await readData();
    const resources = data.resources || [];
    const total = resources.reduce((s, r) => s + (r.views || 0), 0);
    return res.render('admin', { resources, totalViews: total, resourceCount: resources.length, studentCount: 0, feedbackCount: 0, urgencyBreakdown: {}, categoryBreakdown: {}, recentFeedback: [], topResources: [], resourceCategoryCounts: {}, recentLogouts: [], recentSignups: [] });
  }
});

// Admin: delete feedback entry
app.post('/admin/feedback/delete/:id', requireAdmin, express.urlencoded({ extended: true }), async (req, res) => {
  const fbFile = path.join(__dirname, 'data', 'feedback.json');
  try {
    let existing = { feedback: [] };
    try { existing = JSON.parse(await fs.readFile(fbFile, 'utf8')); } catch (e) { existing = { feedback: [] }; }
    existing.feedback = (existing.feedback || []).filter(f => f.id !== req.params.id);
    await fs.writeFile(fbFile, JSON.stringify(existing, null, 2), 'utf8');
    return res.redirect('/admin');
  } catch (err) {
    console.error('Error deleting feedback', err);
    return res.redirect('/admin');
  }
});

// Admin: toggle resolved state for feedback
app.post('/admin/feedback/resolve/:id', requireAdmin, express.urlencoded({ extended: true }), async (req, res) => {
  const fbFile = path.join(__dirname, 'data', 'feedback.json');
  try {
    let existing = { feedback: [] };
    try { existing = JSON.parse(await fs.readFile(fbFile, 'utf8')); } catch (e) { existing = { feedback: [] }; }
    existing.feedback = (existing.feedback || []).map(f => {
      if (f.id === req.params.id) {
        f.resolved = !f.resolved;
      }
      return f;
    });
    await fs.writeFile(fbFile, JSON.stringify(existing, null, 2), 'utf8');
    return res.redirect('/admin');
  } catch (err) {
    console.error('Error toggling feedback resolved', err);
    return res.redirect('/admin');
  }
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
  const phone = req.body.phone ? req.body.phone.trim() : null;
  const ageVal = req.body.age ? parseInt(req.body.age, 10) : null;
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
        userDbHandle.run('INSERT INTO users (username, password, role, age, phone) VALUES (?,?,?,?,?)', [username, hash, 'student', ageVal, phone], function(insErr) {
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
  userDbHandle.get('SELECT id, username, full_name, email, routine, phone, age, programs, created_at FROM users WHERE username = ? AND role = ?', [username, 'student'], (err, row) => {
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
  userDbHandle.get('SELECT id, username, full_name, email, routine, phone, age, programs, created_at FROM users WHERE username = ? AND role = ?', [username, 'student'], (err, row) => {
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
  userDbHandle.get('SELECT id, username, full_name, email, routine, phone, age, programs FROM users WHERE username = ? AND role = ?', [username, 'student'], (err, row) => {
    if (err || !row) return res.redirect('/student/login?error=1');
    res.render('student_profile_edit', { user: row, error: null });
  });
});

function updateStudentProfileHandler(req, res) {
  const username = req.session.student && req.session.student.username;
  if (!username) return res.redirect('/student/login');
  const full_name = req.body.full_name || '';
  const email = req.body.email || '';
  const routine = req.body.routine || '';
  const phone = req.body.phone || '';
  const ageVal = req.body.age ? parseInt(req.body.age, 10) : null;
  const programs = req.body.programs || '';
  userDbHandle.run('UPDATE users SET full_name = ?, email = ?, routine = ?, phone = ?, programs = ?, age = ? WHERE username = ? AND role = ?', [full_name, email, routine, phone, programs, ageVal, username, 'student'], function(err) {
    if (err) {
      console.error('Profile update error', err);
      return res.render('student_profile_edit', { user: { username, full_name, email, routine, phone, programs }, error: 'Could not save profile' });
    }
    return res.redirect('/student/profile');
  });
}

app.post('/student/profile/update', requireStudent, express.urlencoded({ extended: true }), updateStudentProfileHandler);

// Show logout confirmation page (GET) and perform logout (POST)
app.get('/logout', (req, res) => {
  // Render a small confirmation page before destroying the session
  res.render('logout', { page: 'logout' });
});

app.post('/logout', express.urlencoded({ extended: true }), (req, res) => {
  (async () => {
    try {
      // record logout event for analytics
      const fbDir = path.join(__dirname, 'data');
      const outFile = path.join(fbDir, 'logout_events.json');
      await fs.mkdir(fbDir, { recursive: true });
      let existing = { events: [] };
      try { existing = JSON.parse(await fs.readFile(outFile, 'utf8')); } catch (e) { existing = { events: [] }; }
      const event = {
        id: uuidv4(),
        username: req.session && req.session.student ? req.session.student.username : (req.session && req.session.isAdmin ? 'admin' : null),
        role: req.session && req.session.isAdmin ? 'admin' : (req.session && req.session.student ? 'student' : 'guest'),
        ip: req.ip || req.connection && req.connection.remoteAddress || null,
        created_at: new Date().toISOString()
      };
      existing.events = existing.events || [];
      existing.events.unshift(event);
      await fs.writeFile(outFile, JSON.stringify(existing, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to record logout event', err);
    } finally {
      // destroy session and redirect regardless of analytics result
      req.session.destroy(() => res.redirect('/'));
    }
  })();
});

// Minimal health metrics endpoint
app.get('/metrics', async (req, res) => {
  const data = await readData();
  const total = (data.resources || []).reduce((s, r) => s + (r.views || 0), 0);
  res.json({ totalViews: total, resourceCount: (data.resources || []).length });
});

// Preview endpoint: fetch external URL and return basic metadata (title, description)
app.get('/preview', async (req, res) => {
  const url = req.query.url;
  if (!url || !(url.startsWith('http://') || url.startsWith('https://'))) {
    return res.status(400).json({ error: 'Invalid or missing url parameter' });
  }
  try {
    // Use global fetch (Node 18+) if available
    if (typeof fetch !== 'function') return res.status(500).json({ error: 'Server fetch not available' });
    const resp = await fetch(url, { redirect: 'follow' });
    const text = await resp.text();
    // crude metadata extraction
    const titleMatch = text.match(/<title[^>]*>([^<]*)<\/title>/i);
    const descMatch = text.match(/<meta\s+(?:name|property)=["'](?:description|og:description)["']\s+content=["']([^"']*)["']/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    const description = descMatch ? descMatch[1].trim() : '';
    return res.json({ url, title, description });
  } catch (err) {
    console.error('Preview fetch error for', url, err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Could not fetch preview' });
  }
});

// Appointment booking: students submit requests which are saved for admin review
app.post('/appointments/request', requireStudent, express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const dataDir = path.join(__dirname, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    const outFile = path.join(dataDir, 'appointments.json');
    let existing = { appointments: [] };
    try { existing = JSON.parse(await fs.readFile(outFile, 'utf8')); } catch (e) { existing = { appointments: [] }; }
    const student = req.session && req.session.student ? req.session.student.username : null;
    // try to attach doctor info if provided
    let doctor_id = req.body.doctor_id || null;
    let doctor_name = null;
    if (doctor_id) {
      try {
        const dfile = path.join(__dirname, 'data', 'doctors.json');
        const dtxt = await fs.readFile(dfile, 'utf8');
        const djson = JSON.parse(dtxt || '{}');
        const found = (djson.doctors || []).find(dd => dd.id === doctor_id);
        if (found) doctor_name = found.name;
      } catch (e) {
        doctor_name = null;
      }
    }

    const item = {
      id: uuidv4(),
      student: student,
      resource_id: req.body.resource_id || null,
      resource_title: req.body.resource_title || null,
      doctor_id: doctor_id,
      doctor_name: doctor_name,
      preferred_date: req.body.preferred_date || null,
      preferred_time: req.body.preferred_time || null,
      message: req.body.message || '',
      status: 'pending',
      created_at: new Date().toISOString()
    };
    existing.appointments = existing.appointments || [];
    existing.appointments.unshift(item);
    await fs.writeFile(outFile, JSON.stringify(existing, null, 2), 'utf8');
    // If this was an AJAX request, return JSON so the client can show an in-modal confirmation.
    if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
      return res.json({ success: true, id: item.id });
    }
    // otherwise redirect back to resource page with booking flag
    const back = req.body.resource_id ? '/resources/' + encodeURIComponent(req.body.resource_id) + '?booked=1' : '/resources?booked=1';
    return res.redirect(back);
  } catch (err) {
    console.error('Error saving appointment request', err);
    return res.redirect('/resources');
  }
});

// Admin: view appointment requests
app.get('/admin/appointments', requireAdmin, async (req, res) => {
  try {
    const outFile = path.join(__dirname, 'data', 'appointments.json');
    let existing = { appointments: [] };
    try { existing = JSON.parse(await fs.readFile(outFile, 'utf8')); } catch (e) { existing = { appointments: [] }; }
    const appointments = existing.appointments || [];
    // load doctors for admin assignment options
    let doctors = [];
    try {
      const dfile = path.join(__dirname, 'data', 'doctors.json');
      const dtxt = await fs.readFile(dfile, 'utf8');
      const djson = JSON.parse(dtxt || '{}');
      doctors = djson.doctors || [];
    } catch (e) { doctors = []; }
    return res.render('admin_appointments', { appointments, doctors });
  } catch (err) {
    console.error('Could not load appointments', err);
    return res.render('admin_appointments', { appointments: [], doctors: [] });
  }
});

// Admin: approve appointment (optionally assign doctor)
app.post('/admin/appointments/approve/:id', requireAdmin, express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const outFile = path.join(__dirname, 'data', 'appointments.json');
    let existing = { appointments: [] };
    try { existing = JSON.parse(await fs.readFile(outFile, 'utf8')); } catch (e) { existing = { appointments: [] }; }
    const appts = existing.appointments || [];
    const idx = appts.findIndex(a => a.id === req.params.id);
    if (idx === -1) return res.redirect('/admin/appointments');
    const doctor_id = req.body.doctor_id || null;
    let doctor_name = null;
    if (doctor_id) {
      try {
        const dfile = path.join(__dirname, 'data', 'doctors.json');
        const dtxt = await fs.readFile(dfile, 'utf8');
        const djson = JSON.parse(dtxt || '{}');
        const found = (djson.doctors || []).find(dd => dd.id === doctor_id);
        if (found) doctor_name = found.name;
      } catch (e) { doctor_name = null; }
    }
    appts[idx].status = 'approved';
    appts[idx].assigned_doctor_id = doctor_id;
    appts[idx].assigned_doctor_name = doctor_name;
    appts[idx].approved_by = (req.session && req.session.admin && req.session.admin.username) ? req.session.admin.username : 'admin';
    appts[idx].approved_at = new Date().toISOString();
    existing.appointments = appts;
    await fs.writeFile(outFile, JSON.stringify(existing, null, 2), 'utf8');
    return res.redirect('/admin/appointments');
  } catch (err) {
    console.error('Error approving appointment', err);
    return res.redirect('/admin/appointments');
  }
});

// Admin: decline appointment
app.post('/admin/appointments/decline/:id', requireAdmin, express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const outFile = path.join(__dirname, 'data', 'appointments.json');
    let existing = { appointments: [] };
    try { existing = JSON.parse(await fs.readFile(outFile, 'utf8')); } catch (e) { existing = { appointments: [] }; }
    const appts = existing.appointments || [];
    const idx = appts.findIndex(a => a.id === req.params.id);
    if (idx === -1) return res.redirect('/admin/appointments');
    appts[idx].status = 'declined';
    appts[idx].declined_by = (req.session && req.session.admin && req.session.admin.username) ? req.session.admin.username : 'admin';
    appts[idx].declined_at = new Date().toISOString();
    existing.appointments = appts;
    await fs.writeFile(outFile, JSON.stringify(existing, null, 2), 'utf8');
    return res.redirect('/admin/appointments');
  } catch (err) {
    console.error('Error declining appointment', err);
    return res.redirect('/admin/appointments');
  }
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

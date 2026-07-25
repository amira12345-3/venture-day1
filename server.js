// ============================================================
// VENTURE · Day 1 — Real Web App Server
// Node.js + Express + WebSocket + SQLite
// Run: npm install && npm start
// ============================================================

const path = require('path');
const http = require('http');
const os = require('os');
const express = require('express');
const cookieParser = require('cookie-parser');
const { WebSocketServer } = require('ws');
const Database = require('better-sqlite3');
const { nanoid } = require('nanoid');

// ---------- CONFIG ----------
const PORT = process.env.PORT || 3000;
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'venture2026';
const IGCF_PILLARS = ['Food Security', 'Education', 'Public Health', 'Environmental Transformation', 'Green Economy'];

// ---------- DATABASE ----------
const db = new Database(path.join(__dirname, 'venture.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  session_token TEXT UNIQUE,
  created_at INTEGER,
  r1_score INTEGER DEFAULT 0,
  r2_score INTEGER DEFAULT 0,
  r3_score INTEGER DEFAULT 0,
  r1_done INTEGER DEFAULT 0,
  r2_done INTEGER DEFAULT 0,
  r3_done INTEGER DEFAULT 0,
  is_ceo INTEGER DEFAULT 0,
  team_id INTEGER DEFAULT NULL,
  is_online INTEGER DEFAULT 0,
  last_seen INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT,
  round INTEGER,
  q_index INTEGER,
  selected INTEGER,
  correct INTEGER,
  ts INTEGER
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT,
  type TEXT,
  detail TEXT,
  ts INTEGER
);
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY,
  ceo_id TEXT,
  pillar TEXT
);
CREATE TABLE IF NOT EXISTS program (
  k TEXT PRIMARY KEY,
  v TEXT
);
`);

function pget(k, def=null) { const r = db.prepare('SELECT v FROM program WHERE k=?').get(k); return r ? r.v : def; }
function pset(k, v) { db.prepare('INSERT INTO program(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, String(v)); }
if (pget('active_round') === null) pset('active_round', '0'); // 0=none, 1/2/3
if (pget('phase') === null) pset('phase', 'waiting'); // waiting | round1 | round2 | round3 | ceo | draft | final

// ---------- QUESTION BANK ----------
const QUESTIONS = require('./questions.js');

// ---------- HTTP ----------
const app = express();
app.use(express.json({ limit: '512kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// --- Student session ---
function getStudent(req) {
  const tok = req.cookies['venture_student'];
  if (!tok) return null;
  return db.prepare('SELECT * FROM students WHERE session_token=?').get(tok);
}
function requireAdmin(req, res, next) {
  if (req.cookies['venture_admin'] === 'ok') return next();
  res.status(401).json({ error: 'admin auth required' });
}

// --- Student login (name only) ---
app.post('/api/student/login', (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 60);
  if (!name || name.length < 2) return res.status(400).json({ error: 'Please enter your full name.' });
  // Reuse if same name already exists (case-insensitive)
  let student = db.prepare('SELECT * FROM students WHERE LOWER(name)=LOWER(?)').get(name);
  if (!student) {
    const id = 'S' + nanoid(8);
    const token = nanoid(32);
    db.prepare('INSERT INTO students(id,name,session_token,created_at) VALUES(?,?,?,?)').run(id, name, token, Date.now());
    student = db.prepare('SELECT * FROM students WHERE id=?').get(id);
  }
  res.cookie('venture_student', student.session_token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.json({ ok: true, student: { id: student.id, name: student.name } });
});

app.get('/api/student/me', (req, res) => {
  const s = getStudent(req);
  if (!s) return res.status(401).json({ error: 'not logged in' });
  res.json({ id: s.id, name: s.name, r1: s.r1_score, r2: s.r2_score, r3: s.r3_score,
            done: { r1: !!s.r1_done, r2: !!s.r2_done, r3: !!s.r3_done },
            phase: pget('phase'), activeRound: parseInt(pget('active_round')) });
});

app.post('/api/student/logout', (req, res) => { res.clearCookie('venture_student'); res.json({ ok: true }); });

// --- Get questions for a round (student side, answers stripped) ---
app.get('/api/quiz/:round', (req, res) => {
  const student = getStudent(req);
  if (!student) return res.status(401).json({ error: 'login required' });
  const r = parseInt(req.params.round);
  if (![1,2,3].includes(r)) return res.status(400).json({ error: 'bad round' });
  const activeRound = parseInt(pget('active_round'));
  if (activeRound !== r) return res.status(403).json({ error: 'This round is not active yet.' });
  if (student['r' + r + '_done']) return res.status(403).json({ error: 'You already completed this round.' });
  const key = 'round' + r;
  const round = QUESTIONS[key];
  const stripped = round.questions.map(q => ({ q: q.q, qAr: q.qAr, options: q.options }));
  res.json({ title: round.title, titleAr: round.titleAr, timePerQuestion: round.timePerQuestion, pointsPerQuestion: round.pointsPerQuestion, questions: stripped });
});

// --- Submit an answer for a question ---
app.post('/api/quiz/:round/answer', (req, res) => {
  const student = getStudent(req);
  if (!student) return res.status(401).json({ error: 'login required' });
  const r = parseInt(req.params.round);
  const qIndex = parseInt(req.body.qIndex);
  const selected = req.body.selected == null ? -1 : parseInt(req.body.selected);
  const activeRound = parseInt(pget('active_round'));
  if (activeRound !== r) return res.status(403).json({ error: 'round not active' });
  const round = QUESTIONS['round' + r];
  if (qIndex < 0 || qIndex >= round.questions.length) return res.status(400).json({ error: 'bad q' });
  const q = round.questions[qIndex];
  const correct = selected === q.answer;
  db.prepare('INSERT INTO answers(student_id,round,q_index,selected,correct,ts) VALUES(?,?,?,?,?,?)').run(student.id, r, qIndex, selected, correct ? 1 : 0, Date.now());
  res.json({ ok: true });
});

// --- Finish a round: server tallies score from stored answers ---
app.post('/api/quiz/:round/finish', (req, res) => {
  const student = getStudent(req);
  if (!student) return res.status(401).json({ error: 'login required' });
  const r = parseInt(req.params.round);
  if (student['r' + r + '_done']) return res.json({ ok: true, alreadyDone: true, score: student['r' + r + '_score'] });
  const round = QUESTIONS['round' + r];
  const correctRows = db.prepare('SELECT COUNT(*) as c FROM answers WHERE student_id=? AND round=? AND correct=1').get(student.id, r);
  const score = correctRows.c * round.pointsPerQuestion;
  db.prepare(`UPDATE students SET r${r}_score=?, r${r}_done=1 WHERE id=?`).run(score, student.id);
  broadcastLeaderboard();
  res.json({ ok: true, score, correct: correctRows.c, total: round.questions.length });
});

// --- Report a monitoring event (silent) ---
app.post('/api/event', (req, res) => {
  const student = getStudent(req);
  if (!student) return res.status(401).json({ error: 'login required' });
  const type = String(req.body.type || '').slice(0, 40);
  const detail = String(req.body.detail || '').slice(0, 200);
  if (!type) return res.status(400).json({ error: 'no type' });
  db.prepare('INSERT INTO events(student_id,type,detail,ts) VALUES(?,?,?,?)').run(student.id, type, detail, Date.now());
  broadcastAdminEvent({ studentId: student.id, name: student.name, type, detail, ts: Date.now() });
  res.json({ ok: true });
});

// ============================================================
// ADMIN ROUTES
// ============================================================
app.post('/api/admin/login', (req, res) => {
  const { user, pass } = req.body;
  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    res.cookie('venture_admin', 'ok', { httpOnly: true, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 });
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'invalid credentials' });
});
app.post('/api/admin/logout', (req, res) => { res.clearCookie('venture_admin'); res.json({ ok: true }); });
app.get('/api/admin/me', (req, res) => { res.json({ ok: req.cookies['venture_admin'] === 'ok' }); });

app.post('/api/admin/round/:n/start', requireAdmin, (req, res) => {
  const n = parseInt(req.params.n);
  if (![1,2,3].includes(n)) return res.status(400).json({ error: 'bad round' });
  pset('active_round', String(n));
  pset('phase', 'round' + n);
  broadcast({ type: 'round_started', round: n });
  res.json({ ok: true });
});
app.post('/api/admin/round/stop', requireAdmin, (req, res) => {
  pset('active_round', '0'); pset('phase', 'waiting');
  broadcast({ type: 'round_stopped' });
  res.json({ ok: true });
});
app.post('/api/admin/phase', requireAdmin, (req, res) => {
  const p = String(req.body.phase || '');
  if (!['waiting','ceo','draft','final'].includes(p)) return res.status(400).json({ error: 'bad phase' });
  pset('phase', p);
  broadcast({ type: 'phase', phase: p });
  res.json({ ok: true });
});

app.get('/api/admin/students', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM students ORDER BY (r1_score+r2_score+r3_score) DESC').all();
  res.json({ students: rows.map(s => ({ ...s, total: s.r1_score + s.r2_score + s.r3_score })) });
});
app.get('/api/admin/events', requireAdmin, (req, res) => {
  const limit = parseInt(req.query.limit || '200');
  const rows = db.prepare('SELECT e.*, s.name AS student_name FROM events e LEFT JOIN students s ON s.id=e.student_id ORDER BY e.id DESC LIMIT ?').all(limit);
  res.json({ events: rows });
});

app.post('/api/admin/ceo/reveal', requireAdmin, (req, res) => {
  const top = db.prepare('SELECT id FROM students ORDER BY (r1_score+r2_score+r3_score) DESC LIMIT 12').all();
  db.prepare('UPDATE students SET is_ceo=0').run();
  db.prepare('DELETE FROM teams').run();
  top.forEach((t, i) => {
    db.prepare('UPDATE students SET is_ceo=1 WHERE id=?').run(t.id);
    db.prepare('INSERT INTO teams(id,ceo_id,pillar) VALUES(?,?,?)').run(i+1, t.id, IGCF_PILLARS[i % 5]);
    db.prepare('UPDATE students SET team_id=? WHERE id=?').run(i+1, t.id);
  });
  pset('phase', 'ceo');
  broadcast({ type: 'phase', phase: 'ceo' });
  res.json({ ok: true });
});

app.get('/api/admin/draft/state', requireAdmin, (req, res) => {
  const teams = db.prepare('SELECT * FROM teams ORDER BY id').all();
  const members = db.prepare('SELECT id,name,team_id,is_ceo,(r1_score+r2_score+r3_score) AS total FROM students WHERE team_id IS NOT NULL ORDER BY team_id, is_ceo DESC').all();
  const available = db.prepare('SELECT id,name,(r1_score+r2_score+r3_score) AS total FROM students WHERE team_id IS NULL ORDER BY total DESC').all();
  const currentPick = parseInt(pget('draft_pick') || '0');
  res.json({ teams, members, available, currentPick });
});
app.post('/api/admin/draft/pick', requireAdmin, (req, res) => {
  const { studentId, teamId } = req.body;
  if (!studentId || !teamId) return res.status(400).json({ error: 'bad input' });
  const team = db.prepare('SELECT id FROM teams WHERE id=?').get(teamId);
  if (!team) return res.status(400).json({ error: 'no team' });
  const s = db.prepare('SELECT * FROM students WHERE id=?').get(studentId);
  if (!s || s.team_id) return res.status(400).json({ error: 'student not available' });
  const count = db.prepare('SELECT COUNT(*) AS c FROM students WHERE team_id=?').get(teamId).c;
  if (count >= 5) return res.status(400).json({ error: 'team full (5/5)' });
  db.prepare('UPDATE students SET team_id=? WHERE id=?').run(teamId, studentId);
  const pick = parseInt(pget('draft_pick') || '0') + 1;
  pset('draft_pick', String(pick));
  broadcast({ type: 'draft_updated' });
  res.json({ ok: true });
});
app.post('/api/admin/draft/reset', requireAdmin, (req, res) => {
  db.prepare('UPDATE students SET team_id=NULL WHERE is_ceo=0').run();
  pset('draft_pick', '0');
  broadcast({ type: 'draft_updated' });
  res.json({ ok: true });
});

app.get('/api/admin/csv', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM students ORDER BY (r1_score+r2_score+r3_score) DESC').all();
  const header = 'Rank,Name,R1,R2,R3,Total,IsCEO,TeamID,Online\n';
  const csv = header + rows.map((r,i) => {
    const total = r.r1_score + r.r2_score + r.r3_score;
    return [i+1, `"${r.name.replace(/"/g,'""')}"`, r.r1_score, r.r2_score, r.r3_score, total, r.is_ceo, r.team_id || '', r.is_online].join(',');
  }).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="venture-day1.csv"');
  res.send(csv);
});

app.post('/api/admin/reset-all', requireAdmin, (req, res) => {
  db.exec(`DELETE FROM answers; DELETE FROM events; DELETE FROM teams; DELETE FROM students;`);
  pset('active_round','0'); pset('phase','waiting'); pset('draft_pick','0');
  broadcast({ type: 'reset' });
  res.json({ ok: true });
});

// Test-only: seed 60 demo students with random scores (admin)
app.post('/api/admin/seed-demo', requireAdmin, (req, res) => {
  const firstNames = ['Ahmed','Fatima','Mohammed','Aisha','Omar','Mariam','Khalid','Noora','Saeed','Hessa','Rashid','Latifa','Sultan','Shamma','Yousef','Reem','Hamdan','Salama','Zayed','Alia','Majid','Amna','Talib','Meera','Faisal','Sara','Abdulla','Maitha','Sami','Layla','Hassan','Dana','Ali','Hind','Nasser','Fajr','Ibrahim','Wadeema','Tariq','Muna','Rashed','Asma','Jasim','Hala','Adnan','Rawdha','Waleed','Salma','Bilal','Nadia','Karim','Iman','Tamer','Jawaher','Munther','Rania','Farhan','Ghaya','Zain','Bushra'];
  const lastNames = ['Al Maktoum','Al Nahyan','Al Falasi','Al Marzooqi','Al Ali','Al Suwaidi','Al Ketbi','Al Zaabi','Al Shamsi','Al Mansoori','Al Hameli','Al Nuaimi','Al Owais','Al Kaabi'];
  let count = 0;
  for (let i=0; i<60; i++){
    const name = firstNames[Math.floor(Math.random()*firstNames.length)] + ' ' + lastNames[Math.floor(Math.random()*lastNames.length)] + ' #' + (i+1);
    const id = 'S' + nanoid(8);
    const token = nanoid(32);
    const r1 = Math.floor(Math.random()*16)*10;
    const r2 = Math.floor(Math.random()*16)*10;
    const r3 = Math.floor(Math.random()*21)*10;
    db.prepare('INSERT INTO students(id,name,session_token,created_at,r1_score,r2_score,r3_score,r1_done,r2_done,r3_done) VALUES(?,?,?,?,?,?,?,1,1,1)').run(id, name, token, Date.now(), r1, r2, r3);
    count++;
  }
  broadcastLeaderboard();
  res.json({ ok: true, count });
});

// ---------- ROUTES ----------
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/leaderboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'leaderboard.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'student.html')));

// ============================================================
// WEBSOCKET — real-time sync
// ============================================================
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const clients = new Map(); // ws -> { role: 'student'|'admin'|'board', studentId? }

function broadcast(msg) {
  const s = JSON.stringify(msg);
  clients.forEach((_, ws) => { if (ws.readyState === 1) ws.send(s); });
}
function broadcastLeaderboard() {
  const rows = db.prepare('SELECT id,name,r1_score,r2_score,r3_score,is_online,is_ceo,team_id FROM students ORDER BY (r1_score+r2_score+r3_score) DESC').all();
  broadcast({ type: 'leaderboard', rows: rows.map(r => ({ ...r, total: r.r1_score + r.r2_score + r.r3_score })) });
}
function broadcastAdminEvent(evt) {
  const s = JSON.stringify({ type: 'event', ...evt });
  clients.forEach((info, ws) => { if (info.role === 'admin' && ws.readyState === 1) ws.send(s); });
}

wss.on('connection', (ws, req) => {
  const cookies = parseCookies(req.headers.cookie || '');
  const studentToken = cookies['venture_student'];
  const isAdmin = cookies['venture_admin'] === 'ok';
  const url = new URL(req.url, 'http://x');
  const role = url.searchParams.get('role') || (isAdmin ? 'admin' : (studentToken ? 'student' : 'board'));

  let studentId = null;
  if (role === 'student' && studentToken) {
    const s = db.prepare('SELECT id FROM students WHERE session_token=?').get(studentToken);
    if (s) {
      studentId = s.id;
      db.prepare('UPDATE students SET is_online=1, last_seen=? WHERE id=?').run(Date.now(), studentId);
    }
  }
  clients.set(ws, { role, studentId });
  broadcastLeaderboard();

  ws.on('message', (buf) => {
    let msg = {};
    try { msg = JSON.parse(buf.toString()); } catch (e) { return; }
    if (msg.type === 'ping') { ws.send(JSON.stringify({ type: 'pong', ts: Date.now() })); return; }
    if (msg.type === 'heartbeat' && studentId) {
      db.prepare('UPDATE students SET last_seen=?, is_online=1 WHERE id=?').run(Date.now(), studentId);
    }
  });

  ws.on('close', () => {
    if (studentId) {
      db.prepare('UPDATE students SET is_online=0 WHERE id=?').run(studentId);
      // Log a "left site" event when the student disconnects
      db.prepare('INSERT INTO events(student_id,type,detail,ts) VALUES(?,?,?,?)').run(studentId, 'disconnected', 'websocket closed', Date.now());
      const s = db.prepare('SELECT name FROM students WHERE id=?').get(studentId);
      if (s) broadcastAdminEvent({ studentId, name: s.name, type: 'disconnected', detail: 'connection closed', ts: Date.now() });
      broadcastLeaderboard();
    }
    clients.delete(ws);
  });
});

function parseCookies(str) {
  const out = {};
  str.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i+1).trim());
  });
  return out;
}

// Presence sweep — mark students offline if no heartbeat for 20s
setInterval(() => {
  const cutoff = Date.now() - 20000;
  const stale = db.prepare('SELECT id,name FROM students WHERE is_online=1 AND last_seen<?').all(cutoff);
  if (stale.length) {
    db.prepare('UPDATE students SET is_online=0 WHERE is_online=1 AND last_seen<?').run(cutoff);
    stale.forEach(s => {
      db.prepare('INSERT INTO events(student_id,type,detail,ts) VALUES(?,?,?,?)').run(s.id, 'idle_timeout', 'no heartbeat 20s', Date.now());
      broadcastAdminEvent({ studentId: s.id, name: s.name, type: 'idle_timeout', detail: 'no heartbeat 20s', ts: Date.now() });
    });
    broadcastLeaderboard();
  }
}, 5000);

// ============================================================
// START
// ============================================================
server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) for (const net of nets[name]) if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║          VENTURE · Day 1 · Live Web App          ║');
  console.log('╚══════════════════════════════════════════════════╝\n');
  console.log(`  Local:         http://localhost:${PORT}`);
  ips.forEach(ip => {
    console.log(`  Student URL:   http://${ip}:${PORT}`);
    console.log(`  Admin URL:     http://${ip}:${PORT}/admin`);
    console.log(`  Big Screen:    http://${ip}:${PORT}/leaderboard`);
  });
  console.log('\n  Admin login: admin / venture2026');
  console.log('  Share the Student URL with the 60 students on venue Wi-Fi.\n');
});

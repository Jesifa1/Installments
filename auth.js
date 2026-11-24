const crypto = require('crypto');

const PASSWORD = process.env.ADMIN_PASSWORD;
if (!PASSWORD) {
  console.error('ADMIN_PASSWORD is not set. In cmd: set ADMIN_PASSWORD=your_password');
  process.exit(1);
}

const TTL = 8 * 60 * 60 * 1000; //  8 hours
const sessions = new Map();     // token -> expiry
const failures = new Map();     // ip -> { count, until }

const hash = s => crypto.createHash('sha256').update(s).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(hash(a), hash(b));

function getToken(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)sid=([a-f0-9]{64})/);
  return m ? m[1] : null;
}

function login(req, res) {
  const f = failures.get(req.ip);
  if (f && f.until > Date.now())
    return res.status(429).json({ error: 'Too many failed attempts. Try again in 1 minute' });

  if (!safeEqual(String(req.body.password || ''), PASSWORD)) {
    const count = (f ? f.count : 0) + 1;
    failures.set(req.ip, count >= 5
      ? { count: 0, until: Date.now() + 60_000 }
      : { count, until: 0 });
    return res.status(401).json({ error: 'Wrong password' });
  }

  failures.delete(req.ip);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + TTL);
  res.setHeader('Set-Cookie',
    `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TTL / 1000}`);
  res.json({ ok: true });
}

function logout(req, res) {
  const t = getToken(req);
  if (t) sessions.delete(t);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
}

function requireAuth(req, res, next) {
  const t = getToken(req);
  const exp = t && sessions.get(t);
  if (exp && exp > Date.now()) return next();
  if (t) sessions.delete(t);
  if (req.path.startsWith('/api')) return res.status(401).json({ error: 'Please login' });
  res.redirect('/login.html');
}

module.exports = { login, logout, requireAuth };
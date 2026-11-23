const express = require('express'); 
const { monthlyCollection, trialBalance, memberStatement } = require('./reports');
const path = require('path');
const db = require('./db');
const auth = require('./auth');
const { createLoan } = require('./loans');
const { receivePayment } = require('./payments');
const { assessFines, receiveFine } = require('./fines');
const { overdue } = require('./queries');
const { makeReceipt } = require('./receipt');
const { queuePaymentSms, processOutbox } = require('./outbox');
const { sendSms } = require('./sender');

const app = express();
app.use(express.json());

const todayDhaka = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
const fail = (res, e, code = 400) => res.status(code).json({ error: e.message });

// ---- Public: login ----
app.get('/login.html', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.post('/api/login', auth.login);
app.post('/api/logout', auth.logout);

// ---- Everything below requires login ----
app.use(auth.requireAuth);
app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'views', 'index.html')));

// ---- Members ----
app.get('/api/members', (req, res) => {
  res.json(db.prepare('SELECT * FROM members ORDER BY id DESC').all());
});

app.post('/api/members', (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const phone = String(req.body.phone || '').trim();
    if (!name) throw new Error('Name is required');
    if (!/^01\d{9}$/.test(phone)) throw new Error(' Phone must be 11 digits, like 01XXXXXXXXX');
    const r = db.prepare('INSERT INTO members (name, phone) VALUES (?,?)').run(name, phone);
    res.json({ id: r.lastInsertRowid });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) e = new Error('This phone number already exists');
    fail(res, e);
  }
});

// ---- Loans ----
app.get('/api/loans', (req, res) => {
  assessFines(todayDhaka()); // ajker porjonto fine up-to-date rakho
  res.json(db.prepare(`
    SELECT l.id, l.status, m.name, l.principal, l.interest_rate,
           ROUND(SUM(i.amount_due), 2)  AS total,
           ROUND(SUM(i.amount_paid), 2) AS paid,
           ROUND(SUM(i.amount_due - i.amount_paid), 2) AS remaining,
           (SELECT ROUND(COALESCE(SUM(f.amount - f.amount_paid), 0), 2)
              FROM fines f WHERE f.loan_id = l.id) AS fine_due
    FROM loans l
    JOIN members m ON m.id = l.member_id
    JOIN installments i ON i.loan_id = l.id
    GROUP BY l.id
    ORDER BY l.id DESC`).all());
});

app.get('/api/loans/:id/installments', (req, res) => {
  res.json(db.prepare(
    'SELECT seq, due_date, amount_due, amount_paid FROM installments WHERE loan_id=? ORDER BY seq'
  ).all(Number(req.params.id)));
});

app.post('/api/loans', (req, res) => {
  try {
    const b = req.body;
    const memberId = Number(b.memberId);
    const principal = Number(b.principal);
    const interestRate = Number(b.interestRate);
    const installments = Number(b.installments);
    if (!db.prepare('SELECT 1 FROM members WHERE id=?').get(memberId)) throw new Error(' Member not found');
    if (!(principal > 0)) throw new Error('principal must be greater than 0');
    if (!(interestRate >= 0)) throw new Error('Interest rate must be 0 or more');
    if (!Number.isInteger(installments) || installments < 1) throw new Error('Number of installments must be 1 or more');
    if (!['WEEKLY', 'MONTHLY'].includes(b.frequency)) throw new Error('Frequency must be WEEKLY or MONTHLY');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.startDate || '')) throw new Error('Start date must be in YYYY-MM-DD format');

    const id = createLoan({
      memberId, principal, interestRate, installments,
      frequency: b.frequency, startDate: b.startDate,
    });
    res.json({ id });
  } catch (e) { fail(res, e); }
});

// ---- Payments ----
app.post('/api/payments', async (req, res) => {
  try {
    const loanId = Number(req.body.loanId);
    const amount = Math.round(Number(req.body.amount) * 100) / 100;
    const result = receivePayment({ loanId, amount, date: todayDhaka() });
    queuePaymentSms(result);
    await processOutbox(sendSms);
    res.json(result);
  } catch (e) { fail(res, e); }
});

app.post('/api/fines/pay', (req, res) => {
  try {
    const loanId = Number(req.body.loanId);
    const amount = Math.round(Number(req.body.amount) * 100) / 100;
    res.json(receiveFine({ loanId, amount, date: todayDhaka() }));
  } catch (e) { fail(res, e); }
});

app.get('/api/receipt/:txId', async (req, res) => {
  try {
    const file = await makeReceipt(Number(req.params.txId));
    res.sendFile(path.resolve(file));
  } catch (e) { fail(res, e, 404); }
});

// ---- Overdue ----
app.get('/api/overdue', (req, res) => {
  res.json(overdue(todayDhaka()));
});
// ---- Reports ----
app.get('/api/reports/monthly', (req, res) => {
  try {
    const month = String(req.query.month || todayDhaka().slice(0, 7));
    res.json(monthlyCollection(month));
  } catch (e) { fail(res, e); }
});

app.get('/api/reports/trial-balance', (req, res) => {
  res.json(trialBalance());
});

app.get('/api/members/:id/statement', (req, res) => {
  try {
    res.json(memberStatement(Number(req.params.id)));
  } catch (e) { fail(res, e, 404); }
});

app.listen(3000, () => console.log('Open: http://localhost:3000'));
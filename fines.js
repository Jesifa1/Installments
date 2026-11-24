const db = require('./db');
const { postTransaction } = require('./ledger');
const { FINE_PER_DAY, MAX_FINE_PER_INSTALLMENT } = require('./config');

const round2 = x => Math.round(x * 100) / 100;

function nextDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Bokeya kisti-r jonno due_date-er porer din theke today porjonto fine jomao.
// Idempotent: jotobar chalao, ekoi din-er fine duibar hobe na.
const assessFines = db.transaction((today, loanId = null) => {
  const rows = db.prepare(`
    SELECT i.id, i.loan_id, i.due_date
    FROM installments i JOIN loans l ON l.id = i.loan_id
    WHERE l.status = 'ACTIVE'
      AND i.amount_due - i.amount_paid > 0.005
      AND i.due_date < ?
      AND (? IS NULL OR i.loan_id = ?)`).all(today, loanId, loanId);

  const sumStmt = db.prepare('SELECT COALESCE(SUM(amount),0) AS s FROM fines WHERE installment_id=?');
  const exists = db.prepare('SELECT 1 FROM fines WHERE installment_id=? AND fine_date=?');
  const ins = db.prepare(
    'INSERT INTO fines (loan_id, installment_id, fine_date, amount) VALUES (?,?,?,?)');

  let added = 0;
  for (const r of rows) {
    let capLeft = round2(MAX_FINE_PER_INSTALLMENT - sumStmt.get(r.id).s);
    for (let day = nextDay(r.due_date); day <= today && capLeft > 0; day = nextDay(day)) {
      if (exists.get(r.id, day)) continue;
      const amt = round2(Math.min(FINE_PER_DAY, capLeft));
      ins.run(r.loan_id, r.id, day, amt);
      capLeft = round2(capLeft - amt);
      added = round2(added + amt);
    }
  }
  return added;
});

const receiveFine = db.transaction(({ loanId, amount, date }) => {
  if (!(amount > 0)) throw new Error('Amount must be positive');
  if (!db.prepare('SELECT 1 FROM loans WHERE id=?').get(loanId)) throw new Error('Loan not found');

  assessFines(date, loanId);

  const outstanding = round2(db.prepare(
    'SELECT COALESCE(SUM(amount - amount_paid),0) AS s FROM fines WHERE loan_id=?'
  ).get(loanId).s);
  if (amount > outstanding) throw new Error(`Overpayment. Fine outstanding: ${outstanding}`);

  const rows = db.prepare(`
    SELECT id, amount, amount_paid FROM fines
    WHERE loan_id = ? AND amount - amount_paid > 0.005
    ORDER BY fine_date, id`).all(loanId);

  let left = amount;
  const upd = db.prepare('UPDATE fines SET amount_paid = ROUND(amount_paid + ?, 2) WHERE id = ?');
  for (const r of rows) {
    if (left <= 0.005) break;
    const pay = round2(Math.min(left, r.amount - r.amount_paid));
    upd.run(pay, r.id);
    left = round2(left - pay);
  }

  const txId = postTransaction({
    date, description: `Fine payment for loan #${loanId}`, loanId,
    lines: [
      { account: 'CASH', debit: amount },
      { account: 'FINE_INCOME', credit: amount },
    ],
  });

  return { txId, paid: amount, remaining: round2(outstanding - amount) };
});

module.exports = { assessFines, receiveFine };
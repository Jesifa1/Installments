const db = require('./db');

const round2 = x => Math.round(x * 100) / 100;

// Cash collected in a month, split into principal / interest / fines
function monthlyCollection(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Month must be in YYYY-MM format');

  const t = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN a.code='CASH'        THEN e.debit  END), 0) AS total_cash,
      COALESCE(SUM(CASE WHEN a.code='LOAN_RECV'   THEN e.credit END), 0) AS principal,
      COALESCE(SUM(CASE WHEN a.code='INT_INCOME'  THEN e.credit END), 0) AS interest,
      COALESCE(SUM(CASE WHEN a.code='FINE_INCOME' THEN e.credit END), 0) AS fines
    FROM ledger_entries e
    JOIN transactions t ON t.id = e.transaction_id
    JOIN accounts a     ON a.id = e.account_id
    WHERE substr(t.date, 1, 7) = ?`).get(month);

  const byMember = db.prepare(`
    SELECT m.id, m.name, m.phone, ROUND(SUM(e.debit), 2) AS collected
    FROM ledger_entries e
    JOIN transactions t ON t.id = e.transaction_id
    JOIN accounts a     ON a.id = e.account_id AND a.code = 'CASH'
    JOIN loans l        ON l.id = t.loan_id
    JOIN members m      ON m.id = l.member_id
    WHERE substr(t.date, 1, 7) = ? AND e.debit > 0
    GROUP BY m.id
    ORDER BY collected DESC`).all(month);

  return {
    month,
    totals: {
      total_cash: round2(t.total_cash),
      principal: round2(t.principal),
      interest: round2(t.interest),
      fines: round2(t.fines),
    },
    byMember,
  };
}

// Sum of debits vs credits per account; the two totals must be equal
function trialBalance() {
  const rows = db.prepare(`
    SELECT a.code, a.name, a.type,
           ROUND(COALESCE(SUM(e.debit), 0), 2)  AS debit,
           ROUND(COALESCE(SUM(e.credit), 0), 2) AS credit
    FROM accounts a
    LEFT JOIN ledger_entries e ON e.account_id = a.id
    GROUP BY a.id
    ORDER BY a.id`).all();

  const debit = round2(rows.reduce((s, r) => s + r.debit, 0));
  const credit = round2(rows.reduce((s, r) => s + r.credit, 0));
  return { rows, totals: { debit, credit }, balanced: debit === credit };
}
// All loans and cash payments of one member
function memberStatement(memberId) {
  const member = db.prepare(
    'SELECT id, name, phone, joined_at FROM members WHERE id = ?').get(memberId);
  if (!member) throw new Error('Member not found');

  const loans = db.prepare(`
    SELECT l.id, l.status, l.principal, l.interest_rate, l.start_date,
           ROUND(SUM(i.amount_due), 2)  AS total,
           ROUND(SUM(i.amount_paid), 2) AS paid,
           ROUND(SUM(i.amount_due - i.amount_paid), 2) AS remaining
    FROM loans l
    JOIN installments i ON i.loan_id = l.id
    WHERE l.member_id = ?
    GROUP BY l.id
    ORDER BY l.id`).all(memberId);

  const payments = db.prepare(`
    SELECT t.id AS tx_id, t.date, t.loan_id, t.description, ROUND(e.debit, 2) AS amount
    FROM ledger_entries e
    JOIN transactions t ON t.id = e.transaction_id
    JOIN accounts a     ON a.id = e.account_id AND a.code = 'CASH'
    JOIN loans l        ON l.id = t.loan_id
    WHERE l.member_id = ? AND e.debit > 0
    ORDER BY t.date, t.id`).all(memberId);

  return { member, loans, payments };
}

module.exports = { monthlyCollection, trialBalance, memberStatement };

//module.exports = { monthlyCollection, trialBalance };
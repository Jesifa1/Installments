const db = require('./db');

function overdue(today) {
  return db.prepare(`
    SELECT i.id AS installment_id, m.name, m.phone, l.id AS loan_id, i.seq, i.due_date,
           ROUND(i.amount_due - i.amount_paid, 2) AS due_amount,
           CAST(julianday(?) - julianday(i.due_date) AS INTEGER) AS days_late
    FROM installments i
    JOIN loans l   ON l.id = i.loan_id
    JOIN members m ON m.id = l.member_id
    WHERE l.status = 'ACTIVE'
      AND i.amount_due - i.amount_paid > 0.005
      AND i.due_date < ?
    ORDER BY days_late DESC`).all(today, today);
}

function loanSummary(loanId) {
  return db.prepare(`
    SELECT l.id, l.status, m.name,
           ROUND(SUM(i.amount_due), 2)  AS total,
           ROUND(SUM(i.amount_paid), 2) AS paid,
           ROUND(SUM(i.amount_due - i.amount_paid), 2) AS remaining
    FROM loans l
    JOIN members m ON m.id = l.member_id
    JOIN installments i ON i.loan_id = l.id
    WHERE l.id = ?
    GROUP BY l.id`).get(loanId);
}

module.exports = { overdue, loanSummary };
const db = require('./db');

const fmt = n => String(Math.round(n * 100) / 100);

// receivePayment-er result niye SMS text banay
function paymentSms({ txId, paid, totalPaid, remaining }) {
  const r = db.prepare(`
    SELECT t.date, t.loan_id, m.name, m.phone
    FROM transactions t
    JOIN loans l   ON l.id = t.loan_id
    JOIN members m ON m.id = l.member_id
    WHERE t.id = ?`).get(txId);
  if (!r) throw new Error('Transaction not found');

  const text =
    `Dear ${r.name}, we received Tk ${fmt(paid)} on ${r.date} for Loan #${r.loan_id}. ` +
    `Total paid: Tk ${fmt(totalPaid)}. Remaining: Tk ${fmt(remaining)}. Thank you.`;
  return { to: r.phone, text };
}

// overdue() er row niye reminder SMS
function reminderSms(row) {
  const text =
    `Dear ${row.name}, installment #${row.seq} of Loan #${row.loan_id} ` +
    `(Tk ${fmt(row.due_amount)}) was due on ${row.due_date}. Please pay soon.`;
  return { to: row.phone, text };
}

module.exports = { paymentSms, reminderSms };
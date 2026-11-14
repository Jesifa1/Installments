const db = require('./db'); const { assessFines } = require('./fines');
const { postTransaction } = require('./ledger');

const round2 = x => Math.round(x * 100) / 100;

const receivePayment = db.transaction(({ loanId, amount, date }) => {
  if (!(amount > 0)) throw new Error('Amount must be positive');

  const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(loanId);
  if (!loan) throw new Error('Loan not found');
  if (loan.status === 'CLOSED') throw new Error('Loan already closed');
  assessFines(date, loanId); // kisti dewar age ei porjonto fine hishab kore nao

  const total = round2(loan.principal * (1 + loan.interest_rate / 100));
  const paidSoFar = db
    .prepare('SELECT COALESCE(SUM(amount_paid),0) AS p FROM installments WHERE loan_id=?')
    .get(loanId).p;
  const outstanding = round2(total - paidSoFar);
  if (amount > outstanding) throw new Error(`Overpayment. Outstanding: ${outstanding}`);

  // Oldest unpaid kisti age bhoro
  const rows = db.prepare(`
    SELECT * FROM installments
    WHERE loan_id = ? AND amount_due - amount_paid > 0.005
    ORDER BY seq`).all(loanId);

  let left = amount;
  const upd = db.prepare(
    'UPDATE installments SET amount_paid = ROUND(amount_paid + ?, 2) WHERE id = ?'
  );
  for (const r of rows) {
    if (left <= 0.005) break;
    const pay = round2(Math.min(left, r.amount_due - r.amount_paid));
    upd.run(pay, r.id);
    left = round2(left - pay);
  }

  // Principal vs interest bhag
  const principalPart = round2((amount * loan.principal) / total);
  const interestPart = round2(amount - principalPart);

  const lines = [
    { account: 'CASH', debit: amount },
    { account: 'LOAN_RECV', credit: principalPart },
  ];
  if (interestPart > 0) lines.push({ account: 'INT_INCOME', credit: interestPart });

  const txId = postTransaction({
    date, description: `Payment for loan #${loanId}`, loanId, lines,
  });

  const newOutstanding = round2(outstanding - amount);
  if (newOutstanding <= 0.004) {
    db.prepare("UPDATE loans SET status='CLOSED' WHERE id=?").run(loanId);
  }

  return {
    txId,
    paid: amount,
    totalPaid: round2(total - newOutstanding),
    remaining: newOutstanding,
  };
});

module.exports = { receivePayment };
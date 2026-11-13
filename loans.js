const db = require('./db');
const { postTransaction } = require('./ledger');

const round2 = x => Math.round(x * 100) / 100;

function addPeriod(dateStr, freq, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  if (freq === 'WEEKLY') d.setUTCDate(d.getUTCDate() + 7 * n);
  else d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

const createLoan = db.transaction(
  ({ memberId, principal, interestRate, installments, frequency, startDate }) => {
    const { lastInsertRowid: loanId } = db
      .prepare(`INSERT INTO loans (member_id, principal, interest_rate,
                total_installments, frequency, start_date) VALUES (?,?,?,?,?,?)`)
      .run(memberId, principal, interestRate, installments, frequency, startDate);

    const total = round2(principal * (1 + interestRate / 100));
    const each = round2(total / installments);
    const ins = db.prepare(
      'INSERT INTO installments (loan_id, seq, due_date, amount_due) VALUES (?,?,?,?)'
    );
    let remaining = total;
    for (let i = 1; i <= installments; i++) {
      const amt = i === installments ? round2(remaining) : each;
      ins.run(loanId, i, addPeriod(startDate, frequency, i), amt);
      remaining = round2(remaining - amt);
    }

    postTransaction({
      date: startDate,
      description: `Loan #${loanId} disbursed`,
      loanId,
      lines: [
        { account: 'LOAN_RECV', debit: principal },
        { account: 'CASH', credit: principal },
      ],
    });
    return loanId;
  }
);

module.exports = { createLoan };
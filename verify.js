const db = require('./db');

let failed = 0;
function check(name, ok, detail = '') {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (ok ? '' : '  -> ' + detail));
  if (!ok) failed++;
}

const t = db.prepare(`
  SELECT CAST(ROUND(SUM(debit)*100) AS INTEGER) AS dr,
         CAST(ROUND(SUM(credit)*100) AS INTEGER) AS cr
  FROM ledger_entries`).get();
check('Total debit == total credit', t.dr === t.cr, `${t.dr} vs ${t.cr}`);

const bad = db.prepare(`
  SELECT transaction_id FROM ledger_entries
  GROUP BY transaction_id
  HAVING ROUND(SUM(debit)*100) <> ROUND(SUM(credit)*100)`).all();
check('Every transaction balanced', bad.length === 0, JSON.stringify(bad));

const sched = db.prepare(`
  SELECT l.id,
         CAST(ROUND(SUM(i.amount_due)*100) AS INTEGER) AS s,
         CAST(ROUND(l.principal*(1+l.interest_rate/100)*100) AS INTEGER) AS expected
  FROM loans l JOIN installments i ON i.loan_id = l.id
  GROUP BY l.id`).all();
for (const r of sched)
  check(`Loan #${r.id} schedule total`, r.s === r.expected, `${r.s} vs ${r.expected}`);

const over = db.prepare(
  'SELECT id FROM installments WHERE amount_paid > amount_due + 0.001').all();
check('No overpaid installment', over.length === 0, JSON.stringify(over));

const loans = db.prepare('SELECT id FROM loans').all();
for (const l of loans) {
  const paid = db.prepare(
    'SELECT CAST(ROUND(COALESCE(SUM(amount_paid),0)*100) AS INTEGER) AS p FROM installments WHERE loan_id=?'
  ).get(l.id).p;
  const finePaid = db.prepare(
    'SELECT CAST(ROUND(COALESCE(SUM(amount_paid),0)*100) AS INTEGER) AS p FROM fines WHERE loan_id=?'
  ).get(l.id).p;
  const cash = db.prepare(`
    SELECT CAST(ROUND(COALESCE(SUM(e.debit),0)*100) AS INTEGER) AS c
    FROM ledger_entries e
    JOIN transactions t ON t.id = e.transaction_id
    JOIN accounts a ON a.id = e.account_id
    WHERE t.loan_id = ? AND a.code = 'CASH'`).get(l.id).c;
  check(`Loan #${l.id} installments + fines paid == cash in ledger`,
        paid + finePaid === cash, `${paid}+${finePaid} vs ${cash}`);
}

const recv = db.prepare(`
  SELECT CAST(ROUND((SUM(e.debit)-SUM(e.credit))*100) AS INTEGER) AS bal
  FROM ledger_entries e JOIN accounts a ON a.id = e.account_id
  WHERE a.code = 'LOAN_RECV'`).get().bal;

  const fineLedger = db.prepare(`
  SELECT CAST(ROUND(COALESCE(SUM(e.credit),0)*100) AS INTEGER) AS c
  FROM ledger_entries e JOIN accounts a ON a.id = e.account_id
  WHERE a.code = 'FINE_INCOME'`).get().c;
const fineTable = db.prepare(
  'SELECT CAST(ROUND(COALESCE(SUM(amount_paid),0)*100) AS INTEGER) AS p FROM fines').get().p;
check('Fines paid == Fine Income in ledger', fineLedger === fineTable, `${fineTable} vs ${fineLedger}`);

console.log('Loan Receivable balance:', recv / 100);

console.log(failed ? `\n${failed} check FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
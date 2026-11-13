const db = require('./db');

const toCents = x => Math.round(x * 100);

function accountId(code) {
  const row = db.prepare('SELECT id FROM accounts WHERE code = ?').get(code);
  if (!row) throw new Error('Unknown account: ' + code);
  return row.id;
}

const postTransaction = db.transaction(({ date, description, loanId, lines }) => {
  const dr = lines.reduce((s, l) => s + toCents(l.debit || 0), 0);
  const cr = lines.reduce((s, l) => s + toCents(l.credit || 0), 0);
  if (dr !== cr) throw new Error(`Unbalanced: debit ${dr / 100} != credit ${cr / 100}`);

  const { lastInsertRowid: txId } = db
    .prepare('INSERT INTO transactions (date, description, loan_id) VALUES (?,?,?)')
    .run(date || new Date().toISOString().slice(0, 10), description, loanId ?? null);

  const ins = db.prepare(
    'INSERT INTO ledger_entries (transaction_id, account_id, debit, credit) VALUES (?,?,?,?)'
  );
  for (const l of lines) ins.run(txId, accountId(l.account), l.debit || 0, l.credit || 0);
  return txId;
});

module.exports = { postTransaction };
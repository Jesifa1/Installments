const Database = require('better-sqlite3');
const fs = require('fs');

const db = new Database('samity.db');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync('schema.sql', 'utf8'));

const seed = db.prepare(
  'INSERT OR IGNORE INTO accounts (code, name, type) VALUES (?,?,?)'
);
[
  ['CASH', 'Cash in Hand', 'ASSET'],
  ['LOAN_RECV', 'Loan Receivable', 'ASSET'],
  ['INT_INCOME', 'Interest Income', 'INCOME'],
  ['FINE_INCOME', 'Fine Income', 'INCOME'],
].forEach(a => seed.run(...a));

module.exports = db;
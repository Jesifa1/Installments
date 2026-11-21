const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { loanSummary } = require('./queries');

function makeReceipt(txId, outDir = 'receipts') {
  const t = db.prepare(`
    SELECT t.id, t.date, t.loan_id, m.name, m.phone
    FROM transactions t
    JOIN loans l   ON l.id = t.loan_id
    JOIN members m ON m.id = l.member_id
    WHERE t.id = ?`).get(txId);
  if (!t) throw new Error('Transaction not found');

  const amt = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN a.code='CASH'       THEN e.debit  END), 0) AS cash,
      COALESCE(SUM(CASE WHEN a.code='LOAN_RECV'  THEN e.credit END), 0) AS principal,
      COALESCE(SUM(CASE WHEN a.code='INT_INCOME' THEN e.credit END), 0) AS interest,
      COALESCE(SUM(CASE WHEN a.code='INT_INCOME' THEN e.credit END), 0) AS interest,
      COALESCE(SUM(CASE WHEN a.code='FINE_INCOME' THEN e.credit END), 0) AS fine
    FROM ledger_entries e
    JOIN accounts a ON a.id = e.account_id
    WHERE e.transaction_id = ?`).get(txId);
  if (amt.cash <= 0) throw new Error('Not a payment transaction');

  const s = loanSummary(t.loan_id);

  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `receipt-${t.id}.pdf`);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 40 });
    const stream = fs.createWriteStream(file);
    doc.pipe(stream);

    doc.fontSize(18).text('SAMITY - PAYMENT RECEIPT', { align: 'center' });
    doc.moveDown();
    doc.fontSize(11);
    doc.text(`Receipt No : ${t.id}`);
    doc.text(`Date       : ${t.date}`);
    doc.text(`Member     : ${t.name}`);
    doc.text(`Phone      : ${t.phone}`);
    doc.text(`Loan No    : ${t.loan_id}`);
    doc.moveDown();

    doc.text(`Amount received : Tk ${amt.cash.toFixed(2)}`);
    doc.text(`  Principal part: Tk ${amt.principal.toFixed(2)}`);
    doc.text(`  Interest part : Tk ${amt.interest.toFixed(2)}`);
    doc.text(`  Fine part     : Tk ${amt.fine.toFixed(2)}`);
    doc.moveDown();

    doc.text(`Loan total      : Tk ${s.total.toFixed(2)}`);
    doc.text(`Total paid      : Tk ${s.paid.toFixed(2)}`);
    doc.text(`Remaining       : Tk ${s.remaining.toFixed(2)}`);
    doc.moveDown(2);
    doc.fontSize(9).text('Thank you. This is a computer generated receipt.', { align: 'center' });

    doc.end();
    stream.on('finish', () => resolve(file));
    stream.on('error', reject);
  });
}

module.exports = { makeReceipt };


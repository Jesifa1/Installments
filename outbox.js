const db = require('./db');
const { paymentSms, reminderSms } = require('./sms');
const { overdue } = require('./queries');

const insert = db.prepare(`
  INSERT OR IGNORE INTO sms_outbox (kind, to_phone, body, loan_id, dedupe_key)
  VALUES (?,?,?,?,?)`);

// receivePayment()-er result dao
function queuePaymentSms(result) {
  const m = paymentSms(result);
  const loanId = db.prepare('SELECT loan_id FROM transactions WHERE id=?')
    .get(result.txId).loan_id;
  return insert.run('PAYMENT', m.to, m.text, loanId, `PAY:${result.txId}`).changes;
}

// Bokeya shob kisti-r reminder queue-te rakho (ek kisti, ek din-e ekbar)
function queueReminders(today) {
  let count = 0;
  for (const row of overdue(today)) {
    const m = reminderSms(row);
    count += insert.run(
      'REMINDER', m.to, m.text, row.loan_id, `REM:${row.installment_id}:${today}`
    ).changes;
  }
  return count;
}

// Pending ba fail (3 bar-er kom) SMS-gulo pathao
async function processOutbox(sender) {
  const rows = db.prepare(`
    SELECT * FROM sms_outbox
    WHERE status IN ('PENDING','FAILED') AND attempts < 3
    ORDER BY id`).all();

  let sent = 0;
  for (const r of rows) {
    try {
      await sender(r.to_phone, r.body);
      db.prepare(`UPDATE sms_outbox
                  SET status='SENT', attempts=attempts+1, sent_at=datetime('now')
                  WHERE id=?`).run(r.id);
      sent++;
    } catch (e) {
      db.prepare(`UPDATE sms_outbox
                  SET status='FAILED', attempts=attempts+1, error=?
                  WHERE id=?`).run(String(e.message), r.id);
    }
  }
  return sent;
}

module.exports = { queuePaymentSms, queueReminders, processOutbox };
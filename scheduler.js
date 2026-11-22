const { backupDb } = require('./backup');
const cron = require('node-cron');
const { queueReminders, processOutbox } = require('./outbox');
const { sendSms } = require('./sender');


const todayDhaka = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });

async function dailyJob() {
    assessFines(todayDhaka());
  const queued = queueReminders(todayDhaka());
  const sent = await processOutbox(sendSms);

    try {
    console.log('Backup saved:', await backupDb());
  } catch (e) {
    console.error('Backup failed:', e.message);
  } 
  
  console.log(`[${new Date().toISOString()}] queued=${queued} sent=${sent}`);
}

cron.schedule('0 9 * * *', dailyJob, { timezone: 'Asia/Dhaka' });
console.log('Scheduler running. Roj 09:00 (Dhaka) e chalbe. Bondho korte Ctrl+C.');
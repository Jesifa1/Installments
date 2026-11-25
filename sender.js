

const API_URL = process.env.SMS_API_URL;
const API_KEY = process.env.SMS_API_KEY;
const SENDER_ID = process.env.SMS_SENDER_ID || '';


const toIntl = phone => (phone.startsWith('01') ? '88' + phone : phone);

async function sendSms(to, text) {
  if (!API_URL || !API_KEY) {
    console.log(`[SMS not sent: no gateway configured -> ${to}] ${text}`);
    return;
  }

  const url = new URL(API_URL);
  url.searchParams.set('api_key', API_KEY);      
  url.searchParams.set('senderid', SENDER_ID);    
  url.searchParams.set('number', toIntl(to));     
  url.searchParams.set('message', text);          

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const body = await res.text();
  if (!res.ok) throw new Error(`SMS gateway HTTP ${res.status}: ${body.slice(0, 200)}`);
  console.log('SMS gateway response:', body.slice(0, 200));
}

module.exports = { sendSms };
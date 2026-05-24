// server/sms/sender.js
require('dotenv').config();

let twilioClient = null;
let atSms = null;

function getTwilio() {
  if (!twilioClient) {
    try {
      const twilio = require('twilio');
      twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    } catch { twilioClient = null; }
  }
  return twilioClient;
}

function getAT() {
  if (!atSms) {
    try {
      const AT = require('africastalking');
      const at = AT({ username: process.env.AT_USERNAME, apiKey: process.env.AT_API_KEY });
      atSms = at.SMS;
    } catch { atSms = null; }
  }
  return atSms;
}

async function sendSMS(to, message) {
  const sms = getAT();
  if (!sms || process.env.AT_API_KEY === 'placeholder' || process.env.AT_API_KEY === 'your_api_key') {
    console.log(`[SMS MOCK] To: ${to} | Msg: ${message.substring(0, 60)}...`);
    return { success: true, mock: true };
  }
  try {
    await sms.send({ to: [to], from: process.env.AT_SENDER_ID || 'NUKIA', message });
    console.log(`✅ SMS sent to ${to}`);
    return { success: true };
  } catch (err) {
    console.error(`❌ SMS failed to ${to}:`, err.message);
    return { success: false, error: err.message };
  }
}

async function sendWhatsApp(to, message) {
  const client = getTwilio();
  const sid = process.env.TWILIO_ACCOUNT_SID;
  if (!client || !sid || sid === 'placeholder' || sid.startsWith('AC') && sid.length < 20) {
    console.log(`[WA MOCK] To: ${to} | Msg: ${message.substring(0, 60)}...`);
    return { success: true, mock: true };
  }
  try {
    const toF = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    const msg = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: toF, body: message
    });
    console.log(`✅ WhatsApp sent to ${to} — ${msg.sid}`);
    return { success: true, sid: msg.sid };
  } catch (err) {
    console.error(`❌ WhatsApp failed to ${to}:`, err.message);
    return { success: false, error: err.message };
  }
}

async function sendReminder(to, message, channel = 'sms') {
  if (channel === 'whatsapp') {
    const r = await sendWhatsApp(to, message);
    if (r.success) return { ...r, channel: 'whatsapp' };
  }
  const r = await sendSMS(to, message);
  return { ...r, channel: 'sms' };
}

module.exports = { sendSMS, sendWhatsApp, sendReminder };

// server/bot/messages.js
const M = {

  // ── RETAIL MESSAGES ──────────────────────────────────────

  retailHelp: (shopName, isHybrid) => `
🏪 *${shopName} — NUKIA*
${isHybrid ? '_Mode: 🛒 Retail — type SWITCH for wholesale_\n' : ''}
*Commands:*
📝 *MIX* Fatuma 30 Oud:72 Rose:18 Musk:10
📝 *MIX* Fatuma +255712345678 30 Oud:72 Rose:18
   _(add phone to send customer a digital card)_
🔁 *REFILL* NK-2847
🔍 *FIND* Fatuma  or  FIND NK-2847
📋 *LIST* — today's mixes
💳 *CHECK* — credit balance
💰 *PAY* — top up credits
📤 *EXPORT* — all your formulas
${isHybrid ? '🔄 *SWITCH* — go to wholesale mode' : ''}
`.trim(),

  mixSaved: ({ scentId, customerName, bottleMl, ingredients, creditsLeft, reminderDate }) => `
✅ *Formula Saved!*
🆔 Scent ID: *${scentId}*
👤 Customer: ${customerName}
🫙 Bottle: ${bottleMl}ml

*Recipe:*
${ingredients.map(i => `• ${i.name}: ${i.amount} (${i.percentage}%)`).join('\n')}

💳 Credits left: *${creditsLeft}*
🔔 Reminder: *${reminderDate}*
🖨️ Label printing...
`.trim(),

  refillDone: ({ scentId, customerName, bottleMl, ingredients, creditsLeft }) => `
✅ *Refill Done!*
🆔 ${scentId} · 👤 ${customerName} · 🫙 ${bottleMl}ml

*Recipe:*
${ingredients.map(i => `• ${i.name}: ${i.amount} (${i.percentage}%)`).join('\n')}

💳 Credits left: *${creditsLeft}*
`.trim(),

  formulaFound: ({ scentId, customerName, bottleMl, ingredients, lastMixed, mixCount }) => `
🔍 *Formula Found*
🆔 *${scentId}*
👤 ${customerName} · 🫙 ${bottleMl}ml
🔄 Mixed ${mixCount}x · Last: ${lastMixed}

*Recipe:*
${ingredients.map(i => `• ${i.name}: ${i.amount} (${i.percentage}%)`).join('\n')}

Type *REFILL ${scentId}* to mix again.
`.trim(),

  balance: ({ shopName, credits, todayMixes, todayRevenue }) => `
💳 *${shopName} Balance*
Credits: *${credits}*
Value: *${credits * 200} TSH*

📊 Today: ${todayMixes} mixes · ${todayRevenue} TSH
${credits < 5 ? '🚨 *Almost out! Type PAY now.*' : credits < 20 ? '⚠️ Low credits. Type PAY to top up.' : '✅ Good to go!'}
`.trim(),

  todayList: ({ shopName, mixes, total, revenue }) => `
📋 *Today — ${shopName}*
${mixes.length === 0 ? 'No mixes yet today.' :
  mixes.map((m, i) => `${i + 1}. ${m.customer_name} — ${m.bottle_ml}ml (${m.scent_id})`).join('\n')}

Total: *${total} mixes · ${revenue} TSH*
`.trim(),

  pay: ({ mpesaNumber, shopName }) => `
💰 *Top Up — ${shopName}*
Send M-Pesa to: *${mpesaNumber}*

Rates:
• 5,000 TSH → 25 credits
• 10,000 TSH → 55 credits (+5 bonus)
• 20,000 TSH → 115 credits (+15 bonus)
• 50,000 TSH → 300 credits (+50 bonus)

Forward your M-Pesa confirmation SMS here. Credits added within 30 minutes.
`.trim(),

  switchedToWholesale: (shopName) => `
🔄 *Switched to Wholesale Mode*
*${shopName}*

Type *HELP* to see wholesale commands.
`.trim(),

  switchedToRetail: (shopName) => `
🔄 *Switched to Retail Mode*
*${shopName}*

Type *HELP* to see retail commands.
`.trim(),

  // ── WHOLESALE MESSAGES ───────────────────────────────────

  wholesaleHelp: (shopName) => `
🏭 *${shopName} — NUKIA Wholesale*
_Mode: 🏭 Wholesale — type SWITCH for retail_

*Commands:*
📦 *STOCK* — view your retailers' stock levels
🌐 *NETWORK* — list your connected retail shops
📤 *PUSH* NK-2847 retailer-phone — send formula to retailer
📋 *BATCH* — log a bulk production batch
🔔 *ALERTS* — see low stock alerts
🔄 *SWITCH* — go to retail mode
`.trim(),

  networkList: ({ shopName, retailers }) => `
🌐 *Your Retail Network — ${shopName}*
Connected shops: *${retailers.length}*

${retailers.length === 0 ? 'No retailers connected yet.\nContact NUKIA to link your retail customers.' :
  retailers.map((r, i) => `${i + 1}. ${r.retailer_name} — ${r.retailer_phone}`).join('\n')}
`.trim(),

  stockReport: ({ shopName, retailers }) => `
📦 *Stock Report — ${shopName}*
${retailers.length === 0 ? 'No stock data yet.' :
  retailers.map(r => `
🏪 *${r.retailer_name}*
${r.stocks.length === 0 ? '  No stock data' :
  r.stocks.map(s => `  • ${s.oil_name}: ~${Math.round(s.estimated_ml)}ml ${s.estimated_ml < 100 ? '🔴 LOW' : s.estimated_ml < 300 ? '🟡 OK' : '🟢 GOOD'}`).join('\n')}
`.trim()).join('\n\n')}
`.trim(),

  alertsList: ({ alerts }) => `
🔔 *Low Stock Alerts*
${alerts.length === 0 ? '✅ All retailers have sufficient stock.' :
  alerts.map(a => `⚠️ *${a.retailer_name}* — ${a.oil_name} running low (~${Math.round(a.estimated_ml)}ml, ~${a.days_remaining} days left)`).join('\n')}
`.trim(),

  formulaPushed: ({ scentId, retailerName }) => `
✅ *Formula Pushed*
🆔 ${scentId} sent to *${retailerName}*
They can now use it with: REFILL ${scentId}
`.trim(),

  // ── SHARED MESSAGES ──────────────────────────────────────

  noCredits: (credits) => `
❌ *No Credits*
Balance: ${credits}
Type *PAY* to top up. Each mix costs 1 credit (200 TSH).
`.trim(),

  formatError: () => `
❌ *Wrong Format*
Example: MIX Fatuma 30 Oud:72 Rose:18 Musk:10
Type *HELP* for all commands.
`.trim(),

  notFound: (q) => `❌ No formula found for: *${q}*`,

  shopNotFound: () => `❌ Your shop is not registered with NUKIA.\nContact us to get started.`,

  unknown: () => `🤔 Command not recognised.\nType *HELP* to see all commands.`,

  // ── AUTOMATED MESSAGES ───────────────────────────────────

  reminderSms: ({ customerName, shopName, shopPhone, scentId, bottleMl }) =>
    `Hi ${customerName}! Your ${bottleMl}ml fragrance from ${shopName} is running low. Scent ID: ${scentId}. Reorder: wa.me/${(shopPhone||'').replace('+','')} 🌺`,

  reorderAlert: ({ retailerName, oilName, daysLeft }) =>
    `⚠️ NUKIA Alert: ${retailerName} is running low on ${oilName} (~${daysLeft} days left). Consider restocking them soon.`,

  creditsAdded: ({ shopName, credits, newBalance }) =>
    `✅ *Credits Added!*\n+${credits} credits for ${shopName}\nNew balance: *${newBalance} credits*\nHappy mixing! 🌺`,

  lowCreditAlert: ({ shopName, credits }) =>
    `⚠️ NUKIA: ${shopName} has only ${credits} credit(s) left. Top up now — type PAY.`,

  // ── DIGITAL SCENT CARD — sent to customer after every mix ──
  customerScentCard: ({ scentId, shopName, shopPhone, customerName, bottleMl, reminderDate }) => `
🌺 *Your Scent Card — NUKIA*

Hello ${customerName}!

🆔 Scent ID: *${scentId}*
🏪 Shop: ${shopName}
🫙 Bottle: ${bottleMl}ml
🔔 Refill due: *${reminderDate}*

To reorder, tap below:
wa.me/${shopPhone.replace('+', '')}

Show your Scent ID at the shop and your fragrance will be ready in minutes.

_Powered by NUKIA · Harufu ya Akili_ 🌺
`.trim(),

  customerRefillCard: ({ scentId, shopName, shopPhone, customerName, bottleMl, reminderDate }) => `
🔁 *Refill Confirmed — NUKIA*

Hello ${customerName}!

🆔 Scent ID: *${scentId}*
🏪 Shop: ${shopName}
🫙 Bottle: ${bottleMl}ml
🔔 Next refill: *${reminderDate}*

To reorder anytime, tap below:
wa.me/${shopPhone.replace('+', '')}

_Powered by NUKIA · Harufu ya Akili_ 🌺
`.trim(),

  formulaReceivedFromWholesaler: ({ scentId, wholesalerName, ingredients }) => `
📥 *Formula Received!*
From: *${wholesalerName}*
🆔 Scent ID: *${scentId}*

*Recipe:*
${ingredients.map(i => `• ${i.name}: ${i.amount} (${i.percentage}%)`).join('\n')}

Type *REFILL ${scentId}* to use it.
`.trim(),
};

module.exports = M;

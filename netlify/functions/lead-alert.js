// KonnectCore — Supabase Database Webhook -> Telegram lead alert
// Trigger: INSERT on public.demo_requests (Supabase -> Database -> Webhooks)
// Env vars (Netlify -> Site settings -> Environment variables):
//   KC_TG_BOT_TOKEN   - Telegram bot token (from @BotFather)
//   KC_TG_CHAT_ID     - Telegram chat id to notify
//   LEAD_ALERT_SECRET - shared secret; Supabase webhook must send header x-webhook-secret with the same value

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const secret = process.env.LEAD_ALERT_SECRET;
  if (secret && event.headers["x-webhook-secret"] !== secret) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Bad JSON" };
  }

  // Supabase webhook shape: { type: "INSERT", table: "demo_requests", record: {...} }
  const r = payload.record || {};
  if (!r.name || !r.phone) {
    return { statusCode: 422, body: "Missing lead fields" };
  }

  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const when = r.created_at ? new Date(r.created_at).toLocaleString("en-GB", { timeZone: "Africa/Accra" }) : "now";

  const text =
    `\u{1F331} <b>New KonnectCore demo request!</b>\n\n` +
    `\u{1F464} <b>${esc(r.name)}</b>\n` +
    `\u{1F3E2} ${esc(r.organization || "—")}\n` +
    `\u{1F4DE} <a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>\n` +
    `\u{1F465} Members: ${esc(r.members || "—")}\n` +
    `\u{1F550} ${when} (GMT)\n\n` +
    `View all: Supabase -> Table Editor -> demo_requests`;

  const tg = await fetch(`https://api.telegram.org/bot${process.env.KC_TG_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: process.env.KC_TG_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!tg.ok) {
    console.error("Telegram send failed:", await tg.text());
    return { statusCode: 502, body: "Telegram error" };
  }

  return { statusCode: 200, body: "ok" };
};

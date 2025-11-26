// api/kommo-sla.js
// Боевой обработчик SLA: принимает вебхуки Kommo и шлёт напоминание в Telegram

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const base = process.env.KOMMO_BASE_URL || "https://tumarcarpets.kommo.com";
    const token = process.env.KOMMO_TOKEN;
    const tgToken = process.env.TELEGRAM_BOT_TOKEN;
    const tgChatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !tgToken || !tgChatId) {
      console.log("Missing env vars", { token: !!token, tgToken: !!tgToken, tgChatId: !!tgChatId });
      return res.status(500).json({
        ok: false,
        error: "Missing KOMMO_TOKEN or TELEGRAM_* env vars",
      });
    }

    const q = req.query || {};
    const b = req.body || {};

    // 1) Пытаемся взять lead_id из query / body (ручной вызов, Salesbot)
    let leadId =
      q.lead_id ||
      b.lead_id ||
      // 2) Формат системного вебхука Kommo: leads[add][0][id], leads[update][0][id]
      b["leads[add][0][id]"] ||
      b["leads[update][0][id]"];

    if (!leadId) {
      console.log("No leadId in request", { query: q, body: b });
      return res.status(400).json({ ok: false, error: "lead_id not found in request" });
    }

    console.log("SLA for lead", leadId);

    // --- 1. Тянем сделку из Kommo ---
    const leadUrl = `${base}/api/v4/leads/${leadId}`;

    const leadResp = await fetch(leadUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const leadData = await leadResp.json().catch(() => ({}));

    if (!leadResp.ok) {
      console.log("Kommo lead fetch error", leadResp.status, leadData);
      return res.status(leadResp.status).json({
        ok: false,
        error: "Kommo lead fetch error",
        detail: leadData,
      });
    }

    const leadName = leadData.name || `Lead #${leadId}`;
    const responsibleId = leadData.responsible_user_id;

    // --- 2. Тянем ответственного (по красоте, можно убрать если не нужно) ---
    let responsibleName = "Не указан";
    try {
      const userResp = await fetch(`${base}/api/v4/users/${responsibleId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (userResp.ok) {
        const userData = await userResp.json();
        responsibleName = userData.name || responsibleName;
      }
    } catch (e) {
      console.log("User fetch error (not critical):", e);
    }

    // --- 3. Источник лида из кастомного поля ---
    let source = "Не указан";
    if (Array.isArray(leadData.custom_fields_values)) {
      const srcField = leadData.custom_fields_values.find(
        (f) => f.field_name === "Источник лида" || f.field_id === 1141872
      );
      if (srcField && Array.isArray(srcField.values) && srcField.values[0]) {
        source = srcField.values[0].value || source;
      }
    }

    const dealLink = `${base}/leads/detail/${leadId}`;

    const text =
      `⚠️ *Комментарий от клиента (Tumark)*\n\n` +
      `*Сделка:* ${leadName}\n` +
      `*ID:* ${leadId}\n` +
      `*Источник:* ${source}\n` +
      `*Ответственный:* ${responsibleName}\n\n` +
      `Прошло 20 минут с момента комментария клиента.\n` +
      `Ответили ли вы на комментарий?\n` +
      `${dealLink}`;

    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: "✅ Да, ответили", callback_data: `sla_yes_${leadId}` },
          { text: "❌ Нет, не ответили", callback_data: `sla_no_${leadId}` },
        ],
      ],
    };

    // --- 4. Шлём в Telegram ---
    const tgResp = await fetch(
      `https://api.telegram.org/bot${tgToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: tgChatId,
          text,
          parse_mode: "Markdown",
          reply_markup: inlineKeyboard,
        }),
      }
    );

    const tgData = await tgResp.json().catch(() => ({}));

    if (!tgResp.ok || !tgData.ok) {
      console.log("Telegram send error", tgResp.status, tgData);
      return res.status(500).json({
        ok: false,
        error: "Telegram sendMessage error",
        detail: tgData,
      });
    }

    console.log("SLA notification sent for lead", leadId);

    return res.status(200).json({ ok: true, sent_to_telegram: true });
  } catch (err) {
    console.error("kommo-sla error:", err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}

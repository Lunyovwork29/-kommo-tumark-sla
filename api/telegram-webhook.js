// api/telegram-webhook.js
// Webhook от Telegram: обрабатываем нажатия кнопок "Да/Нет"

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const tgToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!tgToken) {
      return res.status(500).json({ ok: false, error: "No TELEGRAM_BOT_TOKEN" });
    }

    const update = req.body;

    // Реакция на /start (не обязательно, просто чтобы бот не молчал)
    if (update.message && update.message.text === "/start") {
      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: update.message.chat.id,
          text: "Бот SLA Tumark активен. Буду присылать напоминания по комментариям.",
        }),
      });

      return res.status(200).json({ ok: true });
    }

    // Обработка нажатий на кнопки
    if (update.callback_query) {
      const cq = update.callback_query;
      const data = cq.data || "";
      const chatId = cq.message?.chat?.id;
      const messageId = cq.message?.message_id;

      // ответ на callback, чтобы убралось "часики" у кнопки
      await fetch(
        `https://api.telegram.org/bot${tgToken}/answerCallbackQuery`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callback_query_id: cq.id,
          }),
        }
      );

      if (!chatId || !messageId) {
        return res.status(200).json({ ok: true });
      }

      let newText = cq.message.text || "";
      if (data.startsWith("sla_yes_")) {
        newText += `\n\n✅ Ответ: *Да, ответили*`;
      } else if (data.startsWith("sla_no_")) {
        newText += `\n\n❌ Ответ: *Нет, не ответили*`;
      } else {
        return res.status(200).json({ ok: true });
      }

      // редактируем текст сообщения, чтобы было видно, что выбрано
      await fetch(
        `https://api.telegram.org/bot${tgToken}/editMessageText`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: newText,
            parse_mode: "Markdown",
          }),
        }
      );

      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true, ignored: true });
  } catch (err) {
    console.error("telegram-webhook error:", err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}


import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function POST(req: Request) {
  let stage = "initialize";
  let supabase: any = null;
  let claimedChatId: string | null = null;
  let claimedMessageId: string | null = null;
  let claimCreated = false;
  let sendAttempted = false;

  const ignored = (reason: string, details: Record<string, unknown> = {}) =>
    NextResponse.json({ ok: true, ignored: reason, ...details });

  const isDuplicateError = (error: any) =>
    error?.code === "23505";

  const sha256 = async (value: string): Promise<string> => {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);

    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  };

  try {
    stage = "cloudflare_context";

    const { env } = await getCloudflareContext({ async: true });

    const secret = env?.BALE_WEBHOOK_SECRET;

    if (secret && req.headers.get("x-bale-secret") !== secret) {
      return NextResponse.json(
        { ok: false, error: "دسترسی غیرمجاز" },
        { status: 401 }
      );
    }

    stage = "parse_payload";

    const payload: any = await req.json().catch(() => null);

    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        { ok: false, error: "درخواست نامعتبر است" },
        { status: 400 }
      );
    }

    const message: any =
      payload.message ?? payload.edited_message ?? payload;

    const text = [
      message?.text,
      message?.body,
      message?.caption,
      payload?.text,
    ].find(
      (value) =>
        typeof value === "string" && value.trim().length > 0
    );

    const chatId =
      message?.chat?.id ??
      message?.chat_id ??
      payload?.chat_id ??
      payload?.chat?.id ??
      null;

    const messageId =
      message?.message_id ??
      message?.id ??
      payload?.message_id ??
      null;

    const senderObject =
      message?.from ??
      message?.sender ??
      payload?.from ??
      payload?.sender ??
      {};

    const senderId =
      senderObject?.id ??
      senderObject?.user_id ??
      senderObject?.sender_id ??
      null;

    const senderUsername = String(
      senderObject?.username ??
      senderObject?.user_name ??
      ""
    )
      .replace(/^@/, "")
      .toLowerCase();

    const configuredBotId = env?.BALE_BOT_ID;

    const isBotSender =
      message?.from?.is_bot === true ||
      message?.sender?.is_bot === true ||
      payload?.from?.is_bot === true ||
      payload?.sender?.is_bot === true ||
      senderObject?.is_bot === true ||
      senderUsername === "mmm532bot" ||
      (
        configuredBotId &&
        senderId !== null &&
        String(senderId) === String(configuredBotId)
      );

    if (isBotSender) {
      return ignored("bot_message");
    }

    // پیام‌هایی که در پاسخ به پیام خود ربات نوشته شده‌اند
    // نباید باعث ایجاد چرخهٔ پاسخ شوند.
    const repliedMessage =
      message?.reply_to_message ??
      message?.replyToMessage ??
      payload?.reply_to_message ??
      null;

    const repliedSender =
      repliedMessage?.from ??
      repliedMessage?.sender ??
      repliedMessage?.author ??
      {};

    const repliedUsername = String(
      repliedSender?.username ??
      repliedSender?.user_name ??
      ""
    )
      .replace(/^@/, "")
      .toLowerCase();

    const repliedSenderId =
      repliedSender?.id ??
      repliedSender?.user_id ??
      null;

    const replyIsBot =
      repliedSender?.is_bot === true ||
      repliedUsername === "mmm532bot" ||
      (
        configuredBotId &&
        repliedSenderId !== null &&
        String(repliedSenderId) === String(configuredBotId)
      );

    if (replyIsBot) {
      return ignored("reply_to_bot");
    }

    if (typeof text !== "string" || !text.trim()) {
      return ignored("no_text");
    }

    const normalizedText = text
      .replace(/[يى]/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/[\s‌]+/g, " ")
      .trim();

    // فقط پیام‌هایی که صریحاً «مدیر هوشمند» را خطاب می‌کنند.
    if (!/مدیر\s*هوشمند/u.test(normalizedText)) {
      return ignored("not_addressed_to_assistant");
    }

    if (chatId === null || messageId === null) {
      return ignored("missing_message_identity");
    }

    const chatIdString = String(chatId);
    const messageIdString = String(messageId);

    const allowedGroupId = String(
      env?.BALE_GROUP_ID || "4554953620"
    );

    if (chatIdString !== allowedGroupId) {
      return ignored("wrong_chat");
    }

    stage = "supabase_config";

    const supabaseUrl = env?.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase configuration is missing");
    }

    supabase = createClient(supabaseUrl, supabaseKey);

    // قفل اول: همان شناسهٔ پیام فقط یک بار پردازش شود.
    stage = "claim_message";

    claimedChatId = chatIdString;
    claimedMessageId = messageIdString;

    const { error: claimError } = await supabase
      .from("bale_processed_messages")
      .insert({
        chat_id: chatIdString,
        message_id: messageIdString,
      });

    if (claimError) {
      if (isDuplicateError(claimError)) {
        return ignored("duplicate_message", {
          message_id: messageIdString,
        });
      }

      throw claimError;
    }

    claimCreated = true;

    // پاک‌سازی رکوردهای قدیمی؛ خطای پاک‌سازی نباید پاسخ‌گویی را متوقف کند.
    stage = "cleanup_old_requests";

    const cleanupCutoff = new Date(
      Date.now() - 2 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { error: cleanupError } = await supabase
      .from("bale_processed_requests")
      .delete()
      .lt("created_at", cleanupCutoff);

    if (cleanupError) {
      console.error("[BALE_REQUEST_CLEANUP_ERROR]", cleanupError);
    }

    // قفل دوم: متن یکسان از همان کاربر در همان دقیقه.
    // شناسهٔ کاربر نیز در کلید هست تا پیام کاربران دیگر مسدود نشود.
    stage = "claim_request";

    const minuteBucket = Math.floor(Date.now() / 60_000);
    const senderIdentity =
      senderId === null ? "unknown-sender" : String(senderId);

    const requestKey = await sha256(
      [
        chatIdString,
        senderIdentity,
        normalizedText.toLowerCase(),
        String(minuteBucket),
      ].join("|")
    );

    const { error: requestClaimError } = await supabase
      .from("bale_processed_requests")
      .insert({ request_key: requestKey });

    if (requestClaimError) {
      if (isDuplicateError(requestClaimError)) {
        return ignored("duplicate_request", {
          message_id: messageIdString,
        });
      }

      throw requestClaimError;
    }

    stage = "supabase_insert";

    const { data: savedMessage, error: saveError } = await supabase
      .from("messages")
      .insert({
        text: text.trim(),
        source: "bale",
        raw_data: payload,
      })
      .select("id")
      .single();

    if (saveError) {
      throw saveError;
    }

    stage = "assistant_request";

    const assistantUrl = new URL("/api/assistant", req.url);

    const aiResponse = await fetch(assistantUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: text.trim() }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text().catch(() => "");
      throw new Error(
        `Assistant API returned ${aiResponse.status}: ${errorText.slice(0, 500)}`
      );
    }

    stage = "assistant_parse";

    const aiData: any = await aiResponse.json();

    const answer = aiData?.answer ?? aiData?.response ?? null;

    if (typeof answer !== "string" || !answer.trim()) {
      throw new Error("Assistant returned an empty answer");
    }

    stage = "bale_config";

    const token = env?.BALE_SMART_TOKEN;

    if (!token) {
      throw new Error("BALE_SMART_TOKEN is missing");
    }

    stage = "bale_send_message";
    sendAttempted = true;

    const sendUrl =
      `https://tapi.bale.ai/bot${token}/sendMessage`;

    const sendPayload = {
      chat_id: chatIdString,
      text: answer.trim().slice(0, 4000),
      reply_to_message_id: messageId,
    };

    const baleResponse = await fetch(sendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sendPayload),
    });

    const baleData: any = await baleResponse
      .json()
      .catch(() => null);

    if (!baleResponse.ok || baleData?.ok !== true) {
      console.error(
        "[BALE_SEND_ERROR]",
        JSON.stringify({
          status: baleResponse.status,
          incoming_message_id: messageIdString,
          response: baleData,
        })
      );

      throw new Error(
        `Bale sendMessage failed with status ${baleResponse.status}`
      );
    }

    // ثبت شناسهٔ پیام ارسالی ربات برای شناسایی echoهای احتمالی.
    const sentMessageId =
      baleData?.result?.message_id ??
      baleData?.result?.message?.message_id ??
      baleData?.message?.message_id ??
      null;

    if (sentMessageId !== null) {
      stage = "register_outgoing_message";

      const { error: outgoingClaimError } = await supabase
        .from("bale_processed_messages")
        .insert({
          chat_id: chatIdString,
          message_id: String(sentMessageId),
        });

      if (
        outgoingClaimError &&
        !isDuplicateError(outgoingClaimError)
      ) {
        // پاسخ قبلاً ارسال شده است؛ خطای ثبت شناسه نباید موجب ارسال دوباره شود.
        console.error(
          "[BALE_OUTGOING_REGISTER_ERROR]",
          outgoingClaimError
        );
      }
    }

    console.log(
      "[BALE_WEBHOOK_SUCCESS]",
      JSON.stringify({
        stage: "completed",
        update_id: payload?.update_id ?? null,
        incoming_message_id: messageIdString,
        outgoing_message_id:
          sentMessageId === null ? null : String(sentMessageId),
        chat_id: chatIdString,
        sender_id: senderId === null ? null : String(senderId),
        reply_to_message_id:
          repliedMessage?.message_id ??
          message?.reply_to_message_id ??
          null,
        saved_message_id: savedMessage?.id ?? null,
        ai_used: aiData?.ai_used ?? null,
        source: aiData?.source ?? null,
        bale_ok: true,
      })
    );

    return NextResponse.json({
      ok: true,
      message_id: messageIdString,
      sender: senderObject?.first_name ?? senderObject?.name ?? null,
      chat_id: chatIdString,
      reply_to_message_id: messageId,
      answer: answer.trim(),
      ai_used: aiData?.ai_used ?? null,
      knowledge_match: aiData?.knowledge_match ?? null,
      bale_ok: true,
    });
  } catch (error: any) {
    console.error(
      "[BALE_WEBHOOK_ERROR]",
      JSON.stringify({
        stage,
        error: error?.message ?? String(error),
        incoming_message_id: claimedMessageId,
        chat_id: claimedChatId,
        send_attempted: sendAttempted,
      })
    );

    // اگر هنوز ارسال پاسخ شروع نشده، قفل پیام ورودی را آزاد می‌کنیم
    // تا در صورت خطای موقت امکان تلاش مجدد وجود داشته باشد.
    if (
      claimCreated &&
      !sendAttempted &&
      supabase &&
      claimedChatId &&
      claimedMessageId
    ) {
      const { error: releaseError } = await supabase
        .from("bale_processed_messages")
        .delete()
        .eq("chat_id", claimedChatId)
        .eq("message_id", claimedMessageId);

      if (releaseError) {
        console.error("[BALE_CLAIM_RELEASE_ERROR]", releaseError);
      }
    }

    return NextResponse.json(
      { ok: false, error: "خطا در پردازش پیام", stage },
      { status: 500 }
    );
  }
}


import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { POST as assistantPost } from "../../assistant/route";

export async function POST(req: Request) {
  let stage = "initialize";
  let supabase: any = null;
  let claimCreated = false;
  let keepClaim = false;
  let claimChatId = "";
  let claimMessageId = "";

  try {
    stage = "cloudflare_context";

    const { env } = await getCloudflareContext({
      async: true,
    });

    const secret = env?.BALE_WEBHOOK_SECRET;

    if (
      secret &&
      req.headers.get("x-bale-secret") !== secret
    ) {
      return NextResponse.json(
        { ok: false, error: "دسترسی غیرمجاز" },
        { status: 401 }
      );
    }

    stage = "parse_payload";

    const payload = await req.json().catch(() => null);

    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        { ok: false, error: "بدنه درخواست معتبر نیست." },
        { status: 400 }
      );
    }

    const message =
      payload?.message ??
      payload?.edited_message ??
      payload;

    const text = [
      message?.text,
      message?.body,
      message?.caption,
      payload?.text,
    ].find(
      (value) =>
        typeof value === "string" &&
        value.trim().length > 0
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
      payload?.sender ??
      {};

    const sender =
      senderObject?.first_name ??
      senderObject?.name ??
      senderObject?.username ??
      null;

    // پیام‌های ربات‌ها، از جمله خود این ربات، پردازش نشوند.
    const senderUsername = String(
      senderObject?.username ?? ""
    )
      .replace(/^@/, "")
      .toLowerCase();

    const senderId = senderObject?.id;

    const configuredBotId = (env as unknown as Record<string, unknown>)?.BALE_BOT_ID;

    const isBot =
      message?.from?.is_bot === true ||
      message?.sender?.is_bot === true ||
      payload?.from?.is_bot === true ||
      senderObject?.is_bot === true ||
      senderUsername === "mmm532bot" ||
      (
        configuredBotId &&
        senderId != null &&
        String(senderId) === String(configuredBotId)
      );

    if (isBot) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "bot_message",
      });
    }

    if (!text) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "no_text",
      });
    }

    // فقط پیام‌هایی که عبارت «مدیر هوشمند» دارند.
    // تفاوت حروف عربی/فارسی و فاصله‌ها نادیده گرفته می‌شود.
    const normalizedText = text
      .normalize("NFC")
      .replace(/[يى]/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/[\u200c\u200d]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!/مدیر\s*هوشمند/u.test(normalizedText)) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "assistant_not_mentioned",
      });
    }

    if (
      chatId === null ||
      chatId === undefined ||
      messageId === null ||
      messageId === undefined ||
      String(messageId).trim() === ""
    ) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "missing_chat_or_message_id",
      });
    }

    const allowedGroupId = String(
      env?.BALE_GROUP_ID || "4554953620"
    );

    if (String(chatId) !== allowedGroupId) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "group_not_allowed",
      });
    }

    stage = "supabase_config";

    const supabaseUrl = env?.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase configuration is incomplete");
    }

    supabase = createClient(supabaseUrl, supabaseKey);

    // ثبت اتمیک شناسه پیام؛ قید UNIQUE مانع پردازش تکراری می‌شود.
    stage = "claim_message";

    claimChatId = String(chatId);
    claimMessageId = String(messageId);

    const { error: claimError } = await supabase
      .from("bale_processed_messages")
      .insert({
        chat_id: claimChatId,
        message_id: claimMessageId,
      });

    if (claimError?.code === "23505") {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "duplicate_message",
      });
    }

    if (claimError) {
      console.error("[BALE_WEBHOOK_CLAIM_ERROR]", {
        code: claimError.code,
        message: claimError.message,
      });

      throw new Error("Could not register message for deduplication");
    }

    claimCreated = true;

    stage = "supabase_insert";

    const { data: savedMessage, error: saveError } =
      await supabase
        .from("messages")
        .insert({
          text: text.trim(),
          source: "bale",
          raw_data: payload,
        })
        .select("id")
        .single();

    if (saveError) {
      console.error("[BALE_WEBHOOK_SAVE_ERROR]", {
        message: saveError.message,
        code: saveError.code ?? null,
      });

      throw new Error("ثبت پیام در Supabase ناموفق بود.");
    }

    // فراخوانی مستقیم؛ از self-fetch به Worker استفاده نمی‌شود.
    stage = "assistant_request";

    const assistantRequest = new Request(
      "https://internal/api/assistant",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: text.trim(),
        }),
      }
    );

    const aiResponse = await assistantPost(assistantRequest);

    if (!aiResponse.ok) {
      const details = await aiResponse
        .text()
        .catch(() => "");

      console.error("[BALE_WEBHOOK_ASSISTANT_ERROR]", {
        status: aiResponse.status,
        details: details.slice(0, 500),
      });

      throw new Error(
        `Assistant request failed with status ${aiResponse.status}`
      );
    }

    stage = "assistant_parse";

    const aiData: any = await aiResponse.json();

    const answer = aiData?.answer ?? aiData?.response ?? null;

    if (typeof answer !== "string" || !answer.trim()) {
      throw new Error("پاسخ متنی معتبری از دستیار دریافت نشد.");
    }

    stage = "bale_config";

    const token = env?.BALE_SMART_TOKEN;

    if (!token) {
      throw new Error("BALE_SMART_TOKEN تنظیم نشده است.");
    }

    const sendUrl =
      `https://tapi.bale.ai/bot${token}/sendMessage`;

    const sendPayload: Record<string, unknown> = {
      chat_id: chatId,
      text: answer.trim().slice(0, 4000),
      reply_to_message_id: messageId,
    };

    stage = "bale_send_message";

    // از این نقطه به بعد شناسه نگه داشته می‌شود تا در خطاهای
    // مبهم شبکه، ارسال مجدد باعث پاسخ تکراری نشود.
    keepClaim = true;

    const baleResponse = await fetch(sendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sendPayload),
    });

    const baleData = await baleResponse
      .json()
      .catch(() => null);

    if (!baleResponse.ok || baleData?.ok !== true) {
      console.error("[BALE_WEBHOOK_SEND_ERROR]", {
        status: baleResponse.status,
        error_code: baleData?.error_code ?? null,
        description: baleData?.description ?? null,
      });

      return NextResponse.json(
        {
          ok: false,
          stage,
          error: "ارسال پاسخ به بله ناموفق بود.",
          bale_http_status: baleResponse.status,
          bale_description: baleData?.description ?? null,
        },
        { status: 502 }
      );
    }

    console.log("[BALE_WEBHOOK_SUCCESS]", {
      message_id: savedMessage?.id ?? null,
      chat_id: claimChatId,
      reply_to_message_id: claimMessageId,
    });

    return NextResponse.json({
      ok: true,
      received: true,
      message_id: savedMessage?.id ?? null,
      sender,
      chat_id: chatId,
      reply_to_message_id: messageId,
      answer,
      ai_used: aiData?.ai_used ?? null,
      knowledge_match: aiData?.knowledge_match ?? null,
      bale_ok: true,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : String(error);

    console.error("[BALE_WEBHOOK_ERROR]", {
      stage,
      error: errorMessage,
    });

    return NextResponse.json(
      {
        ok: false,
        stage,
        error: errorMessage,
      },
      { status: 500 }
    );
  } finally {
    // اگر ارسال پاسخ شروع نشده باشد، اجازه پردازش مجدد بده.
    // پس از شروع ارسال، شناسه حفظ می‌شود تا پاسخ تکراری نسازیم.
    if (claimCreated && !keepClaim && supabase) {
      try {
        await supabase
          .from("bale_processed_messages")
          .delete()
          .eq("chat_id", claimChatId)
          .eq("message_id", claimMessageId);
      } catch (cleanupError) {
        console.error("[BALE_WEBHOOK_CLEANUP_ERROR]", {
          error:
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError),
        });
      }
    }
  }
}

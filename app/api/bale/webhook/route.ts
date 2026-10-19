
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

    const payload: any = await req.json().catch(() => null);

    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        {
          ok: false,
          stage,
          error: "بدنه درخواست JSON معتبر نیست.",
        },
        { status: 400 }
      );
    }

    const message: any =
      payload.message ??
      payload.edited_message ??
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
      payload?.from ??
      payload?.sender ??
      {};

    const sender =
      senderObject?.first_name ??
      senderObject?.name ??
      senderObject?.username ??
      null;

    // پیام‌های ربات‌ها نباید پردازش شوند.
    const senderUsername = String(
      senderObject?.username ??
      senderObject?.user_name ??
      ""
    )
      .replace(/^@/, "")
      .toLowerCase();

    const configuredBotId = env?.BALE_BOT_ID;

    const senderId =
      senderObject?.id ??
      senderObject?.user_id ??
      null;

    const isBotMessage =
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

    if (isBotMessage) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "bot_message",
      });
    }

    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "no_text",
      });
    }

    // نرمال‌سازی حروف فارسی و فاصله‌ها
    const normalizedText = text
      .replace(/[يى]/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/[\s‌]+/g, " ")
      .trim();

    // فقط پیام‌هایی که عبارت مدیر هوشمند را دارند.
    const addressedToAssistant =
      /مدیر\s*هوشمند/u.test(normalizedText);

    if (!addressedToAssistant) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "not_addressed_to_assistant",
      });
    }

    // برای جلوگیری مطمئن از پاسخ تکراری، شناسه‌ها الزامی‌اند.
    if (chatId === null || messageId === null) {
      console.warn(
        "[BALE_WEBHOOK_IGNORED]",
        JSON.stringify({
          reason: "missing_chat_or_message_id",
        })
      );

      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "missing_chat_or_message_id",
      });
    }

    const chatIdString = String(chatId);
    const messageIdString = String(messageId);

    // محدود کردن ربات به گروه مجاز
    const allowedGroupId = String(
      env?.BALE_GROUP_ID || "4554953620"
    );

    if (chatIdString !== allowedGroupId) {
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
      throw new Error(
        "تنظیمات اتصال به Supabase کامل نیست."
      );
    }

    supabase = createClient(
      supabaseUrl,
      supabaseKey
    );

    // ثبت اتمی شناسه پیام؛ محدودیت UNIQUE مانع پردازش هم‌زمان می‌شود.
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
      if (claimError.code === "23505") {
        console.log(
          "[BALE_WEBHOOK_IGNORED]",
          JSON.stringify({
            reason: "duplicate_message",
            message_id: messageIdString,
          })
        );

        return NextResponse.json({
          ok: true,
          ignored: true,
          reason: "duplicate_message",
        });
      }

      console.error(
        "[BALE_WEBHOOK_STAGE_ERROR]",
        JSON.stringify({
          stage,
          error: claimError.message,
          code: claimError.code ?? null,
        })
      );

      return NextResponse.json(
        {
          ok: false,
          stage,
          error: "ثبت شناسه پیام برای جلوگیری از تکرار ناموفق بود.",
        },
        { status: 500 }
      );
    }

    claimCreated = true;

    // ذخیره پیام اصلی
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
      throw new Error(
        `ثبت پیام در Supabase ناموفق بود: ${saveError.message}`
      );
    }

    // دریافت پاسخ از دستیار فعلی
    stage = "assistant_request";

    const assistantUrl = new URL(
      "/api/assistant",
      req.url
    );

    const aiResponse = await fetch(
      assistantUrl.toString(),
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

    if (!aiResponse.ok) {
      const errorBody = await aiResponse
        .text()
        .catch(() => "");

      throw new Error(
        `سرویس دستیار خطا داد (${aiResponse.status}): ${errorBody.slice(0, 300)}`
      );
    }

    stage = "assistant_parse";

    const aiData: any = await aiResponse.json();

    const answer =
      aiData?.answer ??
      aiData?.response ??
      null;

    if (
      typeof answer !== "string" ||
      !answer.trim()
    ) {
      throw new Error(
        "پاسخ متنی معتبر از سرویس دستیار دریافت نشد."
      );
    }

    // تنظیمات ربات بله
    stage = "bale_config";

    const token = env?.BALE_SMART_TOKEN;

    if (!token) {
      throw new Error(
        "متغیر BALE_SMART_TOKEN تنظیم نشده است."
      );
    }

    // پیش از ارسال، تلاش ارسال را علامت می‌زنیم.
    // در صورت مبهم بودن نتیجه درخواست، شناسه را حذف نمی‌کنیم
    // تا ارسال مجدد همان پیام موجب پاسخ تکراری نشود.
    stage = "bale_send_message";
    sendAttempted = true;

    const sendUrl =
      `https://tapi.bale.ai/bot${token}/sendMessage`;

    const sendPayload: Record<string, unknown> = {
      chat_id: chatId,
      text: answer.trim().slice(0, 4000),
      reply_to_message_id: messageId,
    };

    const baleResponse = await fetch(sendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sendPayload),
    });

    const baleData: any = await baleResponse
      .json()
      .catch(() => null);

    if (!baleResponse.ok || baleData?.ok !== true) {
      console.error(
        "[BALE_WEBHOOK_STAGE_ERROR]",
        JSON.stringify({
          stage,
          status: baleResponse.status,
          error_code: baleData?.error_code ?? null,
          description: baleData?.description ?? null,
          chat_id: chatIdString,
          message_id: messageIdString,
        })
      );

      return NextResponse.json(
        {
          ok: false,
          stage,
          error: "ارسال پاسخ به بله ناموفق بود.",
          bale_http_status: baleResponse.status,
          bale_error_code: baleData?.error_code ?? null,
          bale_description: baleData?.description ?? null,
          message_id: savedMessage.id,
        },
        { status: 502 }
      );
    }

    console.log(
      "[BALE_WEBHOOK_SUCCESS]",
      JSON.stringify({
        stage: "completed",
        saved_message_id: savedMessage.id,
        incoming_message_id: messageIdString,
        bale_ok: true,
      })
    );

    return NextResponse.json({
      ok: true,
      received: true,
      message_id: savedMessage.id,
      sender,
      chat_id: chatIdString,
      reply_to_message_id: messageIdString,
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

    console.error(
      "[BALE_WEBHOOK_ERROR]",
      JSON.stringify({
        stage,
        error: errorMessage,
      })
    );

    // اگر هنوز تلاش ارسال پاسخ شروع نشده، اجازه می‌دهیم
    // وب‌هوک در تلاش بعدی دوباره پردازش شود.
    if (
      claimCreated &&
      !sendAttempted &&
      supabase &&
      claimedChatId !== null &&
      claimedMessageId !== null
    ) {
      const { error: releaseError } = await supabase
        .from("bale_processed_messages")
        .delete()
        .eq("chat_id", claimedChatId)
        .eq("message_id", claimedMessageId);

      if (releaseError) {
        console.error(
          "[BALE_WEBHOOK_CLAIM_RELEASE_ERROR]",
          JSON.stringify({
            error: releaseError.message,
          })
        );
      }
    }

    return NextResponse.json(
      {
        ok: false,
        stage,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}


import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { POST as assistantPost } from "../../assistant/route";

const KNOWN_BALE_BOT_ID = "502859097";
const KNOWN_BALE_BOT_USERNAME = "mmm532bot";

function normalizeUsername(value: unknown): string {
  return String(value ?? "")
    .replace(/^@/, "")
    .toLowerCase();
}

function normalizeText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200c\u200d]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isKnownBot(
  sender: any,
  configuredBotId: unknown
): boolean {
  if (!sender || typeof sender !== "object") {
    return false;
  }

  const username = normalizeUsername(
    sender.username ?? sender.user_name
  );

  const id =
    sender.id ??
    sender.user_id ??
    sender.sender_id;

  return (
    sender.is_bot === true ||
    username === KNOWN_BALE_BOT_USERNAME ||
    (
      id != null &&
      (
        String(id) === KNOWN_BALE_BOT_ID ||
        (
          configuredBotId != null &&
          String(id) === String(configuredBotId)
        )
      )
    )
  );
}

export async function POST(req: Request) {
  let stage = "initialize";
  let supabase: any = null;

  let claimCreated = false;
  let sendAttempted = false;

  let claimChatId = "";
  let claimMessageId = "";

  const ignored = (
    reason: string,
    details: Record<string, unknown> = {}
  ) =>
    NextResponse.json({
      ok: true,
      ignored: true,
      reason,
      ...details,
    });

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
        {
          ok: false,
          error: "دسترسی غیرمجاز",
        },
        { status: 401 }
      );
    }

    stage = "parse_payload";

    const payload: any = await req
      .json()
      .catch(() => null);

    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        {
          ok: false,
          error: "بدنه درخواست معتبر نیست.",
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

    const senderId =
      senderObject?.id ??
      senderObject?.user_id ??
      senderObject?.sender_id ??
      null;

    const configuredBotId = (
      env as unknown as Record<string, unknown>
    )?.BALE_BOT_ID;

    console.log(
  "[BALE_INCOMING_DIAGNOSTIC]",
  JSON.stringify({
    update_id: payload?.update_id ?? null,
    message_id: messageId ?? null,
    chat_id: chatId ?? null,
    text:
      typeof text === "string"
        ? text.slice(0, 200)
        : null,
    sender_id: senderId ?? null,
    sender_username:
      senderObject?.username ??
      senderObject?.user_name ??
      null,
    sender_is_bot:
      senderObject?.is_bot ?? null,
    message_date: message?.date ?? null,
    reply_to_message_id:
      message?.reply_to_message?.message_id ??
      message?.reply_to_message?.id ??
      message?.reply_to_message_id ??
      null,
  })
);

    // پیام خود ربات یا ربات شناخته‌شده نباید پردازش شود.
    if (isKnownBot(senderObject, configuredBotId)) {
      return ignored("bot_message");
    }

    if (typeof text !== "string" || !text.trim()) {
      return ignored("no_text");
    }

    const normalizedText = normalizeText(text);

    // فقط پیام‌هایی که مدیر هوشمند را خطاب می‌کنند.
    if (!/مدیر\s*هوشمند/u.test(normalizedText)) {
      return ignored("assistant_not_mentioned");
    }

    if (
      chatId === null ||
      chatId === undefined ||
      messageId === null ||
      messageId === undefined ||
      String(messageId).trim() === ""
    ) {
      return ignored("missing_message_identity");
    }

    const allowedGroupId = String(
      env?.BALE_GROUP_ID || "4554953620"
    );

    if (String(chatId) !== allowedGroupId) {
      return ignored("group_not_allowed");
    }

    stage = "supabase_config";

    const supabaseUrl =
      env?.NEXT_PUBLIC_SUPABASE_URL;

    const supabaseKey =
      env?.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "Supabase configuration is incomplete"
      );
    }

    supabase = createClient(
      supabaseUrl,
      supabaseKey
    );

    claimChatId = String(chatId);
    claimMessageId = String(messageId);

    // جلوگیری از پردازش مجدد همان پیام.
    // قفل زمانی یا قفل بر اساس متن وجود ندارد.
    stage = "claim_message";

    const { error: claimError } = await supabase
      .from("bale_processed_messages")
      .insert({
        chat_id: claimChatId,
        message_id: claimMessageId,
      });

    if (claimError?.code === "23505") {
      console.log(
        "[BALE_DUPLICATE_IGNORED]",
        JSON.stringify({
          chat_id: claimChatId,
          message_id: claimMessageId,
        })
      );

      return ignored("duplicate_message");
    }

    if (claimError) {
      console.error(
        "[BALE_WEBHOOK_CLAIM_ERROR]",
        {
          code: claimError.code,
          message: claimError.message,
        }
      );

      throw new Error(
        "Could not register message for deduplication"
      );
    }

    claimCreated = true;

    // ثبت پیام دریافتی برای سابقه و بررسی‌های بعدی.
    stage = "supabase_insert";

    const {
      data: savedMessage,
      error: saveError,
    } = await supabase
      .from("messages")
      .insert({
        text: text.trim(),
        source: "bale",
        raw_data: payload,
      })
      .select("id")
      .single();

    if (saveError) {
      console.error(
        "[BALE_WEBHOOK_SAVE_ERROR]",
        {
          code: saveError.code ?? null,
          message: saveError.message,
        }
      );

      throw new Error(
        "ثبت پیام در Supabase ناموفق بود."
      );
    }

    // فراخوانی مستقیم مسیر داخلی دستیار.
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

    const aiResponse = await assistantPost(
      assistantRequest
    );

    if (!aiResponse.ok) {
      const details = await aiResponse
        .text()
        .catch(() => "");

      console.error(
        "[BALE_WEBHOOK_ASSISTANT_ERROR]",
        {
          status: aiResponse.status,
          details: details.slice(0, 500),
        }
      );

      throw new Error(
        `Assistant request failed with status ${aiResponse.status}`
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
        "پاسخ متنی معتبری از دستیار دریافت نشد."
      );
    }

    stage = "bale_config";

    const token = env?.BALE_SMART_TOKEN;

    if (!token) {
      throw new Error(
        "BALE_SMART_TOKEN تنظیم نشده است."
      );
    }

    const sendUrl =
      `https://tapi.bale.ai/bot${token}/sendMessage`;

    const sendPayload = {
      chat_id: chatId,
      text: answer.trim().slice(0, 4000),
      reply_to_message_id: messageId,
    };

    // از شروع ارسال به بعد، قفل پیام حفظ می‌شود؛
    // در صورت ابهام در نتیجه ارسال، ارسال مجدد خودکار
    // نباید موجب پاسخ تکراری شود.
    stage = "bale_send_message";
    sendAttempted = true;

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

    if (
      !baleResponse.ok ||
      baleData?.ok !== true
    ) {
      console.error(
        "[BALE_WEBHOOK_SEND_ERROR]",
        {
          status: baleResponse.status,
          error_code:
            baleData?.error_code ?? null,
          description:
            baleData?.description ?? null,
          message_id: claimMessageId,
        }
      );

      return NextResponse.json(
        {
          ok: false,
          stage,
          error: "ارسال پاسخ به بله ناموفق بود.",
          bale_http_status: baleResponse.status,
          bale_description:
            baleData?.description ?? null,
        },
        { status: 502 }
      );
    }

    const sentMessageId =
      baleData?.result?.message_id ??
      baleData?.result?.message?.message_id ??
      baleData?.message?.message_id ??
      null;

    // ثبت شناسه پیام خروجی ربات برای تشخیص احتمالی
    // همان پیام در صورتی که دوباره به وب‌هوک برسد.
    if (
      sentMessageId !== null &&
      sentMessageId !== undefined
    ) {
      stage = "register_outgoing_message";

      const { error: outgoingError } =
        await supabase
          .from("bale_processed_messages")
          .upsert(
            {
              chat_id: claimChatId,
              message_id: String(sentMessageId),
            },
            {
              onConflict: "chat_id,message_id",
              ignoreDuplicates: true,
            }
          );

      if (outgoingError) {
        console.error(
          "[BALE_OWN_MESSAGE_REGISTER_ERROR]",
          {
            message_id: String(sentMessageId),
            code: outgoingError.code ?? null,
            message: outgoingError.message,
          }
        );
      }
    }

    console.log(
      "[BALE_WEBHOOK_SUCCESS]",
      JSON.stringify({
        update_id: payload?.update_id ?? null,
        saved_message_id: savedMessage?.id ?? null,
        incoming_message_id: claimMessageId,
        outgoing_message_id:
          sentMessageId == null
            ? null
            : String(sentMessageId),
        chat_id: claimChatId,
        sender_id: senderId ?? null,
        ai_used: aiData?.ai_used ?? null,
        knowledge_match:
          aiData?.knowledge_match ?? null,
      })
    );

    return NextResponse.json({
      ok: true,
      received: true,
      message_id: savedMessage?.id ?? null,
      sender:
        senderObject?.first_name ??
        senderObject?.name ??
        senderObject?.username ??
        null,
      chat_id: chatId,
      reply_to_message_id: messageId,
      answer: answer.trim(),
      ai_used: aiData?.ai_used ?? null,
      knowledge_match:
        aiData?.knowledge_match ?? null,
      bale_ok: true,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      "[BALE_WEBHOOK_ERROR]",
      {
        stage,
        error: errorMessage,
        chat_id: claimChatId || null,
        message_id: claimMessageId || null,
        send_attempted: sendAttempted,
      }
    );

    // فقط پیش از شروع ارسال، قفل آزاد می‌شود
    // تا خطای موقت امکان تلاش مجدد داشته باشد.
    if (
      !sendAttempted &&
      claimCreated &&
      supabase &&
      claimChatId &&
      claimMessageId
    ) {
      const { error: releaseError } =
        await supabase
          .from("bale_processed_messages")
          .delete()
          .eq("chat_id", claimChatId)
          .eq("message_id", claimMessageId);

      if (releaseError) {
        console.error(
          "[BALE_MESSAGE_RELEASE_ERROR]",
          releaseError
        );
      }
    }

    return NextResponse.json(
      {
        ok: false,
        stage,
        error: "خطا در پردازش پیام",
      },
      { status: 500 }
    );
  }
}

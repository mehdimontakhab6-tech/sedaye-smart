
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

function isKnownBot(sender: any, configuredBotId: unknown): boolean {
  if (!sender || typeof sender !== "object") {
    return false;
  }

  const username = normalizeUsername(sender.username);
  const id = sender.id;

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
      payload?.from ??
      payload?.sender ??
      {};

    const replyMessage =
      message?.reply_to_message ??
      message?.replyToMessage ??
      message?.reply_to ??
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
        from: message?.from
          ? {
              id: message.from.id ?? null,
              is_bot: message.from.is_bot ?? null,
              username: message.from.username ?? null,
              first_name: message.from.first_name ?? null,
            }
          : null,
        sender: message?.sender
          ? {
              id: message.sender.id ?? null,
              is_bot: message.sender.is_bot ?? null,
              username: message.sender.username ?? null,
              name: message.sender.name ?? null,
            }
          : null,
        reply_to_message_id:
          replyMessage?.message_id ??
          replyMessage?.id ??
          null,
        reply_from: replyMessage?.from
          ? {
              id: replyMessage.from.id ?? null,
              is_bot: replyMessage.from.is_bot ?? null,
              username: replyMessage.from.username ?? null,
            }
          : null,
        reply_sender: replyMessage?.sender
          ? {
              id: replyMessage.sender.id ?? null,
              is_bot: replyMessage.sender.is_bot ?? null,
              username: replyMessage.sender.username ?? null,
            }
          : null,
        has_reply_to_message: Boolean(replyMessage),
      })
    );

    // فیلتر اصلی: پیام‌های خود ربات قبل از فراخوانی دستیار متوقف شوند.
    if (isKnownBot(senderObject, configuredBotId)) {
      console.log(
        "[BALE_BOT_MESSAGE_IGNORED]",
        JSON.stringify({
          message_id: messageId ?? null,
          chat_id: chatId ?? null,
        })
      );

      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "bot_message",
      });
    }

    // اگر پیام ریپلای به یکی از پیام‌های خود ربات باشد، پاسخ تازه نساز.
    const replySenderCandidates = [
      replyMessage?.from,
      replyMessage?.sender,
      replyMessage?.author,
      replyMessage?.sender_chat,
    ].filter(Boolean);

    if (
      replySenderCandidates.some((replySender: any) =>
        isKnownBot(replySender, configuredBotId)
      )
    ) {
      console.log(
        "[BALE_REPLY_TO_BOT_IGNORED]",
        JSON.stringify({
          message_id: messageId ?? null,
          chat_id: chatId ?? null,
          reply_to_message_id:
            replyMessage?.message_id ??
            replyMessage?.id ??
            null,
        })
      );

      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "reply_to_bot_message",
      });
    }

    if (!text) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "no_text",
      });
    }

    // فقط پیام انسانی که عبارت «مدیر هوشمند» را دارد.
    const normalizedText = normalizeText(text);

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
      throw new Error(
        "Supabase configuration is incomplete"
      );
    }

    supabase = createClient(
      supabaseUrl,
      supabaseKey
    );

    // جلوگیری اتمیک از پردازش مجدد همان شناسه پیام.
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
      console.log(
        "[BALE_DUPLICATE_IGNORED]",
        JSON.stringify({
          chat_id: claimChatId,
          message_id: claimMessageId,
        })
      );

      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "duplicate_message",
      });
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
          message: saveError.message,
          code: saveError.code ?? null,
        }
      );

      throw new Error(
        "ثبت پیام در Supabase ناموفق بود."
      );
    }

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

    const sendPayload: Record<string, unknown> = {
      chat_id: chatId,
      text: answer.trim().slice(0, 4000),
      reply_to_message_id: messageId,
    };

    stage = "bale_send_message";

    // بعد از شروع ارسال، شناسه ورودی حفظ شود تا تلاش مجدد
    // در صورت خطای مبهم، پاسخ تکراری نسازد.
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
      baleData?.result?.message_id;

    // ثبت شناسه پیام خروجی ربات در همان جدول برای کمک به تشخیص
    // برگشت احتمالی پیام ارسالی به وب‌هوک.
    if (
      sentMessageId !== null &&
      sentMessageId !== undefined
    ) {
      const { error: ownMessageError } =
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

      if (ownMessageError) {
        console.error(
          "[BALE_OWN_MESSAGE_REGISTER_ERROR]",
          {
            message_id: String(sentMessageId),
            code: ownMessageError.code ?? null,
            message: ownMessageError.message,
          }
        );
      }
    }

    console.log(
      "[BALE_WEBHOOK_SUCCESS]",
      JSON.stringify({
        saved_message_id:
          savedMessage?.id ?? null,
        sent_bale_message_id:
          sentMessageId ?? null,
        sent_by_bot_id:
          baleData?.result?.from?.id ?? null,
        sent_by_bot_is_bot:
          baleData?.result?.from?.is_bot ?? null,
        chat_id: claimChatId,
        reply_to_message_id: claimMessageId,
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
      answer,
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
      }
    );

    return NextResponse.json(
      {
        ok: false,
        stage,
        error: errorMessage,
      },
      { status: 500 }
    );
  } finally {
    if (
      claimCreated &&
      !keepClaim &&
      supabase
    ) {
      try {
        await supabase
          .from("bale_processed_messages")
          .delete()
          .eq("chat_id", claimChatId)
          .eq("message_id", claimMessageId);
      } catch (cleanupError) {
        console.error(
          "[BALE_WEBHOOK_CLEANUP_ERROR]",
          {
            error:
              cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError),
          }
        );
      }
    }
  }
}

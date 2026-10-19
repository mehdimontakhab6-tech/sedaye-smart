
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function POST(req: Request) {
  let stage = "initialize";

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
          stage: "authentication",
          error: "دسترسی غیرمجاز",
        },
        { status: 401 }
      );
    }

    stage = "parse_payload";

    const payload = await req.json().catch(() => null);

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

    // پشتیبانی از پیام عادی و پیام ویرایش‌شده
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
      payload?.message_id ??
      null;

    const sender =
      message?.from?.first_name ??
      message?.sender?.name ??
      payload?.sender?.name ??
      null;

    // جلوگیری از پاسخ به پیام‌های خود ربات
    if (
      message?.from?.is_bot === true ||
      message?.sender?.is_bot === true
    ) {
      return NextResponse.json({
        ok: true,
        received: false,
        ignored: true,
        reason: "bot_message",
      });
    }

    if (!text) {
      return NextResponse.json({
        ok: true,
        received: false,
        reason: "no_text",
        message: "در به‌روزرسانی دریافتی متن قابل‌پاسخ وجود ندارد.",
        has_message: Boolean(payload?.message),
        has_chat: Boolean(message?.chat),
      });
    }

    if (chatId === null || chatId === undefined) {
      return NextResponse.json(
        {
          ok: false,
          stage: "extract_chat_id",
          error: "شناسه گروه یا گفت‌وگو در پیام دریافتی پیدا نشد.",
          has_message: Boolean(payload?.message),
          message_keys:
            message && typeof message === "object"
              ? Object.keys(message)
              : [],
        },
        { status: 400 }
      );
    }

    // حفظ محدودیت گروه فعلی
    const allowedGroupId = String(
      env?.BALE_GROUP_ID || "4554953620"
    );

    if (String(chatId) !== allowedGroupId) {
      return NextResponse.json({
        ok: true,
        received: false,
        ignored: true,
        reason: "group_not_allowed",
      });
    }

    stage = "supabase_config";

    const supabaseUrl = env?.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        {
          ok: false,
          stage,
          error: "تنظیمات اتصال به Supabase کامل نیست.",
        },
        { status: 500 }
      );
    }

    stage = "supabase_insert";

    const supabase = createClient(
      supabaseUrl,
      supabaseKey
    );

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
      return NextResponse.json(
        {
          ok: false,
          stage,
          error: "ثبت پیام در Supabase انجام نشد.",
          details: saveError.message,
        },
        { status: 500 }
      );
    }

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

      return NextResponse.json(
        {
          ok: false,
          stage,
          error: "سرویس پاسخ‌گویی درخواست را با خطا پاسخ داد.",
          assistant_status: aiResponse.status,
          details: errorBody.slice(0, 1000),
        },
        { status: 502 }
      );
    }

    stage = "assistant_parse";

    const aiData = await aiResponse.json();

    const answer =
      aiData?.answer ??
      aiData?.response ??
      null;

    if (
      typeof answer !== "string" ||
      !answer.trim()
    ) {
      return NextResponse.json(
        {
          ok: false,
          stage,
          error: "پاسخ متنی معتبر از سرویس هوش مصنوعی دریافت نشد.",
          message_id: savedMessage.id,
        },
        { status: 502 }
      );
    }

    stage = "bale_config";

    const token = env?.BALE_SMART_TOKEN;

    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          stage,
          error: "متغیر BALE_SMART_TOKEN تنظیم نشده است.",
          message_id: savedMessage.id,
        },
        { status: 500 }
      );
    }

    stage = "bale_send_message";

    const sendUrl =
      `https://tapi.bale.ai/bot${token}/sendMessage`;

    const sendPayload: Record<string, unknown> = {
      chat_id: chatId,
      text: answer.trim().slice(0, 4000),
    };

    if (messageId !== null && messageId !== undefined) {
      sendPayload.reply_to_message_id = messageId;
    }

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
      return NextResponse.json(
        {
          ok: false,
          stage,
          error: "ارسال پاسخ به بله ناموفق بود.",
          bale_http_status: baleResponse.status,
          bale_error_code: baleData?.error_code ?? null,
          bale_description: baleData?.description ?? null,
          chat_id: chatId,
          reply_to_message_id: messageId,
          message_id: savedMessage.id,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      received: true,
      message_id: savedMessage.id,
      sender,
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
      : "خطای ناشناخته";

  console.error(
    "[BALE_WEBHOOK_ERROR]",
    JSON.stringify({
      stage,
      error: errorMessage,
    })
  );

  return NextResponse.json(
    {
      ok: false,
      stage,
      error: errorMessage,
    },
    { status: 500 }
  );
  }

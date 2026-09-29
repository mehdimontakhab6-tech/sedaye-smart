import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function POST(req: Request) {
  try {
    const { env } = await getCloudflareContext({ async: true });

    const secret = env?.BALE_WEBHOOK_SECRET;

    if (
      secret &&
      req.headers.get("x-bale-secret") !== secret
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "دسترسی غیرمجاز"
        },
        { status: 401 }
      );
    }

    const payload = await req.json().catch(() => ({}));

    const text =
      payload?.text ??
      payload?.message?.text ??
      payload?.message?.body ??
      "";

    const sender =
      payload?.sender?.name ??
      payload?.message?.sender?.name ??
      null;

    const chatId =
      payload?.chat_id ??
      payload?.message?.chat_id ??
      payload?.message?.chat?.id ??
      null;

    if (!text?.trim()) {
      return NextResponse.json({
        ok: true,
        received: false,
        message: "پیام متنی دریافت نشد."
      });
    }

    const allowedGroupId = String(
      env?.BALE_GROUP_ID || "4554953620"
    );

    if (
      chatId &&
      String(chatId) !== allowedGroupId
    ) {
      return NextResponse.json({
        ok: true,
        received: false,
        ignored: true,
        reason: "group_not_allowed"
      });
    }

    const url = env?.NEXT_PUBLIC_SUPABASE_URL;
    const key = env?.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      return NextResponse.json(
        {
          ok: false,
          error: "اتصال به Supabase تنظیم نشده است."
        },
        { status: 500 }
      );
    }

    const supabase = createClient(url, key);

    const { data: message, error: messageError } =
      await supabase
        .from("messages")
        .insert({
          text: text.trim(),
          source: "bale",
          raw_data: payload
        })
        .select("id")
        .single();

    if (messageError) {
      return NextResponse.json(
        {
          ok: false,
          error: "ثبت پیام انجام نشد.",
          details: messageError.message
        },
        { status: 500 }
      );
    }

    const assistantUrl = new URL(
      "/api/assistant",
      req.url
    );

    const aiResponse = await fetch(
      assistantUrl.toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question: text.trim()
        })
      }
    );

    const aiData = await aiResponse.json();

    const answer =
      aiData?.answer ??
      aiData?.response ??
      "در حال حاضر امکان تهیه پاسخ وجود ندارد.";

    // ارسال پاسخ با ربات جدید «مدیر هوشمند گروه»
    const token = env?.BALE_SMART_TOKEN;

    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error: "BALE_SMART_TOKEN تنظیم نشده است.",
          message_id: message.id,
          ai_answer: answer
        },
        { status: 500 }
      );
    }

    const sendUrl =
      `https://tapi.bale.ai/bot${token}/sendMessage`;

    const baleResponse = await fetch(
      sendUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: String(answer),
          reply_to_message_id:
            payload?.message?.message_id ??
            payload?.message_id ??
            undefined
        })
      }
    );

    const baleData =
      await baleResponse.json().catch(() => ({}));

    return NextResponse.json({
      ok: true,
      received: true,
      message_id: message.id,
      sender,
      chat_id: chatId,
      answer,
      ai_used: aiData?.ai_used ?? null,
      knowledge_match:
        aiData?.knowledge_match ?? null,
      bale_ok: baleData?.ok ?? false
    });

  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "خطای ناشناخته"
      },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const secret = process.env.BALE_WEBHOOK_SECRET;

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
    null;

  if (!text?.trim()) {
    return NextResponse.json({
      ok: true,
      received: false,
      message: "پیام متنی دریافت نشد."
    });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

  // ثبت پیام خام
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
        error: "ثبت پیام انجام نشد."
      },
      { status: 500 }
    );
  }

  // ارسال پیام به مدیر هوشمند
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL;

  if (baseUrl) {
    try {
      await fetch(
        `${baseUrl}/api/manager/process`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            text: text.trim(),
            message_id: message.id,
            sender,
            chat_id: chatId
          })
        }
      );
    } catch {
      // ثبت پیام انجام شده است؛
      // خطای تحلیل نباید دریافت پیام را متوقف کند.
    }
  }

  return NextResponse.json({
    ok: true,
    received: true,
    message_id: message.id,
    sender,
    chat_id: chatId
  });
}

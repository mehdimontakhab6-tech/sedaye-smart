import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const secret = process.env.BALE_WEBHOOK_SECRET;

  if (
    secret &&
    req.headers.get("x-bale-secret") !== secret
  ) {
    return NextResponse.json(
      { ok: false },
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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && key && text) {
    const supabase = createClient(url, key);

    await supabase.from("messages").insert({
      text,
      source: "bale",
      raw_data: payload
    });
  }

  return NextResponse.json({
    ok: true,
    received: Boolean(text),
    sender,
    chat_id: chatId
  });
}

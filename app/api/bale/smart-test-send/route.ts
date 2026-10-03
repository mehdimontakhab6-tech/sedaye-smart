import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET() {
  try {
    const { env } = await getCloudflareContext({ async: true });

    const token = env?.BALE_SMART_TOKEN;
    const chatId = String(env?.BALE_GROUP_ID || "4554953620");

    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error: "BALE_SMART_TOKEN تنظیم نشده است."
        },
        { status: 500 }
      );
    }

    const response = await fetch(
      `https://tapi.bale.ai/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: chatId,
          text:
            "🤖 تست مستقیم ربات «مدیر هوشمند گروه»\n\n" +
            "اتصال ارسال پیام با BALE_SMART_TOKEN با موفقیت بررسی شد."
        })
      }
    );

    const result = await response.json().catch(() => ({}));

    return NextResponse.json({
      ok: response.ok && result?.ok === true,
      bale_status: response.status,
      bale: result
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

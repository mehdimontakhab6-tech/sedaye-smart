import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET() {
  try {
    const { env } = await getCloudflareContext({ async: true });

    const token = env?.BALE_SMART_TOKEN;

    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error: "BALE_SMART_TOKEN تنظیم نشده است."
        },
        { status: 500 }
      );
    }

    const webhookUrl =
      "https://sedaye-smart.mehdimontakhab6.workers.dev/api/bale/webhook";

    const response = await fetch(
      `https://tapi.bale.ai/bot${token}/setWebhook`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url: webhookUrl
        })
      }
    );

    const result = await response.json().catch(() => ({}));

    return NextResponse.json({
      ok: response.ok,
      bot: "mmm532bot",
      webhook_url: webhookUrl,
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

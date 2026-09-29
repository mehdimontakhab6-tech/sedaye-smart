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

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 5000);

    try {
      const response = await fetch(
        `https://tapi.bale.ai/bot${token}/setWebhook`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            url: webhookUrl
          }),
          signal: controller.signal
        }
      );

      const text = await response.text();

      return NextResponse.json({
        ok: response.ok,
        bot: "mmm532bot",
        webhook_url: webhookUrl,
        bale_status: response.status,
        bale_response: text
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        bot: "mmm532bot",
        error:
          error instanceof Error
            ? error.name === "AbortError"
              ? "Bale API timeout after 5 seconds"
              : error.message
            : "Unknown error"
      },
      { status: 504 }
    );
  }
}

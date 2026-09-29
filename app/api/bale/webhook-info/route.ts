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

    const baseUrl = `https://tapi.bale.ai/bot${token}`;

    const meResponse = await fetch(`${baseUrl}/getMe`);
    const meData = await meResponse.json().catch(() => ({}));

    const webhookResponse = await fetch(
      `${baseUrl}/getWebhookInfo`
    );
    const webhookData = await webhookResponse
      .json()
      .catch(() => ({}));

    return NextResponse.json({
      ok: true,
      bot: meData,
      webhook: webhookData
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

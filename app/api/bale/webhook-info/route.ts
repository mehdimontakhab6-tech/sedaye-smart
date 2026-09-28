import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET() {
  try {
    const { env } = await getCloudflareContext({ async: true });

    const token = env?.BALE_TOKEN;

    if (!token) {
      return NextResponse.json({
        ok: false,
        error: "BALE_TOKEN تنظیم نشده است."
      });
    }

    const response = await fetch(
      `https://tapi.bale.ai/bot${token}/getWebhookInfo`
    );

    const data = await response.json().catch(() => ({}));

    return NextResponse.json({
      ok: true,
      webhook: data
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "خطای ناشناخته"
    });
  }
}

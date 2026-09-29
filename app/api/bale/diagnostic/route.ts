import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

async function readResponse(response: Response) {
  const text = await response.text();

  let data: unknown = null;

  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return {
    http_status: response.status,
    http_ok: response.ok,
    content_type: response.headers.get("content-type"),
    data
  };
}

export async function GET() {
  const startedAt = Date.now();

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

    const results: Record<string, unknown> = {};

    try {
      const response = await fetch(`${baseUrl}/getMe`, {
        method: "GET",
        signal: AbortSignal.timeout(10000)
      });

      results.getMe = await readResponse(response);
    } catch (error) {
      results.getMe = {
        network_error:
          error instanceof Error
            ? error.message
            : "Unknown error"
      };
    }

    try {
      const response = await fetch(
        `${baseUrl}/getWebhookInfo`,
        {
          method: "GET",
          signal: AbortSignal.timeout(10000)
        }
      );

      results.getWebhookInfo =
        await readResponse(response);
    } catch (error) {
      results.getWebhookInfo = {
        network_error:
          error instanceof Error
            ? error.message
            : "Unknown error"
      };
    }

    return NextResponse.json({
      ok: true,
      bot: "mmm532bot",
      api_host: "tapi.bale.ai",
      elapsed_ms: Date.now() - startedAt,
      results
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

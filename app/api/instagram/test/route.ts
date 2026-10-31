
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { env } = getCloudflareContext();

    const apiKey = (
      env as unknown as Record<string, string | undefined>
    ).TOOLZERHUB_API_KEY?.trim();

    if (!apiKey) {
      return Response.json({
        ok: false,
        step: "secret-check",
        message: "Cloudflare Secret not found",
      }, { status: 500 });
    }

    const response = await fetch(
      "https://api.toolzerhub.com/v1/credits",
      {
        headers: {
          "x-api-key": apiKey,
          "Accept": "application/json",
        },
        cache: "no-store",
      }
    );

    const body = await response.text();

    let data: any = null;
    try {
      data = JSON.parse(body);
    } catch {}

    return Response.json({
      ok: response.ok,
      test: "toolzerhub-key-check",
      httpStatus: response.status,
      balance: data?.data?.balance ?? null,
      allowance: data?.data?.allowance ?? null,
      error: data?.error?.message ?? null,
      message: response.ok
        ? "API key accepted"
        : "API key rejected",
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error
        ? error.message
        : String(error),
    }, { status: 500 });
  }
}

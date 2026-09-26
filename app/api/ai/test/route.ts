import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { env } = getCloudflareContext();
    const ai = (env as any).AI;

    if (!ai) {
      return Response.json(
        {
          ok: false,
          error: "Cloudflare AI binding پیدا نشد."
        },
        { status: 500 }
      );
    }

    const result = await ai.run("@cf/meta/llama-3.1-8b-instruct-fast", {
      messages: [
        {
          role: "system",
          content: "You are a helpful Persian assistant."
        },
        {
          role: "user",
          content: "در یک جمله بگو هوش مصنوعی فعال است."
        }
      ]
    });

    return Response.json({
      ok: true,
      result
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

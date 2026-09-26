import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { env } = getCloudflareContext();

    const ai = (env as any).AI;

    if (!ai) {
      return Response.json({
        ok: false,
        step: "binding",
        error: "AI binding پیدا نشد"
      });
    }

    const result = await ai.run(
      "@cf/google/gemma-4-26b-a4b-it",
      {
        messages: [
          {
            role: "system",
            content: "You are a helpful Persian assistant."
          },
          {
            role: "user",
            content: "فقط بنویس: هوش مصنوعی سامانه فعال است."
          }
        ],
        chat_template_kwargs: {
          enable_thinking: false
        }
      }
    );

    return Response.json({
      ok: true,
      step: "ai",
      result
    });

  } catch (error) {
    return Response.json(
      {
        ok: false,
        step: "runtime",
        error: error instanceof Error
          ? error.message
          : String(error)
      },
      { status: 500 }
    );
  }
}

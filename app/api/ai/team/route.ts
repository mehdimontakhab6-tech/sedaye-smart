import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "edge";

function extractAnswer(result: any): string {
  if (!result) return "";

  const content =
    result?.choices?.[0]?.message?.content;

  if (
    typeof content === "string" &&
    content.trim()
  ) {
    return content.trim();
  }

  if (
    typeof result?.response === "string" &&
    result.response.trim()
  ) {
    return result.response.trim();
  }

  if (
    typeof result?.text === "string" &&
    result.text.trim()
  ) {
    return result.text.trim();
  }

  if (
    typeof result?.output === "string" &&
    result.output.trim()
  ) {
    return result.output.trim();
  }

  return "";
}

export async function POST(
  req: NextRequest
) {
  try {
    const body =
      await req.json();

    const question =
      String(
        body?.question || ""
      ).trim();

    if (!question) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "لطفاً پرسش خود را وارد کنید.",
        },
        {
          status: 400,
        }
      );
    }

    const context =
      await getCloudflareContext({
        async: true,
      });

    const env =
      context.env as any;

    if (!env?.AI) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "اتصال Cloudflare AI در Worker پیدا نشد.",
        },
        {
          status: 500,
        }
      );
    }

    const systemPrompt = `
تو «مدیر پاسخگو هوشمند» گروه «صدای کارکنان ثبت احوال» هستی.

وظیفه تو پاسخ‌گویی به پرسش‌های کارکنان
به زبان فارسی، دقیق، روشن، محترمانه و کاربردی است.

قواعد:

1. اطلاعات جعلی تولید نکن.

2. قانون، بخشنامه، دستورالعمل یا آمار را
بدون منبع معتبر رسمی قطعی اعلام نکن.

3. اگر پاسخ قطعی نیست، صادقانه بگو
که نیاز به بررسی بیشتر دارد.

4. پاسخ‌ها مستقیم و قابل فهم باشند.

5. در صورت نیاز مراحل را شماره‌گذاری کن.

6. موضوعات مربوط به مسائل، پیشنهادها،
درخواست‌ها و تجربه‌های کارکنان را
تحلیلی و مسئولانه بررسی کن.

7. نام تو «مدیر پاسخگو هوشمند» است.

8. از نام «صدایار» استفاده نکن.
`;

    let result: any;

    try {
      result =
        await env.AI.run(
          "@cf/google/gemma-4-26b-a4b-it",
          {
            messages: [
              {
                role: "system",
                content:
                  systemPrompt,
              },
              {
                role: "user",
                content:
                  question,
              },
            ],
            max_tokens: 1500,
            temperature: 0.2,
          }
        );
    } catch (aiError: any) {
      console.error(
        "WORKERS AI ERROR:",
        aiError
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "خطا هنگام اجرای هوش مصنوعی.",
          details:
            aiError?.message ||
            String(aiError),
        },
        {
          status: 502,
        }
      );
    }

    const answer =
      extractAnswer(result);

    if (!answer) {
      console.error(
        "EMPTY AI RESPONSE:",
        result
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "هوش مصنوعی اجرا شد اما پاسخ متنی برنگرداند.",
        },
        {
          status: 502,
        }
      );
    }

    return NextResponse.json({
      ok: true,
      answer,
      manager: {
        name:
          "مدیر پاسخگو هوشمند",
        model:
          "@cf/google/gemma-4-26b-a4b-it",
      },
    });
  } catch (error: any) {
    console.error(
      "AI TEAM ROUTE ERROR:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "خطا در مسیر مدیر پاسخگو هوشمند.",
        details:
          error?.message ||
          String(error),
      },
      {
        status: 500,
      }
    );
  }
}

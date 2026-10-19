
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const MODEL = "@cf/google/gemma-4-26b-a4b-it";

const OPENING =
  "با سلام و احترام\n\n" +
  "همکار گرامی، من مدیر هوشمند گروه هستم و برای پاسخ گویی به پرسش ها، بررسی مسائل و ارائه پیشنهادهای کاربردی در خدمت می باشم.\n\n";

// یکسان‌سازی نام دستیار
function fixAssistantName(text: string): string {
  return text.replace(
    /مدیر[\s\u200c\u200d]*پاسخگو(?:ی)?[\s\u200c\u200d]*هوشمند/giu,
    "مدیر هوشمند"
  );
}

// استخراج پاسخ از خروجی معمولی Cloudflare AI
function extractAnswer(result: any): string {
  if (!result) return "";

  const content = result?.choices?.[0]?.message?.content;

  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  for (const key of ["response", "text", "output"]) {
    if (typeof result?.[key] === "string" && result[key].trim()) {
      return result[key].trim();
    }
  }

  return "";
}

// استخراج متن از رویدادهای جریانی مدل
function extractStreamText(payload: any): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  if (typeof payload.response === "string") {
    return payload.response;
  }

  const choice = payload.choices?.[0];

  if (typeof choice?.delta?.content === "string") {
    return choice.delta.content;
  }

  if (typeof choice?.message?.content === "string") {
    return choice.message.content;
  }

  if (typeof payload.text === "string") {
    return payload.text;
  }

  return "";
}

export async function POST(req: NextRequest) {
  try {
    let body: any;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "درخواست ارسالی معتبر نیست.",
        },
        { status: 400 }
      );
    }

    const question = String(body?.question ?? "").trim();

    if (!question) {
      return NextResponse.json(
        {
          ok: false,
          error: "لطفاً پرسش خود را وارد کنید.",
        },
        { status: 400 }
      );
    }

    const context = await getCloudflareContext({
      async: true,
    });

    const env = context.env as any;

    if (!env?.AI) {
      return NextResponse.json(
        {
          ok: false,
          error: "اتصال Cloudflare AI در Worker پیدا نشد.",
        },
        { status: 500 }
      );
    }

    const systemPrompt = `
تو «مدیر هوشمند» گروه «صدای کارکنان ثبت احوال» هستی.

وظیفه تو پاسخ‌گویی به پرسش‌های کارکنان به زبان فارسی،
دقیق، روشن، محترمانه و کاربردی است.

قواعد مهم:

1. اطلاعات جعلی تولید نکن.
2. قانون، بخشنامه، دستورالعمل یا آمار را بدون منبع معتبر
   رسمی، قطعی اعلام نکن.
3. اگر پاسخ قطعی نیست، صادقانه بگو که نیاز به بررسی بیشتر دارد.
4. پاسخ را مستقیم، روشن و کاربردی ارائه کن.
5. در صورت نیاز، مراحل را شماره‌گذاری کن.
6. مسائل و پیشنهادهای کارکنان را تحلیلی و مسئولانه بررسی کن.
7. نام تو فقط «مدیر هوشمند» است.
8. از نام «صدایار» استفاده نکن.
9. پاسخ نهایی باید فارسی باشد، مگر اینکه کاربر زبان دیگری بخواهد.
10. متن مقدمه ثابت را سرور به پاسخ اضافه می‌کند.
    بنابراین مقدمه، سلام و عبارت «همکار گرامی» را خودت تکرار نکن.
11. مستقیماً پاسخ پرسش کاربر را ادامه بده.
`;

    let result: any;

    try {
      result = await env.AI.run(MODEL, {
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: question,
          },
        ],
        max_tokens: 1200,
        temperature: 0.2,
        stream: true,
      });
    } catch (aiError: any) {
      console.error("WORKERS AI ERROR:", aiError);

      return NextResponse.json(
        {
          ok: false,
          error: "خطا هنگام اجرای هوش مصنوعی.",
          details: aiError?.message || String(aiError),
        },
        { status: 502 }
      );
    }

    // اگر مدل خروجی جریانی نداد، پاسخ معمولی را مدیریت کن.
    if (
      !result ||
      typeof result.getReader !== "function"
    ) {
      const rawAnswer = fixAssistantName(extractAnswer(result));

      if (!rawAnswer) {
        return NextResponse.json(
          {
            ok: false,
            error: "هوش مصنوعی پاسخ متنی برنگرداند.",
          },
          { status: 502 }
        );
      }

      // جلوگیری از تکرار مقدمه در حالت پاسخ معمولی
      const cleanAnswer = rawAnswer
        .replace(/^\s*با سلام و احترام\s*/u, "")
        .replace(
          /^\s*همکار گرامی،?\s*/u,
          ""
        )
        .trim();

      return new Response(
        OPENING + cleanAnswer,
        {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Content-Type-Options": "nosniff",
            "X-Accel-Buffering": "no",
          },
        }
      );
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const upstream = result as ReadableStream<Uint8Array>;

    const output = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = upstream.getReader();

        let buffer = "";
        let pendingText = "";
        let closed = false;

        const emitText = (text: string) => {
          if (!text || closed) return;

          controller.enqueue(
            encoder.encode(fixAssistantName(text))
          );
        };

        // متن را با حفظ انتهای احتمالی عبارت‌های چندبخشی پردازش می‌کند.
        const addText = (text: string) => {
          if (!text || closed) return;

          pendingText += text;

          // انتهای متن را نگه می‌داریم تا نام دستیار
          // اگر بین دو بخش تقسیم شد، قابل اصلاح باشد.
          if (pendingText.length > 100) {
            let cutAt = pendingText.length - 100;

            const namePattern =
              /مدیر[\s\u200c\u200d]*پاسخگو(?:ی)?[\s\u200c\u200d]*هوشمند/giu;

            for (const match of pendingText.matchAll(namePattern)) {
              const start = match.index ?? 0;
              const end = start + match[0].length;

              if (start < cutAt && end > cutAt) {
                cutAt = start;
                break;
              }
            }

            if (cutAt > 0) {
              emitText(pendingText.slice(0, cutAt));
              pendingText = pendingText.slice(cutAt);
            }
          }
        };

        const processLine = (line: string) => {
          const trimmed = line.trim();

          if (!trimmed || trimmed.startsWith(":")) {
            return;
          }

          const data = trimmed.startsWith("data:")
            ? trimmed.slice(5).trim()
            : trimmed;

          if (!data || data === "[DONE]") {
            return;
          }

          try {
            const payload = JSON.parse(data);
            const text = extractStreamText(payload);
            addText(text);
          } catch {
            // اگر خط یک رویداد کامل JSON نباشد،
            // تا رسیدن ادامه آن در buffer نگه داشته می‌شود.
          }
        };

        try {
          // مقدمه ثابت بلافاصله به مرورگر ارسال می‌شود.
          controller.enqueue(encoder.encode(OPENING));

          while (true) {
            const { value, done } = await reader.read();

            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              processLine(line);
            }
          }

          buffer += decoder.decode();

          if (buffer.trim()) {
            processLine(buffer);
          }

          if (pendingText) {
            emitText(pendingText);
            pendingText = "";
          }

          closed = true;
          controller.close();
        } catch (error) {
          console.error("AI STREAM ERROR:", error);

          if (!closed) {
            closed = true;
            controller.error(error);
          }
        } finally {
          reader.releaseLock();
        }
      },
    });

    return new Response(output, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: any) {
    console.error("AI TEAM ROUTE ERROR:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "خطا در مسیر مدیر هوشمند.",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

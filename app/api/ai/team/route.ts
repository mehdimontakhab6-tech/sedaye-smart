import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type AIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ModelResult = {
  [key: string]: any;
};

const MODELS = {
  manager: "@cf/qwen/qwen3-30b-a3b-fp8",
  assistant: "@cf/google/gemma-4-26b-a4b-it",
  researcher: "@cf/qwen/qwen3-30b-a3b-fp8",
  analyst: "@cf/zai-org/glm-4.7-flash",
};

function extractText(result: ModelResult): string {
  if (!result) return "";

  const choice = result?.choices?.[0];

  if (typeof choice?.message?.content === "string") {
    return choice.message.content.trim();
  }

  if (Array.isArray(choice?.message?.content)) {
    const text = choice.message.content
      .map((item: any) => {
        if (typeof item === "string") return item;
        return item?.text || item?.content || "";
      })
      .join("");

    if (text.trim()) return text.trim();
  }

  if (typeof choice?.text === "string") {
    return choice.text.trim();
  }

  if (typeof result?.output_text === "string") {
    return result.output_text.trim();
  }

  if (typeof result?.response === "string") {
    return result.response.trim();
  }

  if (typeof result?.text === "string") {
    return result.text.trim();
  }

  return "";
}

async function runModel(
  model: string,
  messages: AIMessage[],
  maxTokens = 1200
): Promise<string> {
  const { env } = getCloudflareContext();

  if (!env?.AI) {
    throw new Error("اتصال به موتور هوش مصنوعی Cloudflare برقرار نیست.");
  }

  const options: any = {
    messages,
    max_tokens: maxTokens,
    temperature: 0.2,
  };

  if (model === MODELS.assistant) {
    options.chat_template_kwargs = {
      enable_thinking: false,
    };
  }

  const result = await env.AI.run(model, options);

  const text = extractText(result);

  if (!text) {
    throw new Error(
      `مدل ${model} پاسخ قابل استخراج برنگرداند.`
    );
  }

  return text;
}

function cleanRoute(route: string): string {
  const value = String(route || "")
    .toUpperCase()
    .replace(/```/g, "")
    .trim();

  if (value.includes("OFFICIAL")) return "OFFICIAL";
  if (value.includes("ANALYSIS")) return "ANALYSIS";
  if (value.includes("SUGGESTION")) return "SUGGESTION";

  return "GENERAL";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question = String(body?.question || "").trim();

    if (!question) {
      return NextResponse.json(
        {
          error: "لطفاً پرسش خود را وارد کنید.",
        },
        { status: 400 }
      );
    }

    // =========================================================
    // 1. مدیر پاسخگو هوشمند
    // =========================================================

    let route = "GENERAL";
    let managerError = "";

    try {
      const managerRaw = await runModel(
        MODELS.manager,
        [
          {
            role: "system",
            content: `
تو «مدیر پاسخگو هوشمند» گروه «صدای کارکنان ثبت احوال» هستی.

درخواست کاربر را فقط در یکی از این چهار دسته قرار بده:

GENERAL
OFFICIAL
ANALYSIS
SUGGESTION

GENERAL = پرسش عمومی یا گفت‌وگوی معمولی
OFFICIAL = مقررات، بخشنامه، دستورالعمل یا اطلاعات رسمی سازمان
ANALYSIS = تحلیل، بررسی روند، مقایسه یا تحلیل داده
SUGGESTION = پیشنهاد، ایده یا راهکار برای بهبود

فقط نام دسته را برگردان.
`,
          },
          {
            role: "user",
            content: question,
          },
        ],
        200
      );

      route = cleanRoute(managerRaw);
    } catch (error: any) {
      managerError =
        error?.message || "مدیر پاسخگو هوشمند در دسترس نبود.";

      // اگر مدیر خطا کرد، سامانه متوقف نمی‌شود.
      route = "GENERAL";
    }

    // =========================================================
    // 2. عضو متخصص تیم
    // =========================================================

    let specialistResult = "";
    let specialistError = "";

    try {
      if (route === "OFFICIAL") {
        specialistResult = await runModel(
          MODELS.researcher,
          [
            {
              role: "system",
              content: `
تو پژوهشگر هوشمند گروه «صدای کارکنان ثبت احوال» هستی.

بدون منبع معتبر، مقررات یا دستورالعمل رسمی جعل نکن.

اگر منبع معتبر در اختیار نیست، صریحاً بگو:

«برای ارائه پاسخ رسمی، اطلاعات معتبر کافی در اختیار نیست.»

پاسخ فارسی و دقیق باشد.
`,
            },
            {
              role: "user",
              content: question,
            },
          ],
          800
        );
      }

      if (route === "ANALYSIS") {
        specialistResult = await runModel(
          MODELS.analyst,
          [
            {
              role: "system",
              content: `
تو تحلیل‌گر هوشمند گروه «صدای کارکنان ثبت احوال» هستی.

موضوع را دقیق و ساختاریافته تحلیل کن.

اگر داده کافی وجود ندارد، آن را صریحاً اعلام کن.

هیچ آمار یا اطلاعات ساختگی تولید نکن.
`,
            },
            {
              role: "user",
              content: question,
            },
          ],
          900
        );
      }

      if (route === "SUGGESTION") {
        specialistResult = await runModel(
          MODELS.researcher,
          [
            {
              role: "system",
              content: `
تو عضو تیم ایده‌پردازی و پژوهش گروه
«صدای کارکنان ثبت احوال» هستی.

برای موضوع مطرح‌شده پیشنهادهای عملی و قابل بررسی ارائه کن.

پیشنهاد عمومی را به عنوان سیاست یا دستورالعمل رسمی سازمان معرفی نکن.

پاسخ فارسی، کاربردی و روشن باشد.
`,
            },
            {
              role: "user",
              content: question,
            },
          ],
          900
        );
      }
    } catch (error: any) {
      specialistError =
        error?.message || "عضو متخصص تیم در دسترس نبود.";

      specialistResult =
        "اطلاعات تخصصی جداگانه در دسترس نبود؛ پاسخ نهایی بر اساس اطلاعات موجود تولید شود.";
    }

    // =========================================================
    // 3. پاسخ نهایی
    // =========================================================

    const finalPrompt: AIMessage[] = [
      {
        role: "system",
        content: `
تو «مدیر پاسخگو هوشمند» گروه «صدای کارکنان ثبت احوال» هستی.

پاسخ نهایی را برای کاربر تولید کن.

قوانین:

- فارسی و روان بنویس.
- پاسخ را کامل کن.
- وسط جمله یا بخش رها نکن.
- اطلاعات رسمی را بدون منبع معتبر به عنوان واقعیت قطعی معرفی نکن.
- پیشنهاد عمومی را از سیاست رسمی سازمان جدا کن.
- آمار، قانون، بخشنامه، شماره نامه یا منبع جعلی نساز.
- اگر اطلاعات کافی نیست، شفاف بگو.
- در موضوعات حساس یا تصمیم‌های سازمانی، بررسی انسانی را پیشنهاد کن.
- پاسخ بیش از حد طولانی نباشد.
- در صورت نیاز از تیتر و شماره‌گذاری استفاده کن.

نام نقش:
مدیر پاسخگو هوشمند

جامعه:
گروه صدای کارکنان ثبت احوال
`,
      },
      {
        role: "user",
        content: `
پرسش کاربر:
${question}

دسته درخواست:
${route}

${specialistResult ? `
نتیجه عضو متخصص:
${specialistResult}
` : ""}

پاسخ نهایی را اکنون تولید کن.
`,
      },
    ];

    const answer = await runModel(
      MODELS.assistant,
      finalPrompt,
      1500
    );

    return NextResponse.json({
      ok: true,
      answer,

      manager: {
        name: "مدیر پاسخگو هوشمند",
        model: MODELS.manager,
        route,
        available: !managerError,
      },

      team: {
        manager: MODELS.manager,
        assistant: MODELS.assistant,
        researcher: MODELS.researcher,
        analyst: MODELS.analyst,
      },

      diagnostics: {
        managerError: managerError || null,
        specialistError: specialistError || null,
      },
    });
  } catch (error: any) {
    console.error("AI TEAM ERROR:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "خطای ناشناخته در تیم هوش مصنوعی رخ داد.",
      },
      { status: 500 }
    );
  }
}

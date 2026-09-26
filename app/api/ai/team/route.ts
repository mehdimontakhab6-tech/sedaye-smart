import { NextRequest, NextResponse } from "next/server";

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

  // OpenAI-compatible response
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

  if (Array.isArray(result?.content)) {
    const text = result.content
      .map((item: any) => {
        if (typeof item === "string") return item;
        return item?.text || item?.content || "";
      })
      .join("");

    if (text.trim()) return text.trim();
  }

  // Fallback for reasoning-style responses
  if (typeof choice?.message?.reasoning_content === "string") {
    return choice.message.reasoning_content.trim();
  }

  if (typeof result?.reasoning_content === "string") {
    return result.reasoning_content.trim();
  }

  return "";
}

async function runModel(
  env: any,
  model: string,
  messages: AIMessage[],
  maxTokens = 1500
): Promise<string> {
  const options: any = {
    messages,
    max_tokens: maxTokens,
    temperature: 0.2,
  };

  // Gemma
  if (model === MODELS.assistant) {
    options.chat_template_kwargs = {
      enable_thinking: false,
    };
  }

  const result = await env.AI.run(model, options);

  const text = extractText(result);

  if (!text) {
    throw new Error(
      `مدل ${model} اجرا شد اما پاسخ قابل استخراج نبود. ساختار: ${Object.keys(
        result || {}
      ).join(", ")}`
    );
  }

  return text;
}

function cleanRoute(route: string): string {
  const value = route
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

    const env = (process as any).env?.AI
      ? (process as any).env
      : (globalThis as any).env;

    if (!env?.AI) {
      return NextResponse.json(
        {
          error:
            "اتصال به موتور هوش مصنوعی Cloudflare Workers AI برقرار نیست.",
        },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------
    // مرحله ۱: مدیر پاسخگو هوشمند
    // ---------------------------------------------------------

    const managerPrompt: AIMessage[] = [
      {
        role: "system",
        content: `
تو «مدیر پاسخگو هوشمند» گروه «صدای کارکنان ثبت احوال» هستی.

وظیفه تو مدیریت تیم هوش مصنوعی و تشخیص نوع درخواست است.

درخواست کاربر را فقط در یکی از چهار دسته زیر قرار بده:

GENERAL
OFFICIAL
ANALYSIS
SUGGESTION

قواعد:

GENERAL:
پرسش عمومی، گفت‌وگوی معمولی یا درخواست ساده.

OFFICIAL:
موضوعی که به مقررات، بخشنامه، دستورالعمل، رویه رسمی یا اطلاعات رسمی سازمان مربوط است.

ANALYSIS:
تحلیل مسائل، بررسی روندها، مقایسه، دسته‌بندی یا تحلیل داده و دیدگاه‌ها.

SUGGESTION:
درخواست پیشنهاد، ایده، راهکار یا بهبود فرآیند.

فقط نام دسته را برگردان.
`,
      },
      {
        role: "user",
        content: question,
      },
    ];

    const managerRaw = await runModel(
      env,
      MODELS.manager,
      managerPrompt,
      300
    );

    const route = cleanRoute(managerRaw);

    // ---------------------------------------------------------
    // مرحله ۲: انتخاب عضو متخصص تیم
    // ---------------------------------------------------------

    let specialistResult = "";

    if (route === "OFFICIAL") {
      specialistResult = await runModel(
        env,
        MODELS.researcher,
        [
          {
            role: "system",
            content: `
تو پژوهشگر هوشمند گروه «صدای کارکنان ثبت احوال» هستی.

اگر منبع رسمی یا اطلاعات معتبر در اختیار تو نیست،
نباید چیزی را به عنوان مقررات یا دستورالعمل رسمی جعل کنی.

در صورت نبود منبع معتبر، صریحاً اعلام کن:
«برای ارائه پاسخ رسمی، اطلاعات معتبر کافی در اختیار نیست.»

پاسخ را فارسی، دقیق و کوتاه ارائه کن.
`,
          },
          {
            role: "user",
            content: question,
          },
        ],
        1000
      );
    }

    if (route === "ANALYSIS") {
      specialistResult = await runModel(
        env,
        MODELS.analyst,
        [
          {
            role: "system",
            content: `
تو تحلیل‌گر هوشمند گروه «صدای کارکنان ثبت احوال» هستی.

موضوع را دقیق تحلیل کن.
اگر داده کافی وجود ندارد، این موضوع را صریحاً اعلام کن.
از ساختن آمار و اطلاعات غیرواقعی خودداری کن.

پاسخ فارسی و ساختاریافته باشد.
`,
          },
          {
            role: "user",
            content: question,
          },
        ],
        1200
      );
    }

    if (route === "SUGGESTION") {
      specialistResult = await runModel(
        env,
        MODELS.researcher,
        [
          {
            role: "system",
            content: `
تو عضو تیم ایده‌پردازی و پژوهش گروه
«صدای کارکنان ثبت احوال» هستی.

برای موضوع مطرح‌شده راهکارهای عملی و قابل بررسی ارائه کن.

مهم:
پیشنهاد عمومی را به عنوان سیاست یا دستورالعمل رسمی سازمان معرفی نکن.

اگر اطلاعات رسمی در اختیار نداری، واضح بگو که پیشنهاد ارائه‌شده
صرفاً یک پیشنهاد عمومی برای بررسی کارشناسی است.

پاسخ فارسی و کاربردی باشد.
`,
          },
          {
            role: "user",
            content: question,
          },
        ],
        1200
      );
    }

    // ---------------------------------------------------------
    // مرحله ۳: مدیر پاسخ نهایی را تولید می‌کند
    // ---------------------------------------------------------

    const finalPrompt: AIMessage[] = [
      {
        role: "system",
        content: `
تو «مدیر پاسخگو هوشمند» گروه «صدای کارکنان ثبت احوال» هستی.

وظیفه تو ارائه پاسخ نهایی به کاربر است.

اصول الزامی:

۱. پاسخ را فارسی و روان بنویس.

۲. اگر موضوع رسمی است، بدون منبع معتبر ادعای مقررات یا دستورالعمل رسمی نکن.

۳. اگر اطلاعات کافی وجود ندارد، شفاف اعلام کن.

۴. بین اطلاعات رسمی و پیشنهاد عمومی تفاوت بگذار.

۵. موضوعات حساس، پیچیده یا نیازمند تصمیم سازمانی را برای بررسی انسانی ارجاع بده.

۶. از ساختن آمار، بخشنامه، قانون، شماره نامه یا منبع جعلی خودداری کن.

۷. پاسخ را کامل کن و وسط جمله رها نکن.

۸. اگر پاسخ چند بخش دارد، از تیتر و شماره‌گذاری استفاده کن.

۹. پاسخ بیش از حد طولانی نشود، اما اطلاعات لازم را حذف نکن.

نام نقش:
«مدیر پاسخگو هوشمند»

نام جامعه:
«گروه صدای کارکنان ثبت احوال»
`,
      },
      {
        role: "user",
        content: `
پرسش کاربر:
${question}

دسته تشخیص داده‌شده:
${route}

${specialistResult
  ? `نتیجه عضو متخصص تیم:
${specialistResult}`
  : ""}
        
اکنون پاسخ نهایی و کامل را برای کاربر بنویس.
`,
      },
    ];

    const answer = await runModel(
      env,
      MODELS.assistant,
      finalPrompt,
      1500
    );

    return NextResponse.json({
      answer,
      manager: {
        name: "مدیر پاسخگو هوشمند",
        model: MODELS.manager,
        route,
      },
      team: {
        manager: MODELS.manager,
        assistant: MODELS.assistant,
        researcher: MODELS.researcher,
        analyst: MODELS.analyst,
      },
    });
  } catch (error: any) {
    console.error("AI TEAM ERROR:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "خطای ناشناخته در تیم هوش مصنوعی رخ داد.",
      },
      { status: 500 }
    );
  }
            }

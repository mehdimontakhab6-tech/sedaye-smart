import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createClient } from "@supabase/supabase-js";

type KnowledgeItem = {
  id: string | number;
  title: string;
  content: string;
};

type AIResult = {
  text: string;
  model: string;
};

const MODELS = {
  manager: "@cf/qwen/qwen3-30b-a3b-fp8",
  assistant: "@cf/google/gemma-4-26b-a4b-it",
  researcher: "@cf/qwen/qwen3-30b-a3b-fp8",
  analyst: "@cf/zai-org/glm-4.7-flash"
};

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(text: string) {
  return normalize(text)
    .split(" ")
    .filter((word) => word.length > 2);
}

function similarity(a: string, b: string) {
  const first = new Set(words(a));
  const second = new Set(words(b));

  if (!first.size || !second.size) {
    return 0;
  }

  let common = 0;

  for (const word of first) {
    if (second.has(word)) {
      common++;
    }
  }

  return common / Math.max(first.size, second.size);
}

function findBestKnowledge(
  question: string,
  items: KnowledgeItem[]
) {
  let bestItem: KnowledgeItem | null = null;
  let bestScore = 0;

  for (const item of items) {
    const titleScore = similarity(
      question,
      item.title
    );

    const contentScore = similarity(
      question,
      item.content
    );

    const score =
      titleScore * 0.7 +
      contentScore * 0.3;

    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }

  return {
    item: bestItem,
    score: bestScore
  };
}

function extractAIText(result: any): string {
  if (!result) {
    return "";
  }

  if (typeof result === "string") {
    return result.trim();
  }

  const messageContent =
    result?.choices?.[0]?.message?.content;

  if (typeof messageContent === "string") {
    return messageContent.trim();
  }

  if (Array.isArray(messageContent)) {
    return messageContent
      .map((item: any) => {
        if (typeof item === "string") {
          return item;
        }

        return (
          item?.text ||
          item?.content ||
          ""
        );
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  const choiceText =
    result?.choices?.[0]?.text;

  if (
    typeof choiceText === "string" &&
    choiceText.trim()
  ) {
    return choiceText.trim();
  }

  if (
    typeof result.output_text === "string"
  ) {
    return result.output_text.trim();
  }

  if (
    typeof result.response === "string"
  ) {
    return result.response.trim();
  }

  if (
    typeof result.text === "string"
  ) {
    return result.text.trim();
  }

  if (Array.isArray(result.content)) {
    return result.content
      .map((item: any) => {
        if (typeof item === "string") {
          return item;
        }

        return (
          item?.text ||
          item?.content ||
          ""
        );
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  const reasoning =
    result?.choices?.[0]?.message?.reasoning ||
    result?.choices?.[0]?.message
      ?.reasoning_content ||
    result?.reasoning;

  if (
    typeof reasoning === "string" &&
    reasoning.trim()
  ) {
    return reasoning.trim();
  }

  return "";
}

async function runModel(
  ai: any,
  model: string,
  systemPrompt: string,
  question: string
): Promise<AIResult> {
  const input: any = {
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: question
      }
    ],
    max_tokens: 512,
    temperature: 0.2
  };

  /*
   * فقط برای Gemma 4
   * حالت thinking را خاموش می‌کنیم.
   */
  if (model === MODELS.assistant) {
    input.chat_template_kwargs = {
      enable_thinking: false
    };
  }

  const result = await ai.run(
    model,
    input,
    {
      rejectIfBusy: true
    }
  );

  const text = extractAIText(result);

  if (!text) {
    const shape =
      result &&
      typeof result === "object"
        ? Object.keys(result).join(", ")
        : typeof result;

    throw new Error(
      `مدل ${model} اجرا شد اما پاسخ قابل استخراج نبود. ساختار: ${shape}`
    );
  }

  return {
    text,
    model
  };
}

function classifyQuestion(question: string) {
  const text = normalize(question);

  const officialWords = [
    "قانون",
    "بخشنامه",
    "دستورالعمل",
    "آیین نامه",
    "آیین‌نامه",
    "مقررات",
    "ابلاغ",
    "رویه",
    "ضابطه",
    "نامه رسمی"
  ];

  const analysisWords = [
    "تحلیل",
    "تحلیل کنید",
    "مقایسه",
    "بررسی",
    "چرا",
    "علت",
    "روند",
    "آمار",
    "داده"
  ];

  const suggestionWords = [
    "پیشنهاد",
    "ایده",
    "بهبود",
    "راهکار",
    "راه حل",
    "راه‌حل",
    "چه کار کنیم"
  ];

  if (
    officialWords.some((word) =>
      text.includes(normalize(word))
    )
  ) {
    return "official";
  }

  if (
    analysisWords.some((word) =>
      text.includes(normalize(word))
    )
  ) {
    return "analysis";
  }

  if (
    suggestionWords.some((word) =>
      text.includes(normalize(word))
    )
  ) {
    return "suggestion";
  }

  return "general";
}

async function managerDecision(
  ai: any,
  question: string,
  knowledge: KnowledgeItem | null
) {
  const knowledgeInfo = knowledge
    ? `
منبع تأییدشده بانک دانش:

عنوان:
${knowledge.title}

محتوا:
${knowledge.content}
`
    : `
هیچ منبع تأییدشده‌ای از بانک دانش پیدا نشده است.
`;

  const prompt = `
تو «مدیر پاسخگو هوشمند» گروه
«صدای کارکنان ثبت احوال» هستی.

وظیفه تو هماهنگ‌کردن تیم هوش مصنوعی است.

نوع اولیه سؤال:
${classifyQuestion(question)}

${knowledgeInfo}

برای سؤال کاربر یکی از این مأموریت‌ها را انتخاب کن:

GENERAL
برای پاسخ معمولی و گفت‌وگوی فارسی.

OFFICIAL
برای سؤال‌های مربوط به قانون، مقررات،
بخشنامه، دستورالعمل یا رویه رسمی.

ANALYSIS
برای تحلیل، مقایسه، بررسی،
علت‌یابی یا تحلیل داده.

SUGGESTION
برای پیشنهاد، ایده،
بهبود فرآیند یا راهکار.

فقط یکی از این چهار کلمه را
در خط اول بنویس:

GENERAL
OFFICIAL
ANALYSIS
SUGGESTION

در خط دوم یک دلیل بسیار کوتاه بنویس.

اگر منبع رسمی وجود ندارد،
هرگز آن را جعل نکن.
`;

  const result = await runModel(
    ai,
    MODELS.manager,
    prompt,
    question
  );

  const firstLine =
    result.text
      .split("\n")[0]
      .trim()
      .toUpperCase();

  let route = "GENERAL";

  if (firstLine.includes("OFFICIAL")) {
    route = "OFFICIAL";
  } else if (
    firstLine.includes("ANALYSIS")
  ) {
    route = "ANALYSIS";
  } else if (
    firstLine.includes("SUGGESTION")
  ) {
    route = "SUGGESTION";
  }

  return {
    route,
    managerText: result.text
  };
}

async function createFinalAnswer(
  ai: any,
  route: string,
  question: string,
  knowledge: KnowledgeItem | null,
  specialist?: string
) {
  const knowledgeText = knowledge
    ? `
منبع تأییدشده سازمانی:

عنوان:
${knowledge.title}

محتوا:
${knowledge.content}
`
    : `
منبع تأییدشده سازمانی
برای این سؤال پیدا نشد.
`;

  const specialistText = specialist
    ? `
نتیجه عضو متخصص تیم:

${specialist}
`
    : "";

  const systemPrompt = `
تو «مدیر پاسخگو هوشمند» گروه
«صدای کارکنان ثبت احوال» هستی.

وظیفه تو ارائه پاسخ نهایی
به اعضای گروه است.

نوع مأموریت:
${route}

${knowledgeText}

${specialistText}

قواعد مهم:

1. پاسخ را فارسی و روشن بنویس.

2. اطلاعات ساختگی تولید نکن.

3. اگر منبع رسمی نداریم،
آن را به عنوان مقررات رسمی
معرفی نکن.

4. بین اطلاعات رسمی،
اطلاعات موجود در بانک دانش
و پیشنهاد عمومی تفاوت بگذار.

5. اگر سؤال رسمی است و
منبع معتبر نداریم،
صریحاً بگو اطلاعات کافی
برای پاسخ قطعی وجود ندارد.

6. پاسخ غیرضروری و
بیش از حد طولانی نباشد.

7. اگر مناسب بود،
پاسخ را شماره‌گذاری کن.

8. پیشنهاد عمومی را
به عنوان سیاست یا دستورالعمل
رسمی سازمان معرفی نکن.

9. لحن پاسخ محترمانه،
کاربردی و مناسب کارکنان باشد.

10. اگر سؤال نیازمند بررسی
انسانی است، این موضوع را
شفاف اعلام کن.
`;

  const result = await runModel(
    ai,
    MODELS.assistant,
    systemPrompt,
    question
  );

  return result;
}

export async function POST(req: Request) {
  try {
    const body =
      await req.json().catch(() => ({}));

    const question =
      typeof body?.question === "string"
        ? body.question.trim()
        : "";

    if (!question) {
      return NextResponse.json({
        ok: false,
        answer:
          "لطفاً سؤال خود را وارد کنید."
      });
    }

    const { env } =
      getCloudflareContext();

    const ai = (env as any).AI;

    if (!ai) {
      throw new Error(
        "Workers AI binding env.AI پیدا نشد."
      );
    }

    const url =
      (env as any)
        .NEXT_PUBLIC_SUPABASE_URL ||
      process.env
        .NEXT_PUBLIC_SUPABASE_URL;

    const key =
      (env as any)
        .SUPABASE_SERVICE_ROLE_KEY ||
      process.env
        .SUPABASE_SERVICE_ROLE_KEY;

    let knowledge: KnowledgeItem[] = [];

    if (url && key) {
      const supabase =
        createClient(url, key);

      const { data, error } =
        await supabase
          .from("knowledge")
          .select(
            "id,title,content"
          )
          .eq("approved", true)
          .limit(200);

      if (!error && data) {
        knowledge = data;
      }
    }

    const best =
      findBestKnowledge(
        question,
        knowledge
      );

    const selectedKnowledge =
      best.item &&
      best.score >= 0.2
        ? best.item
        : null;

    /*
     * مرحله اول:
     * مدیر پاسخگو هوشمند
     */
    const decision =
      await managerDecision(
        ai,
        question,
        selectedKnowledge
      );

    let specialistResult = "";
    let specialistModel = "";

    /*
     * متخصص سؤال رسمی
     */
    if (
      decision.route === "OFFICIAL"
    ) {
      const result =
        await runModel(
          ai,
          MODELS.researcher,
          `
تو «پژوهشگر هوشمند» تیم
گروه صدای کارکنان ثبت احوال هستی.

فقط بر اساس اطلاعات ارائه‌شده
تحلیل کن.

اگر منبع رسمی کافی نیست،
صریحاً بگو اطلاعات کافی وجود ندارد.

هیچ قانون، بخشنامه یا
دستورالعملی را از خودت تولید نکن.
          `,
          question +
            "\n\n" +
            (
              selectedKnowledge
                ? selectedKnowledge.content
                : "منبعی موجود نیست."
            )
        );

      specialistResult =
        result.text;

      specialistModel =
        result.model;
    }

    /*
     * متخصص تحلیل
     */
    if (
      decision.route === "ANALYSIS"
    ) {
      const result =
        await runModel(
          ai,
          MODELS.analyst,
          `
تو «تحلیل‌گر هوشمند» تیم هستی.

وظیفه:

- تحلیل دقیق
- پیدا کردن نکات مهم
- تفکیک واقعیت از پیشنهاد
- ارائه جمع‌بندی روشن

اگر داده کافی نیست،
این موضوع را صریحاً اعلام کن.
          `,
          question +
            "\n\n" +
            (
              selectedKnowledge
                ? selectedKnowledge.content
                : ""
            )
        );

      specialistResult =
        result.text;

      specialistModel =
        result.model;
    }

    /*
     * متخصص پیشنهاد و نوآوری
     */
    if (
      decision.route === "SUGGESTION"
    ) {
      const result =
        await runModel(
          ai,
          MODELS.analyst,
          `
تو «متخصص بهبود و نوآوری» هستی.

برای سؤال کاربر ایده‌ها
و راهکارهای عمومی ارائه کن.

هرگز پیشنهاد عمومی را
به عنوان سیاست یا دستورالعمل
رسمی سازمان معرفی نکن.

پیشنهادها باید:

- عملی
- روشن
- قابل بررسی
- قابل اجرا
- اولویت‌بندی‌پذیر

باشند.
          `,
          question
        );

      specialistResult =
        result.text;

      specialistModel =
        result.model;
    }

    /*
     * مرحله نهایی:
     * مدیر پاسخگو هوشمند
     * پاسخ نهایی را می‌سازد.
     */
    const final =
      await createFinalAnswer(
        ai,
        decision.route,
        question,
        selectedKnowledge,
        specialistResult
      );

    return NextResponse.json({
      ok: true,

      answer: final.text,

      ai:
        "multi-model-ai-team",

      manager: {
        name:
          "مدیر پاسخگو هوشمند",
        model:
          MODELS.manager,
        route:
          decision.route
      },

      specialist: {
        model:
          specialistModel || null
      },

      final_model:
        final.model,

      knowledge: {
        source:
          selectedKnowledge?.title ||
          null,

        confidence:
          selectedKnowledge
            ? Number(
                best.score.toFixed(2)
              )
            : null,

        verified_source:
          Boolean(
            selectedKnowledge
          )
      },

      needs_review:
        !selectedKnowledge &&
        decision.route ===
          "OFFICIAL"
    });
  } catch (error: any) {
    const message =
      error?.message ||
      String(error) ||
      "خطای ناشناخته";

    return NextResponse.json(
      {
        ok: false,

        ai:
          "multi-model-ai-team",

        error:
          message,

        answer:
          "خطای واقعی تیم هوش مصنوعی: " +
          message
      },
      {
        status: 500
      }
    );
  }
}

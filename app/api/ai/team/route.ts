import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type KnowledgeItem = {
  id: string | number;
  title: string;
  content: string;
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

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const question =
      typeof body?.question === "string"
        ? body.question.trim()
        : "";

    if (!question) {
      return NextResponse.json({
        answer: "لطفاً سؤال خود را وارد کنید."
      });
    }

    /*
     * اتصال به Cloudflare Workers AI
     */
    const { env } = getCloudflareContext();

    const ai = (env as any).AI;

    if (!ai) {
      return NextResponse.json(
        {
          ok: false,
          step: "binding",
          error: "AI binding پیدا نشد."
        },
        { status: 500 }
      );
    }

    /*
     * اتصال به Supabase
     */
    const url =
      (env as any).NEXT_PUBLIC_SUPABASE_URL;

    const key =
      (env as any).SUPABASE_SERVICE_ROLE_KEY;

    let knowledge: KnowledgeItem[] = [];

    if (url && key) {
      const supabase = createClient(
        url,
        key
      );

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

    /*
     * پیدا کردن مرتبط‌ترین منبع
     * از بانک دانش
     */
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

    const knowledgeText =
      selectedKnowledge
        ? `
منبع سازمانی تأییدشده:

عنوان:
${selectedKnowledge.title}

محتوا:
${selectedKnowledge.content}
`
        : `
در بانک دانش، منبع سازمانی مرتبط و تأییدشده‌ای برای این سؤال پیدا نشد.
`;

    /*
     * درخواست به هوش مصنوعی Cloudflare
     */
    const result = await ai.run(
      "@cf/google/gemma-4-26b-a4b-it",
      {
        messages: [
          {
            role: "system",
            content: `
تو «صدایار» هستی؛
عضو تیم هوش مصنوعی سامانه
«صدای کارکنان ثبت احوال».

وظیفه تو کمک به کارکنان،
پاسخ‌گویی دقیق،
راهنمایی مرحله‌به‌مرحله،
تحلیل مسائل،
و استفاده از منابع تأییدشده است.

قوانین:

1. هرگز اطلاعات را حدس نزن.

2. اطلاعات ساختگی تولید نکن.

3. اگر منبع سازمانی در اختیار توست،
پاسخ را بر اساس همان منبع تنظیم کن.

4. معنای منبع سازمانی را تغییر نده.

5. اگر سؤال درباره قانون،
مقررات،
بخشنامه،
دستورالعمل،
رویه رسمی
یا تصمیم سازمانی است،
بدون منبع معتبر پاسخ قطعی نده.

6. اگر اطلاعات کافی نیست،
صریحاً بگو اطلاعات تأییدشده کافی نیست.

7. پاسخ‌ها را فارسی،
روشن،
محترمانه
و کاربردی ارائه کن.

8. اگر لازم بود،
سؤال تکمیلی مشخص مطرح کن.

9. در موارد حساس،
پاسخ را برای بررسی انسانی علامت‌گذاری کن.

10. هدف سامانه:
«هم‌صدایی برای تحول و بهبود»

${knowledgeText}
`
          },
          {
            role: "user",
            content: question
          }
        ],

        /*
         * غیرفعال کردن حالت تفکر طولانی
         * برای پاسخ سریع‌تر
         */
        chat_template_kwargs: {
          enable_thinking: false
        }
      },

      /*
       * اگر ظرفیت AI موقتاً پر باشد،
       * درخواست منتظر نمی‌ماند.
       */
      {
        rejectIfBusy: true
      }
    );

    /*
     * استخراج پاسخ مدل
     */
    const answer =
      typeof result === "string"
        ? result
        : (result as any)?.response ||
          (result as any)?.text ||
          (result as any)?.result ||
          (result as any)?.choices?.[0]
            ?.message?.content ||
          "";

    if (!answer) {
      return NextResponse.json(
        {
          ok: false,
          step: "ai_response",
          error:
            "مدل هوش مصنوعی پاسخ متنی برنگرداند.",
          raw: result
        },
        { status: 502 }
      );
    }

    /*
     * پاسخ موفق
     */
    return NextResponse.json({
      ok: true,

      answer,

      source:
        selectedKnowledge?.title ||
        null,

      confidence:
        selectedKnowledge
          ? Number(
              best.score.toFixed(2)
            )
          : null,

      ai:
        "cloudflare-workers-ai",

      model:
        "@cf/google/gemma-4-26b-a4b-it",

      needs_review:
        !selectedKnowledge,

      verified_source:
        Boolean(selectedKnowledge)
    });

  } catch (error) {

    /*
     * خطای واقعی را نمایش می‌دهیم
     * تا در صورت وجود مشکل دقیقاً
     * مشخص شود مشکل کجاست.
     */
    return NextResponse.json(
      {
        ok: false,

        step: "runtime",

        error:
          error instanceof Error
            ? error.message
            : String(error)
      },
      { status: 500 }
    );
  }
      }

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createClient } from "@supabase/supabase-js";

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

function extractAIText(result: any) {
  if (!result) return "";

  if (typeof result === "string") {
    return result.trim();
  }

  if (typeof result.response === "string") {
    return result.response.trim();
  }

  if (typeof result.text === "string") {
    return result.text.trim();
  }

  if (Array.isArray(result.content)) {
    return result.content
      .map((item: any) => item?.text)
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  return "";
}

async function askWorkersAI(
  question: string,
  knowledge: KnowledgeItem | null
) {
  const { env } = getCloudflareContext();

  const ai = (env as any).AI;

  if (!ai) {
    throw new Error(
      "Workers AI binding env.AI پیدا نشد."
    );
  }

  const knowledgeText = knowledge
    ? `
عنوان منبع:
${knowledge.title}

محتوای منبع:
${knowledge.content}
`
    : `
هیچ منبع تأییدشده‌ای از بانک دانش برای این سؤال پیدا نشد.
`;

  const systemPrompt = `
تو «صدایار»، عضو تیم هوش مصنوعی سامانه
«صدای کارکنان ثبت احوال» هستی.

هدف تو پاسخ‌گویی دقیق، روشن و قابل اتکا به کارکنان است.

قوانین:

- هرگز اطلاعات را حدس نزن.
- اطلاعات ساختگی تولید نکن.
- اگر منبع سازمانی ارائه شده، پاسخ را بر اساس آن تنظیم کن.
- اگر درباره قانون، مقررات، بخشنامه یا رویه رسمی منبع معتبر نداری، پاسخ قطعی نده.
- اگر اطلاعات کافی نداری، صریحاً اعلام کن.
- پاسخ را فارسی و قابل فهم ارائه کن.

${knowledgeText}
`;

  const result = await ai.run(
    "@cf/google/gemma-4-26b-a4b-it",
    {
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: question
        }
      ]
    },
    {
      rejectIfBusy: true
    }
  );

  const answer = extractAIText(result);

  if (!answer) {
    throw new Error(
      "Workers AI اجرا شد اما متن پاسخ قابل استخراج نبود."
    );
  }

  return answer;
}

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

    const { env } = getCloudflareContext();

    const url =
      (env as any).NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const key =
      (env as any).SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    let knowledge: KnowledgeItem[] = [];

    if (url && key) {
      const supabase = createClient(
        url,
        key
      );

      const { data, error } = await supabase
        .from("knowledge")
        .select("id,title,content")
        .eq("approved", true)
        .limit(200);

      if (!error && data) {
        knowledge = data;
      }
    }

    const best = findBestKnowledge(
      question,
      knowledge
    );

    const selectedKnowledge =
      best.item && best.score >= 0.2
        ? best.item
        : null;

    const answer = await askWorkersAI(
      question,
      selectedKnowledge
    );

    return NextResponse.json({
      ok: true,
      answer,
      ai: "cloudflare-workers-ai",
      model:
        "@cf/google/gemma-4-26b-a4b-it",
      source:
        selectedKnowledge?.title || null,
      confidence: selectedKnowledge
        ? Number(best.score.toFixed(2))
        : null,
      verified_source:
        Boolean(selectedKnowledge),
      needs_review:
        !selectedKnowledge
    });
  } catch (error: any) {
    const message =
      error?.message ||
      String(error) ||
      "خطای ناشناخته";

    return NextResponse.json(
      {
        ok: false,
        ai: "cloudflare-workers-ai",
        error: message,
        answer:
          "خطای واقعی هوش مصنوعی: " +
          message
      },
      {
        status: 500
      }
    );
  }
      }

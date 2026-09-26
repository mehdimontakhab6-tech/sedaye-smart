import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

interface Env {
  AI: {
    run: (
      model: string,
      input: {
        messages: {
          role: "system" | "user";
          content: string;
        }[];
        temperature?: number;
        max_tokens?: number;
      }
    ) => Promise<any>;
  };
}

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

function extractText(result: any): string {
  if (!result) {
    return "";
  }

  if (typeof result === "string") {
    return result.trim();
  }

  if (typeof result.response === "string") {
    return result.response.trim();
  }

  if (typeof result.text === "string") {
    return result.text.trim();
  }

  if (Array.isArray(result)) {
    return result
      .map((item) =>
        typeof item === "string"
          ? item
          : item?.response ||
            item?.text ||
            ""
      )
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  return "";
}

async function askAI(
  env: Env,
  question: string,
  knowledge: KnowledgeItem | null
) {
  const sourceText = knowledge
    ? `
منبع تأییدشده سازمانی:

عنوان:
${knowledge.title}

محتوا:
${knowledge.content}
`
    : `
هیچ منبع تأییدشده‌ای در بانک دانش برای این سؤال پیدا نشده است.
`;

  const systemPrompt = `
تو «صدایار» هستی؛ دستیار هوشمند گروه
«صدای کارکنان ثبت احوال».

هدف تو کمک دقیق، مستند و مسئولانه به کارکنان است.

قوانین قطعی:

1. هرگز اطلاعات را حدس نزن.
2. اطلاعات ساختگی تولید نکن.
3. اگر پاسخ در منبع سازمانی وجود دارد، بر اساس همان منبع پاسخ بده.
4. مفهوم منبع را تغییر نده.
5. اگر اطلاعات کافی برای پاسخ دقیق وجود ندارد، صریحاً بگو که اطلاعات کافی در اختیار نیست.
6. درباره قانون، مقررات، بخشنامه، دستورالعمل یا رویه رسمی، بدون منبع معتبر پاسخ قطعی نده.
7. پاسخ فارسی، روشن، کوتاه و کاربردی باشد.
8. اگر سؤال چند بخش دارد، بخش‌های مختلف را جداگانه پاسخ بده.
9. اگر برای پاسخ به اطلاعات بیشتری نیاز است، سؤال تکمیلی مشخص مطرح کن.
10. اگر پاسخ قابل اتکا نیست، درخواست باید برای بررسی انسانی علامت‌گذاری شود.
11. صرفاً برای اینکه پاسخ کامل به نظر برسد، چیزی از خودت اضافه نکن.

${sourceText}
`;

  try {
    const result = await env.AI.run(
      "@cf/zai-org/glm-4.7-flash",
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
        ],
        temperature: 0.1,
        max_tokens: 1200
      }
    );

    return extractText(result);
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
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

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  let knowledge: KnowledgeItem[] = [];

  if (url && key) {
    const supabase = createClient(url, key);

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

  const env = process.env as unknown as Env;

  const aiAnswer = await askAI(
    env,
    question,
    selectedKnowledge
  );

  if (aiAnswer) {
    return NextResponse.json({
      answer: aiAnswer,
      source:
        selectedKnowledge?.title || null,
      confidence: selectedKnowledge
        ? Number(best.score.toFixed(2))
        : null,
      model:
        "@cf/zai-org/glm-4.7-flash",
      verified_source:
        Boolean(selectedKnowledge),
      needs_review:
        !selectedKnowledge
    });
  }

  if (selectedKnowledge) {
    return NextResponse.json({
      answer: selectedKnowledge.content,
      source: selectedKnowledge.title,
      confidence: Number(
        best.score.toFixed(2)
      ),
      model: "knowledge-base",
      verified_source: true,
      needs_review: false
    });
  }

  if (url && key) {
    const supabase = createClient(url, key);

    await supabase
      .from("unanswered_questions")
      .insert({
        question,
        status: "نیازمند بررسی هوشمند"
      });
  }

  return NextResponse.json({
    answer:
      "برای ارائه پاسخ دقیق، اطلاعات تأییدشده کافی در اختیار سامانه نیست. این سؤال برای بررسی بیشتر ثبت شد و سامانه از ارائه پاسخ حدسی خودداری می‌کند.",
    needs_review: true,
    verified_source: false
  });
    }

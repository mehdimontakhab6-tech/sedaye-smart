import { NextResponse } from "next/server";
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

async function askOpenAI(
  question: string,
  knowledge: KnowledgeItem | null
) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  const knowledgeText = knowledge
    ? `
عنوان منبع:
${knowledge.title}

محتوای منبع:
${knowledge.content}
`
    : "هیچ منبع تأییدشده‌ای در بانک دانش پیدا نشد.";

  const systemPrompt = `
تو «صدایار»، عضو تیم هوش مصنوعی سامانه «صدای کارکنان ثبت احوال» هستی.

وظیفه تو ارائه پاسخ دقیق، مستند و قابل اتکا به کارکنان است.

قوانین بسیار مهم:

1. هرگز اطلاعات را حدس نزن.
2. اگر اطلاعات کافی نداری، صریحاً اعلام کن.
3. اگر منبع سازمانی در اختیار توست، پاسخ را بر اساس همان منبع تنظیم کن.
4. محتوای منبع را جعل یا تغییر معنایی نده.
5. اگر سؤال درباره قانون، مقررات، بخشنامه، دستورالعمل یا رویه رسمی است و منبع معتبر در اختیار نداری، پاسخ قطعی نده.
6. پاسخ را به زبان فارسی و روشن ارائه کن.
7. اگر اطلاعات ناقص است، سؤال تکمیلی مشخص مطرح کن.
8. در صورت نبود اطلاعات قابل اعتماد، درخواست را برای بررسی انسانی علامت‌گذاری کن.
9. هرگز برای کامل‌کردن پاسخ، اطلاعات ساختگی تولید نکن.

${knowledgeText}
`;

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model:
          process.env.OPENAI_MODEL ||
          "gpt-5.6-luna",
        input: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: question
          }
        ]
      })
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();

  const output =
    data?.output
      ?.flatMap((item: any) => item?.content || [])
      ?.map((item: any) => item?.text)
      ?.filter(Boolean)
      ?.join("\n")
      ?.trim();

  if (!output) {
    return null;
  }

  return output;
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

  /*
   * فقط وقتی شباهت قابل قبول باشد،
   * اطلاعات بانک دانش را به مدل می‌دهیم.
   */
  const selectedKnowledge =
    best.item && best.score >= 0.2
      ? best.item
      : null;

  /*
   * ابتدا تلاش برای پاسخ هوشمند.
   */
  const aiAnswer = await askOpenAI(
    question,
    selectedKnowledge
  );

  if (aiAnswer) {
    return NextResponse.json({
      answer: aiAnswer,
      source: selectedKnowledge?.title || null,
      confidence: selectedKnowledge
        ? Number(best.score.toFixed(2))
        : null,
      ai: "openai",
      needs_review: !selectedKnowledge,
      verified_source: Boolean(selectedKnowledge)
    });
  }

  /*
   * اگر AI در دسترس نبود،
   * پاسخ مستقیم از منبع تأییدشده بده.
   */
  if (selectedKnowledge) {
    return NextResponse.json({
      answer: selectedKnowledge.content,
      source: selectedKnowledge.title,
      confidence: Number(
        best.score.toFixed(2)
      ),
      ai: false,
      verified_source: true,
      needs_review: false
    });
  }

  /*
   * هیچ منبع قابل اتکایی پیدا نشده است.
   * سیستم نباید حدس بزند.
   */
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

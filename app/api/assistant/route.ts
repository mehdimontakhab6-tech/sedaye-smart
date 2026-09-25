import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const question = body?.question?.trim();

  if (!question) {
    return NextResponse.json({
      answer: "لطفاً سؤال خود را وارد کنید."
    });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json({
      answer:
        "بانک دانش هنوز به سامانه متصل نشده است؛ این سؤال برای بررسی مدیر سامانه آماده ثبت است."
    });
  }

  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from("knowledge")
    .select("id,title,content")
    .eq("approved", true)
    .limit(100);

  if (error) {
    return NextResponse.json({
      answer:
        "در دریافت اطلاعات بانک دانش خطایی رخ داد."
    });
  }

  let bestItem = null;
  let bestScore = 0;

  for (const item of data ?? []) {
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

  if (bestItem && bestScore >= 0.2) {
    return NextResponse.json({
      answer: bestItem.content,
      source: bestItem.title,
      confidence: Number(bestScore.toFixed(2))
    });
  }

  await supabase
    .from("unanswered_questions")
    .insert({
      question,
      status: "جدید"
    });

  return NextResponse.json({
    answer:
      "پاسخ تأییدشده‌ای برای این سؤال در بانک دانش پیدا نشد. سؤال شما برای بررسی مدیر سامانه ثبت شد.",
    needs_review: true
  });
}

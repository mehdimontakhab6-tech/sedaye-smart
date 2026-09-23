import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const { question } = await req.json();

  if (!question?.trim()) {
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

  const { data } = await supabase
    .from("knowledge")
    .select("title,content")
    .eq("approved", true)
    .ilike("title", `%${question.trim()}%`)
    .limit(3);

  if (data?.length) {
    return NextResponse.json({
      answer: data
        .map((x) => `**${x.title}**\n${x.content}`)
        .join("\n\n")
    });
  }

  return NextResponse.json({
    answer:
      "پاسخ تأییدشده‌ای برای این سؤال در بانک دانش پیدا نشد و موضوع باید توسط مدیر سامانه بررسی شود."
  });
}

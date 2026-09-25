import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key);
}

export async function GET() {
  const supabase = getSupabase();

  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        error: "اتصال به Supabase تنظیم نشده است.",
        questions: []
      },
      { status: 500 }
    );
  }

  const { data, error } = await supabase
    .from("unanswered_questions")
    .select(
      "id,question,status,answer,approved,created_at"
    )
    .order("created_at", {
      ascending: false
    });

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "دریافت سؤالات انجام نشد.",
        questions: []
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    questions: data ?? []
  });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));

  const id = body?.id?.trim();
  const answer = body?.answer?.trim();

  if (!id || !answer) {
    return NextResponse.json(
      {
        ok: false,
        error: "شناسه سؤال و پاسخ الزامی است."
      },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        error: "اتصال به Supabase تنظیم نشده است."
      },
      { status: 500 }
    );
  }

  const { data: question, error: questionError } =
    await supabase
      .from("unanswered_questions")
      .select("id,question")
      .eq("id", id)
      .single();

  if (questionError || !question) {
    return NextResponse.json(
      {
        ok: false,
        error: "سؤال پیدا نشد."
      },
      { status: 404 }
    );
  }

  const { data: knowledge, error: knowledgeError } =
    await supabase
      .from("knowledge")
      .insert({
        title: question.question,
        content: answer,
        approved: true
      })
      .select("id,title,content,approved")
      .single();

  if (knowledgeError) {
    return NextResponse.json(
      {
        ok: false,
        error: "ثبت پاسخ در بانک دانش انجام نشد."
      },
      { status: 500 }
    );
  }

  const { error: updateError } =
    await supabase
      .from("unanswered_questions")
      .update({
        answer,
        status: "پاسخ داده شد",
        approved: true,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

  if (updateError) {
    return NextResponse.json(
      {
        ok: false,
        error: "به‌روزرسانی سؤال انجام نشد."
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "پاسخ ثبت و به بانک دانش اضافه شد.",
    knowledge
  });
}

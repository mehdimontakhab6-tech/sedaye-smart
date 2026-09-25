import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Category =
  | "پیشنهاد"
  | "مسئله"
  | "سؤال"
  | "اطلاع‌رسانی"
  | "تجربه"
  | "اصلاح فرآیند"
  | "نوآوری";

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classify(text: string): Category {
  const value = normalize(text);

  if (
    /چطور|چگونه|آیا|کجا|چه زمانی|سؤال|سوال|استعلام/.test(
      value
    )
  ) {
    return "سؤال";
  }

  if (
    /پیشنهاد|بهتر است|بهتره|پیشنهاد می‌کنم|پیشنهاد میکنم/.test(
      value
    )
  ) {
    return "پیشنهاد";
  }

  if (
    /ایده|نوآوری|خلاق|هوشمند|راهکار جدید/.test(
      value
    )
  ) {
    return "نوآوری";
  }

  if (
    /فرآیند|فرایند|سامانه|رویه|مراحل|صدور|ثبت|اصلاح/.test(
      value
    )
  ) {
    return "اصلاح فرآیند";
  }

  if (
    /تجربه|تجربه من|تجربه بنده|در تجربه/.test(
      value
    )
  ) {
    return "تجربه";
  }

  if (
    /اطلاع|اطلاعیه|اعلام|خبر|به اطلاع/.test(
      value
    )
  ) {
    return "اطلاع‌رسانی";
  }

  return "مسئله";
}

function words(text: string) {
  return new Set(
    normalize(text)
      .split(" ")
      .filter((word) => word.length > 2)
  );
}

function similarity(a: string, b: string) {
  const first = words(a);
  const second = words(b);

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

function makeTrackingId(sequence: number) {
  return `SN-1405-${String(sequence).padStart(3, "0")}`;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const text = body?.text?.trim();

  if (!text) {
    return NextResponse.json(
      {
        ok: false,
        error: "متن پیام ارسال نشده است."
      },
      { status: 400 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json(
      {
        ok: false,
        error: "اتصال به Supabase تنظیم نشده است."
      },
      { status: 500 }
    );
  }

  const supabase = createClient(url, key);

  const category = classify(text);

  if (
    category === "سؤال" ||
    category === "اطلاع‌رسانی" ||
    category === "تجربه"
  ) {
    await supabase.from("messages").insert({
      text,
      source: "smart-manager"
    });

    return NextResponse.json({
      ok: true,
      category,
      action: "message_registered",
      needs_review: true
    });
  }

  if (
    category === "پیشنهاد" ||
    category === "نوآوری"
  ) {
    const { data, error } = await supabase
      .from("ideas")
      .insert({
        title: text.slice(0, 120),
        description: text,
        category
      })
      .select(
        "id,title,description,category,created_at"
      )
      .single();

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: "ثبت پیشنهاد انجام نشد."
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      category,
      action: "idea_created",
      idea: data,
      needs_review: true
    });
  }

  const { data: issues } = await supabase
    .from("issues")
    .select(
      "id,tracking_id,title,description,status,category,created_at"
    )
    .order("created_at", {
      ascending: false
    })
    .limit(100);

  let existingIssue = null;
  let bestScore = 0;

  for (const issue of issues ?? []) {
    const score = similarity(
      text,
      issue.description ?? issue.title
    );

    if (score > bestScore) {
      bestScore = score;
      existingIssue = issue;
    }
  }

  if (bestScore >= 0.5 && existingIssue) {
    return NextResponse.json({
      ok: true,
      category,
      action: "duplicate_detected",
      similarity: Number(bestScore.toFixed(2)),
      issue: existingIssue,
      needs_review: true
    });
  }

  const { count } = await supabase
    .from("issues")
    .select("*", {
      count: "exact",
      head: true
    });

  const trackingId = makeTrackingId(
    (count ?? 0) + 1
  );

  const { data: issue, error } = await supabase
    .from("issues")
    .insert({
      tracking_id: trackingId,
      title: text.slice(0, 120),
      description: text,
      status: "ثبت شد",
      category
    })
    .select(
      "id,tracking_id,title,description,status,category,created_at"
    )
    .single();

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "ایجاد پرونده انجام نشد."
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    category,
    action: "issue_created",
    issue,
    needs_review: true
  });
}

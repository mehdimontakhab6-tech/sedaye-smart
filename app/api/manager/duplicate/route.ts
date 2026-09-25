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

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const text = body?.text?.trim();

  if (!text) {
    return NextResponse.json(
      {
        ok: false,
        error: "متن مسئله ارسال نشده است."
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

  const { data, error } = await supabase
    .from("issues")
    .select(
      "id,tracking_id,title,description,status,category,created_at"
    )
    .order("created_at", {
      ascending: false
    })
    .limit(100);

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "دریافت مسائل انجام نشد."
      },
      { status: 500 }
    );
  }

  let bestIssue = null;
  let bestScore = 0;

  for (const issue of data ?? []) {
    const score = similarity(
      text,
      issue.description ?? issue.title
    );

    if (score > bestScore) {
      bestScore = score;
      bestIssue = issue;
    }
  }

  const isDuplicate = bestScore >= 0.5;

  return NextResponse.json({
    ok: true,
    duplicate: isDuplicate,
    similarity: Number(bestScore.toFixed(2)),
    existing_issue: isDuplicate ? bestIssue : null,
    needs_review: isDuplicate
  });
}

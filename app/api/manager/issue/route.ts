import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  const { count } = await supabase
    .from("issues")
    .select("*", {
      count: "exact",
      head: true
    });

  const sequence = (count ?? 0) + 1;

  const trackingId = makeTrackingId(sequence);

  const { data, error } = await supabase
    .from("issues")
    .insert({
      tracking_id: trackingId,
      title: text.slice(0, 120),
      description: text,
      status: "ثبت شد",
      category: "مسئله"
    })
    .select(
      "id,tracking_id,title,description,status,category,created_at"
    )
    .single();

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "ثبت پرونده انجام نشد."
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    issue: data
  });
}

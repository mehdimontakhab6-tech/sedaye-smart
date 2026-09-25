import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json({
      issues: []
    });
  }

  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from("issues")
    .select(
      "id,tracking_id,title,description,status,category,created_at"
    )
    .order("created_at", {
      ascending: false
    });

  if (error) {
    return NextResponse.json(
      {
        issues: [],
        error: "خطا در دریافت مسائل"
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    issues: data ?? []
  });
}

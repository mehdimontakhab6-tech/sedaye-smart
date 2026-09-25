import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json({
      ideas: []
    });
  }

  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from("ideas")
    .select(
      "id,title,description,category,created_at"
    )
    .order("created_at", {
      ascending: false
    });

  if (error) {
    return NextResponse.json(
      {
        ideas: [],
        error: "خطا در دریافت پیشنهادها"
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ideas: data ?? []
  });
}

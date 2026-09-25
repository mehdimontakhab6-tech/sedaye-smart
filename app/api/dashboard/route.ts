import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json({
      stats: {
        messages: 0,
        issues: 0,
        ideas: 0,
        polls: 0
      }
    });
  }

  const supabase = createClient(url, key);

  const [
    messages,
    issues,
    ideas,
    polls
  ] = await Promise.all([
    supabase
      .from("messages")
      .select("*", { count: "exact", head: true }),

    supabase
      .from("issues")
      .select("*", { count: "exact", head: true }),

    supabase
      .from("ideas")
      .select("*", { count: "exact", head: true }),

    supabase
      .from("polls")
      .select("*", { count: "exact", head: true })
      .eq("active", true)
  ]);

  return NextResponse.json({
    stats: {
      messages: messages.count ?? 0,
      issues: issues.count ?? 0,
      ideas: ideas.count ?? 0,
      polls: polls.count ?? 0
    }
  });
}

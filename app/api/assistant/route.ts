import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type KnowledgeRow = {
  title: string | null;
  content: string | null;
  approved: boolean | null;
};

function extractAnswer(result: any): string {
  if (!result) return "";

  const content = result?.choices?.[0]?.message?.content;

  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (typeof result?.response === "string" && result.response.trim()) {
    return result.response.trim();
  }

  if (typeof result?.text === "string" && result.text.trim()) {
    return result.text.trim();
  }

  return "";
}

async function loadKnowledge(
  url: string,
  key: string
): Promise<KnowledgeRow[]> {
  try {
    const supabase = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await supabase
      .from("knowledge")
      .select("title, content, approved")
      .eq("approved", true)
      .limit(200);

    if (error) {
      console.error("SUPABASE KNOWLEDGE ERROR:", error);
      return [];
    }

    return (data || []) as KnowledgeRow[];
  } catch (error) {
    console.error("SUPABASE CONNECTION ERROR:", error);
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const question =
      typeof body?.question === "string"
        ? body.question.trim()
        : "";

    if (!question) {
      return NextResponse.json(
        {
          ok: false,
          answer: "لطفاً پرسش خود را وارد کنید.",
        },
        { status: 400 }
      );
    }

    const { env } = await getCloudflareContext({
      async: true,
    });

    const runtimeEnv = env as any;

    const supabaseUrl =
      runtimeEnv.NEXT_PUBLIC_SUPABASE_URL || "";

    const serviceRoleKey =
      runtimeEnv.SUPABASE_SERVICE_ROLE_KEY || "";

    const hasSupabaseUrl = Boolean(supabaseUrl);
    const hasServiceRoleKey = Boolean(serviceRoleKey);

    let knowledge: KnowledgeRow[] = [];

    if (hasSupabaseUrl && hasServiceRoleKey) {
      knowledge = await loadKnowledge(
        supabaseUrl,
        serviceRoleKey
      );
    }

    /*
     * اگر سؤال مستقیماً با یکی از منابع بانک دانش
     * مطابقت داشته باشد، ابتدا همان منبع را استفاده می‌کنیم.
     */
    const normalizedQuestion = question
      .replace(/[؟?!.,،]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    const directMatch = knowledge.find((item) => {
      const title = (item.title || "")
        .replace(/[؟?!.,،]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

      return (
        title &&
        (normalizedQuestion.includes(title) ||
          title.includes(normalizedQuestion))
      );
    });

    if (directMatch?.content) {
      return NextResponse.json({
        ok: true,
        answer:
          `بر اساس اطلاعات تأییدشده بانک دانش:\n\n${directMatch.content}`,
        source: "knowledge",
        knowledge_count: knowledge.length,
        supabase_connected:
          hasSupabaseUrl && hasServiceRoleKey,
        knowledge_match: true,
        knowledge_title: directMatch.title,
      });
    }

    /*
     * اگر تطبیق مستقیم پیدا نشد، از Workers AI استفاده می‌کنیم.
     */
    const ai = runtimeEnv.AI;

    if (!ai || typeof ai.run !== "function") {
      return NextResponse.json({
        ok: true,
        answer:
          "اطلاعات کافی برای پاسخ دقیق در دسترس نیست و سؤال نیازمند بررسی بیشتر است.",
        source: "fallback",
        knowledge_count: knowledge.length,
        supabase_connected:
          hasSupabaseUrl && hasServiceRoleKey,
        knowledge_match: false,
        ai_connected: false,
      });
    }

    const context = knowledge
      .slice(0, 30)
      .map(
        (item, index) =>
          `منبع ${index + 1}:\nعنوان: ${
            item.title || ""
          }\nمحتوا: ${item.content || ""}`
      )
      .join("\n\n");

    const systemPrompt = `
تو «مدیر پاسخگو هوشمند» گروه «صدای کارکنان ثبت احوال» هستی.

به زبان فارسی، دقیق، محترمانه و کاربردی پاسخ بده.

بانک دانش تأییدشده سامانه:

${context || "هیچ منبع تأییدشده‌ای وجود ندارد."}

قواعد:

- اگر پاسخ در بانک دانش وجود دارد، از همان اطلاعات استفاده کن.
- اطلاعات بانک دانش را تغییر یا تحریف نکن.
- نگو به بانک دانش دسترسی نداری.
- اطلاعات جعلی، قانون یا بخشنامه ساختگی تولید نکن.
- اگر اطلاعات کافی نیست، صادقانه اعلام کن که نیازمند بررسی بیشتر است.
- پاسخ کوتاه و روشن باشد.
`;

    const result = await ai.run(
      "@cf/google/gemma-4-26b-a4b-it",
      {
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: question,
          },
        ],
        max_tokens: 1200,
        temperature: 0.2,
      }
    );

    const answer = extractAnswer(result);

    if (!answer) {
      return NextResponse.json({
        ok: true,
        answer:
          "هوش مصنوعی پاسخ متنی تولید نکرد. سؤال نیازمند بررسی بیشتر است.",
        source: "fallback",
        knowledge_count: knowledge.length,
        supabase_connected:
          hasSupabaseUrl && hasServiceRoleKey,
        knowledge_match: false,
        ai_connected: true,
      });
    }

    return NextResponse.json({
      ok: true,
      answer,
      source: "workers-ai",
      knowledge_count: knowledge.length,
      supabase_connected:
        hasSupabaseUrl && hasServiceRoleKey,
      knowledge_match: false,
      ai_connected: true,
      model:
        "@cf/google/gemma-4-26b-a4b-it",
    });
  } catch (error: any) {
    console.error(
      "ASSISTANT API ERROR:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        answer:
          "خطا در ارتباط با مدیر پاسخگو هوشمند.",
        error:
          error?.message || String(error),
      },
      { status: 500 }
    );
  }
export async function GET() {
  try {
    const { env } = await getCloudflareContext({
      async: true,
    });

    const runtimeEnv = env as any;

    const supabaseUrl =
      runtimeEnv.NEXT_PUBLIC_SUPABASE_URL || "";

    const serviceRoleKey =
      runtimeEnv.SUPABASE_SERVICE_ROLE_KEY || "";

    const ai =
      runtimeEnv.AI;

    let knowledgeCount = 0;

    if (supabaseUrl && serviceRoleKey) {
      const knowledge = await loadKnowledge(
        supabaseUrl,
        serviceRoleKey
      );

      knowledgeCount = knowledge.length;
    }

    return NextResponse.json({
      ok: true,
      supabase_url: Boolean(supabaseUrl),
      service_role_key: Boolean(serviceRoleKey),
      ai: Boolean(ai),
      knowledge_count: knowledgeCount,
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error:
        error?.message || String(error),
    });
  }
}

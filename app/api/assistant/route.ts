import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type KnowledgeRow = {
  title: string | null;
  content: string | null;
  approved: boolean | null;
};

function normalizeText(text: string): string {
  return text
    .replace(/ي/g, "ی")
    .replace(/ى/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[؟?!.,،:؛]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractAnswer(result: any): string {
  if (!result) return "";

  const content =
    result?.choices?.[0]?.message?.content;

  if (
    typeof content === "string" &&
    content.trim()
  ) {
    return content.trim();
  }

  if (
    typeof result?.response === "string" &&
    result.response.trim()
  ) {
    return result.response.trim();
  }

  if (
    typeof result?.text === "string" &&
    result.text.trim()
  ) {
    return result.text.trim();
  }

  return "";
}

async function loadKnowledge(
  url: string,
  key: string
): Promise<KnowledgeRow[]> {
  try {
    const supabase = createClient(
      url,
      key,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data, error } =
      await supabase
        .from("knowledge")
        .select(
          "title, content, approved"
        )
        .eq("approved", true)
        .limit(200);

    if (error) {
      console.error(
        "SUPABASE KNOWLEDGE ERROR:",
        error
      );
      return [];
    }

    return (data || []) as KnowledgeRow[];
  } catch (error) {
    console.error(
      "SUPABASE CONNECTION ERROR:",
      error
    );
    return [];
  }
}

function findKnowledgeMatch(
  question: string,
  knowledge: KnowledgeRow[]
): KnowledgeRow | null {
  const q = normalizeText(question);

  if (!q) return null;

  /*
   * ابتدا تطبیق عنوان کامل
   */
  const exactTitle =
    knowledge.find((item) => {
      const title = normalizeText(
        item.title || ""
      );

      return (
        title.length > 0 &&
        (q.includes(title) ||
          title.includes(q))
      );
    });

  if (exactTitle) {
    return exactTitle;
  }

  /*
   * تطبیق بر اساس واژه‌های مهم سؤال
   */
  const stopWords = new Set([
    "چیست",
    "چگونه",
    "چطور",
    "لطفا",
    "لطفاً",
    "میباشد",
    "است",
    "طبق",
    "اطلاعات",
    "بانک",
    "دانش",
    "ثبت",
    "برای",
    "را",
    "در",
    "به",
    "از",
    "چه",
    "منظور",
    "درباره",
  ]);

  const questionWords = q
    .split(" ")
    .filter(
      (word) =>
        word.length >= 3 &&
        !stopWords.has(word)
    );

  let bestMatch:
    | KnowledgeRow
    | null = null;

  let bestScore = 0;

  for (const item of knowledge) {
    const title = normalizeText(
      item.title || ""
    );

    const content = normalizeText(
      item.content || ""
    );

    const source =
      `${title} ${content}`;

    let score = 0;

    for (const word of questionWords) {
      if (source.includes(word)) {
        score++;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = item;
    }
  }

  /*
   * حداقل یک واژه مهم باید پیدا شده باشد.
   */
  if (bestScore >= 1) {
    return bestMatch;
  }

  return null;
}

export async function POST(
  request: NextRequest
) {
  try {
    const body =
      await request.json();

    const question =
      typeof body?.question === "string"
        ? body.question.trim()
        : "";

    if (!question) {
      return NextResponse.json(
        {
          ok: false,
          answer:
            "لطفاً پرسش خود را وارد کنید.",
        },
        { status: 400 }
      );
    }

    /*
     * دریافت متغیرهای Runtime از Cloudflare
     */
    const { env } =
      await getCloudflareContext({
        async: true,
      });

    const runtimeEnv =
      env as any;

    const supabaseUrl =
      runtimeEnv
        ?.NEXT_PUBLIC_SUPABASE_URL ||
      "";

    const serviceRoleKey =
      runtimeEnv
        ?.SUPABASE_SERVICE_ROLE_KEY ||
      "";

    const hasSupabase =
      Boolean(
        supabaseUrl &&
          serviceRoleKey
      );

    let knowledge: KnowledgeRow[] =
      [];

    /*
     * دریافت بانک دانش
     */
    if (hasSupabase) {
      knowledge =
        await loadKnowledge(
          supabaseUrl,
          serviceRoleKey
        );
    }

    console.log(
      "Knowledge count:",
      knowledge.length
    );

    /*
     * مهم:
     * ابتدا بانک دانش را بررسی می‌کنیم.
     * اگر پاسخ پیدا شد، اصلاً AI اجرا نمی‌شود.
     */
    const matchedKnowledge =
      findKnowledgeMatch(
        question,
        knowledge
      );

    if (
      matchedKnowledge?.content
    ) {
      return NextResponse.json({
        ok: true,

        answer:
          "بر اساس اطلاعات تأییدشده بانک دانش:\n\n" +
          matchedKnowledge.content,

        source: "knowledge",

        knowledge_count:
          knowledge.length,

        knowledge_match: true,

        knowledge_title:
          matchedKnowledge.title,

        supabase_connected:
          hasSupabase,

        ai_used: false,
      });
    }

    /*
     * اگر پاسخ در بانک دانش نبود،
     * از Workers AI استفاده می‌کنیم.
     */
    const ai =
      runtimeEnv?.AI;

    if (
      !ai ||
      typeof ai.run !== "function"
    ) {
      return NextResponse.json({
        ok: true,

        answer:
          "اطلاعات کافی برای پاسخ دقیق در بانک دانش موجود نیست و این سؤال نیازمند بررسی بیشتر است.",

        source: "fallback",

        knowledge_count:
          knowledge.length,

        knowledge_match: false,

        supabase_connected:
          hasSupabase,

        ai_used: false,
      });
    }

    const context =
      knowledge
        .slice(0, 30)
        .map(
          (item, index) =>
            `منبع ${index + 1}
عنوان: ${item.title || ""}
محتوا: ${item.content || ""}`
        )
        .join("\n\n");

    const systemPrompt = `
تو «مدیر پاسخگو هوشمند» گروه «صدای کارکنان ثبت احوال» هستی.

به زبان فارسی، دقیق، محترمانه و کاربردی پاسخ بده.

بانک دانش تأییدشده سامانه:

${
  context ||
  "هیچ منبع تأییدشده‌ای در بانک دانش وجود ندارد."
}

قواعد:

1. اگر پاسخ سؤال در بانک دانش وجود دارد، فقط بر اساس همان اطلاعات پاسخ بده.

2. هرگز نگو به بانک دانش دسترسی نداری.

3. اطلاعات بانک دانش را تغییر یا تحریف نکن.

4. قانون، بخشنامه، آمار یا اطلاعات رسمی جعلی تولید نکن.

5. اگر اطلاعات کافی در بانک دانش وجود ندارد، صادقانه بگو که سؤال نیازمند بررسی بیشتر است.

6. پاسخ کوتاه، روشن و کاربردی باشد.

7. نام سامانه «مدیر پاسخگو هوشمند» است.

8. از نام «صدایار» استفاده نکن.
`;

    let result: any;

    try {
      result =
        await ai.run(
          "@cf/google/gemma-4-26b-a4b-it",
          {
            messages: [
              {
                role: "system",
                content:
                  systemPrompt,
              },
              {
                role: "user",
                content:
                  question,
              },
            ],

            max_tokens: 1200,

            temperature: 0.2,
          }
        );
    } catch (aiError: any) {
      console.error(
        "WORKERS AI ERROR:",
        aiError
      );

      return NextResponse.json({
        ok: true,

        answer:
          "هوش مصنوعی در حال حاضر پاسخ تولید نکرد. این سؤال نیازمند بررسی بیشتر است.",

        source: "ai-error",

        knowledge_count:
          knowledge.length,

        knowledge_match: false,

        supabase_connected:
          hasSupabase,

        ai_used: true,
      });
    }

    const answer =
      extractAnswer(result);

    if (!answer) {
      return NextResponse.json({
        ok: true,

        answer:
          "برای این سؤال پاسخ قطعی در دسترس نیست و نیازمند بررسی بیشتر است.",

        source: "fallback",

        knowledge_count:
          knowledge.length,

        knowledge_match: false,

        supabase_connected:
          hasSupabase,

        ai_used: true,
      });
    }

    return NextResponse.json({
      ok: true,

      answer,

      source: "workers-ai",

      knowledge_count:
        knowledge.length,

      knowledge_match: false,

      supabase_connected:
        hasSupabase,

      ai_used: true,

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
          error?.message ||
          String(error),
      },
      { status: 500 }
    );
  }
}

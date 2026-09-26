import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type KnowledgeRow = {
  title: string | null;
  content: string | null;
  approved: boolean | null;
};

type RuntimeEnv = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[^\u0600-\u06ff\u0750-\u077f\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
  const aa = new Set(normalizeText(a).split(" ").filter(Boolean));
  const bb = new Set(normalizeText(b).split(" ").filter(Boolean));

  if (aa.size === 0 || bb.size === 0) {
    return 0;
  }

  let common = 0;

  for (const word of aa) {
    if (bb.has(word)) {
      common++;
    }
  }

  return common / Math.max(aa.size, bb.size);
}

function fallbackAnswer(): string {
  return (
    "برای ارائه پاسخ دقیق، اطلاعات تأییدشده کافی در اختیار سامانه نیست. " +
    "این سؤال برای بررسی بیشتر ثبت شد و سامانه از ارائه پاسخ حدسی خودداری می‌کند."
  );
}

async function getKnowledge(
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<KnowledgeRow[]> {
  const supabase = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  const { data, error } = await supabase
    .from("knowledge")
    .select("title, content, approved")
    .eq("approved", true)
    .limit(200);

  if (error) {
    console.error("Knowledge query error:", error);
    return [];
  }

  return (data ?? []) as KnowledgeRow[];
}

async function saveUnansweredQuestion(
  supabaseUrl: string,
  serviceRoleKey: string,
  question: string
): Promise<void> {
  try {
    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { error } = await supabase
      .from("unanswered_questions")
      .insert({
        question,
        status: "pending",
      });

    if (error) {
      console.error("Unanswered question save error:", error);
    }
  } catch (error) {
    console.error("Unanswered question exception:", error);
  }
}

async function tryWorkersAI(
  question: string,
  knowledge: KnowledgeRow[]
): Promise<string | null> {
  const context = knowledge
    .slice(0, 30)
    .map(
      (item, index) =>
        `[منبع ${index + 1}] ${item.title ?? ""}\n${item.content ?? ""}`
    )
    .join("\n\n");

  try {
    const { env } = getCloudflareContext();

    const ai = (env as any).AI;

    if (!ai || typeof ai.run !== "function") {
      console.error("Workers AI binding AI is not available.");
      return null;
    }

    const system = `تو «صدایار»، عضو تیم هوش مصنوعی گروه «صدای کارکنان ثبت احوال» هستی.

وظیفه تو پاسخ‌گویی دقیق، محترمانه و کاربردی به فارسی است.

قوانین:
- اگر اطلاعات بانک دانش برای پاسخ کافی است، از آن استفاده کن.
- اطلاعات موجود در بانک دانش را تحریف نکن.
- اگر سؤال عمومی است و پاسخ آن را می‌دانی، پاسخ روشن و مفید بده.
- اگر موضوع رسمی، حساس یا نیازمند تأیید سازمانی است، صریحاً بگو که نیاز به بررسی انسانی دارد.
- هیچ اطلاعاتی را جعل نکن.
- پاسخ را کوتاه، واضح و مرحله‌ای بنویس.
- هدف سامانه کمک به کارکنان، ثبت مسائل، پیشنهادها، تجربه‌ها و پرسش‌ها و هدایت درست آنهاست.

بانک دانش تأییدشده سامانه:

${context || "در حال حاضر منبع تأییدشده‌ای در بانک دانش وجود ندارد."}`;

    const result = await ai.run(
      "@cf/meta/llama-3.1-8b-instruct-fast",
      {
        messages: [
          {
            role: "system",
            content: system,
          },
          {
            role: "user",
            content: question,
          },
        ],
      }
    );

    const answer =
      typeof result === "string"
        ? result
        : result &&
            typeof result === "object" &&
            "response" in result
          ? String((result as any).response ?? "")
          : "";

    return answer.trim() || null;
  } catch (error) {
    console.error("Workers AI error:", error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);

    const question =
      typeof body?.question === "string"
        ? body.question.trim()
        : typeof body?.text === "string"
          ? body.text.trim()
          : "";

    if (!question) {
      return NextResponse.json(
        {
          ok: false,
          answer: "لطفاً سؤال یا درخواست خود را وارد کنید.",
        },
        { status: 400 }
      );
    }

    const runtimeProcessEnv: RuntimeEnv =
      typeof process !== "undefined" && process.env
        ? (process.env as RuntimeEnv)
        : {};

    const supabaseUrl =
      runtimeProcessEnv.NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      runtimeProcessEnv.SUPABASE_SERVICE_ROLE_KEY;

    let knowledge: KnowledgeRow[] = [];

    if (supabaseUrl && serviceRoleKey) {
      knowledge = await getKnowledge(
        supabaseUrl,
        serviceRoleKey
      );
    }

    const answer = await tryWorkersAI(
      question,
      knowledge
    );

    if (answer) {
      return NextResponse.json({
        ok: true,
        answer,
        source: "workers-ai",
        needs_review: false,
      });
    }

    if (supabaseUrl && serviceRoleKey) {
      await saveUnansweredQuestion(
        supabaseUrl,
        serviceRoleKey,
        question
      );
    }

    return NextResponse.json({
      ok: true,
      answer: fallbackAnswer(),
      source: "fallback",
      needs_review: true,
    });
  } catch (error) {
    console.error("Assistant API error:", error);

    return NextResponse.json(
      {
        ok: false,
        answer:
          "ارتباط با صدایار با خطا مواجه شد. لطفاً دوباره تلاش کنید.",
        needs_review: true,
      },
      { status: 500 }
    );
  }
      }

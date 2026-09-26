import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type KnowledgeRow = {
  title: string | null;
  content: string | null;
  approved: boolean | null;
};

type CloudflareAI = {
  run: (
    model: string,
    input: {
      messages: Array<{
        role: "system" | "user" | "assistant";
        content: string;
      }>;
    }
  ) => Promise<unknown>;
};

type CloudflareEnv = {
  AI?: CloudflareAI;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

function getRuntimeEnv(): CloudflareEnv {
  const processEnv =
    typeof process !== "undefined" && process.env
      ? process.env
      : {};

  return {
    AI: undefined,
    NEXT_PUBLIC_SUPABASE_URL:
      processEnv.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY:
      processEnv.SUPABASE_SERVICE_ROLE_KEY,
  };
}

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
  /*
   * در این نسخه مستقیماً cloudflare:workers را import نمی‌کنیم.
   * بنابراین next build با Webpack دچار UnhandledSchemeError نمی‌شود.
   *
   * اگر AI binding در runtime در دسترس باشد، می‌توانیم در مرحله بعد
   * آن را به شکل سازگار با OpenNext متصل کنیم.
   */

  const context = knowledge
    .slice(0, 20)
    .map(
      (item, index) =>
        `${index + 1}. ${item.title ?? ""}\n${item.content ?? ""}`
    )
    .join("\n\n");

  if (!context) {
    return null;
  }

  /*
   * فعلاً پاسخ مبتنی بر بانک دانش را برمی‌گردانیم.
   * این باعث می‌شود سامانه بدون وابستگی مستقیم به cloudflare:workers
   * بتواند Build و Deploy شود.
   */

  const ranked = knowledge
    .map((item) => {
      const text = `${item.title ?? ""} ${item.content ?? ""}`;
      return {
        item,
        score: similarity(question, text),
      };
    })
    .filter((x) => x.score >= 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (ranked.length === 0) {
    return null;
  }

  return ranked
    .map(
      ({ item }) =>
        `${item.title ? `📌 ${item.title}\n` : ""}${item.content ?? ""}`
    )
    .join("\n\n");
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

    const env = getRuntimeEnv();

    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

    let knowledge: KnowledgeRow[] = [];

    if (supabaseUrl && serviceRoleKey) {
      knowledge = await getKnowledge(
        supabaseUrl,
        serviceRoleKey
      );
    } else {
      console.error(
        "Supabase environment variables are not configured."
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
        source: "knowledge",
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

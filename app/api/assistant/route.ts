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

    const { data, error } = await supabase
      .from("knowledge")
      .select("title, content, approved")
      .eq("approved", true)
      .limit(200);

    if (error) {
      console.error(
        "Knowledge query error:",
        error
      );

      return [];
    }

    return (data ?? []) as KnowledgeRow[];
  } catch (error) {
    console.error(
      "Knowledge exception:",
      error
    );

    return [];
  }
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
      console.error(
        "Unanswered question save error:",
        error
      );
    }
  } catch (error) {
    console.error(
      "Unanswered question exception:",
      error
    );
  }
}

function extractAnswer(result: any): string {
  if (!result) return "";

  if (
    typeof result.response === "string" &&
    result.response.trim()
  ) {
    return result.response.trim();
  }

  const content =
    result?.choices?.[0]?.message?.content;

  if (
    typeof content === "string" &&
    content.trim()
  ) {
    return content.trim();
  }

  if (
    typeof result.text === "string" &&
    result.text.trim()
  ) {
    return result.text.trim();
  }

  return "";
}

async function tryWorkersAI(
  question: string,
  knowledge: KnowledgeRow[]
): Promise<string | null> {
  const context = knowledge
    .slice(0, 30)
    .map(
      (item, index) =>
        `[منبع ${index + 1}] ${
          item.title ?? ""
        }\n${item.content ?? ""}`
    )
    .join("\n\n");

  try {
    const { env } =
      await getCloudflareContext({
        async: true,
      });

    const ai = (env as any).AI;

    if (
      !ai ||
      typeof ai.run !== "function"
    ) {
      console.error(
        "Workers AI binding is unavailable."
      );

      return null;
    }

    const system = `
تو «مدیر پاسخگو هوشمند» گروه «صدای کارکنان ثبت احوال» هستی.

وظیفه تو پاسخ‌گویی دقیق، محترمانه و کاربردی به فارسی است.

قوانین:

- اگر اطلاعات بانک دانش برای پاسخ کافی است، از آن استفاده کن.
- اطلاعات بانک دانش را تحریف نکن.
- اطلاعات، قانون، بخشنامه یا آمار جعلی تولید نکن.
- اگر سؤال عمومی است و پاسخ را می‌دانی، پاسخ روشن و مفید بده.
- اگر موضوع رسمی، حساس یا سازمانی است، در صورت نبود منبع معتبر بگو که نیاز به بررسی انسانی دارد.
- پاسخ‌ها را کوتاه، واضح و کاربردی بنویس.
- در صورت نیاز مراحل را شماره‌گذاری کن.
- از ارائه پاسخ حدسی خودداری کن.
- نام سامانه «مدیر پاسخگو هوشمند» است.
- از نام «صدایار» استفاده نکن.

بانک دانش تأییدشده:

${
  context ||
  "در حال حاضر منبع تأییدشده‌ای در بانک دانش وجود ندارد."
}
`;

    const result = await ai.run(
      "@cf/google/gemma-4-26b-a4b-it",
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
        max_tokens: 1200,
        temperature: 0.2,
      }
    );

    const answer =
      extractAnswer(result);

    return answer || null;
  } catch (error) {
    console.error(
      "Workers AI error:",
      error
    );

    return null;
  }
}

export async function POST(
  request: NextRequest
) {
  try {
    const body =
      await request.json().catch(
        () => null
      );

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
          answer:
            "لطفاً سؤال یا درخواست خود را وارد کنید.",
        },
        {
          status: 400,
        }
      );
    }

    const runtimeProcessEnv: RuntimeEnv =
      typeof process !== "undefined" &&
      process.env
        ? (process.env as RuntimeEnv)
        : {};

    const supabaseUrl =
      runtimeProcessEnv
        .NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      runtimeProcessEnv
        .SUPABASE_SERVICE_ROLE_KEY;

    let knowledge: KnowledgeRow[] = [];

    if (
      supabaseUrl &&
      serviceRoleKey
    ) {
      knowledge =
        await getKnowledge(
          supabaseUrl,
          serviceRoleKey
        );
    }

    const answer =
      await tryWorkersAI(
        question,
        knowledge
      );

    if (answer) {
      return NextResponse.json({
        ok: true,
        answer,
        source: "workers-ai",
        model:
          "@cf/google/gemma-4-26b-a4b-it",
        needs_review: false,
      });
    }

    if (
      supabaseUrl &&
      serviceRoleKey
    ) {
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
    console.error(
      "Assistant API error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        answer:
          "ارتباط با مدیر پاسخگو هوشمند با خطا مواجه شد. لطفاً دوباره تلاش کنید.",
        needs_review: true,
      },
      {
        status: 500,
      }
    );
  }
}

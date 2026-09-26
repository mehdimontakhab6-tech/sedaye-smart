import { createClient } from "@supabase/supabase-js";

interface Env {
  AI: Ai;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

interface KnowledgeItem {
  title: string;
  content: string;
  approved?: boolean;
}

interface AiResponse {
  response?: string;
  answer?: string;
  text?: string;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
  const aa = new Set(normalize(a).split(" ").filter(Boolean));
  const bb = new Set(normalize(b).split(" ").filter(Boolean));

  if (!aa.size || !bb.size) return 0;

  let common = 0;

  for (const word of aa) {
    if (bb.has(word)) common++;
  }

  return common / Math.max(aa.size, bb.size);
}

async function askAI(
  env: Env,
  question: string,
  knowledge: KnowledgeItem[]
): Promise<string | null> {
  if (!env.AI) {
    console.error("Cloudflare AI binding is not available.");
    return null;
  }

  const knowledgeText = knowledge
    .slice(0, 20)
    .map(
      (item, index) =>
        `${index + 1}. ${item.title}\n${item.content}`
    )
    .join("\n\n");

  const systemPrompt = `
تو «صدایار» هستی؛ دستیار هوشمند گروه «صدای کارکنان ثبت احوال».

وظایف:
- پاسخ دقیق، محترمانه و روان به زبان فارسی
- کمک مرحله‌به‌مرحله به کاربران
- استفاده از اطلاعات بانک دانش در صورت وجود
- هرگز اطلاعات را جعل نکن
- اگر اطلاعات کافی برای پاسخ مطمئن وجود ندارد، صادقانه اعلام کن
- برای موضوعات حساس، رسمی یا سازمانی، پاسخ قطعی بدون منبع نده
- پاسخ‌ها کوتاه، کاربردی و قابل فهم باشند

نام گروه:
صدای کارکنان ثبت احوال

شعار:
هم‌صدایی برای تحول و بهبود

اطلاعات بانک دانش:
${knowledgeText || "اطلاعات تأییدشده‌ای در بانک دانش موجود نیست."}
`;

  try {
    const result = (await env.AI.run(
      "@cf/zai-org/glm-4.7-flash",
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
      }
    )) as AiResponse;

    const answer =
      result?.response ||
      result?.answer ||
      result?.text ||
      null;

    if (!answer || typeof answer !== "string") {
      console.error("Cloudflare AI returned no usable answer:", result);
      return null;
    }

    return answer.trim();
  } catch (error) {
    console.error("Cloudflare AI error:", error);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const question =
      typeof body?.question === "string"
        ? body.question.trim()
        : "";

    if (!question) {
      return Response.json(
        {
          ok: false,
          answer: "لطفاً سؤال خود را وارد کنید.",
          needs_review: false,
        },
        { status: 400 }
      );
    }

    const env = (globalThis as unknown as { env?: Env }).env;

    if (!env?.AI) {
      console.error("AI binding is unavailable in Worker runtime.");

      return Response.json(
        {
          ok: false,
          answer:
            "در حال حاضر ارتباط با موتور هوش مصنوعی برقرار نشد. لطفاً چند لحظه بعد دوباره تلاش کنید.",
          needs_review: true,
          error: "AI binding unavailable",
        },
        { status: 503 }
      );
    }

    let knowledge: KnowledgeItem[] = [];

    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(
          supabaseUrl,
          supabaseKey
        );

        const { data, error } = await supabase
          .from("knowledge")
          .select("title, content, approved")
          .eq("approved", true)
          .limit(200);

        if (!error && Array.isArray(data)) {
          knowledge = data as KnowledgeItem[];
        } else if (error) {
          console.error("Knowledge query error:", error);
        }
      } catch (error) {
        console.error("Supabase connection error:", error);
      }
    }

    const rankedKnowledge = knowledge
      .map((item) => ({
        item,
        score:
          similarity(question, `${item.title} ${item.content}`),
      }))
      .filter((item) => item.score >= 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((item) => item.item);

    const answer = await askAI(
      env,
      question,
      rankedKnowledge
    );

    if (answer) {
      return Response.json({
        ok: true,
        answer,
        source:
          rankedKnowledge.length > 0
            ? "بانک دانش + هوش مصنوعی"
            : "هوش مصنوعی",
        confidence:
          rankedKnowledge.length > 0 ? "high" : "medium",
        model: "@cf/zai-org/glm-4.7-flash",
        verified_source: rankedKnowledge.length > 0,
        needs_review: false,
      });
    }

    if (rankedKnowledge.length > 0) {
      return Response.json({
        ok: true,
        answer:
          rankedKnowledge[0].content ||
          "اطلاعات مرتبط در بانک دانش پیدا شد.",
        source: "بانک دانش",
        confidence: "high",
        model: null,
        verified_source: true,
        needs_review: false,
      });
    }

    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(
          supabaseUrl,
          supabaseKey
        );

        await supabase
          .from("unanswered_questions")
          .insert({
            question,
          });
      } catch (error) {
        console.error(
          "Could not save unanswered question:",
          error
        );
      }
    }

    return Response.json({
      ok: true,
      answer:
        "برای این سؤال هنوز اطلاعات تأییدشده کافی در اختیار ندارم. سؤال شما برای بررسی و تکمیل بانک دانش ثبت شد.",
      source: "نیازمند بررسی",
      confidence: "low",
      model: null,
      verified_source: false,
      needs_review: true,
    });
  } catch (error) {
    console.error("Assistant route error:", error);

    return Response.json(
      {
        ok: false,
        answer:
          "در پردازش درخواست شما خطایی رخ داد. لطفاً دوباره تلاش کنید.",
        needs_review: true,
      },
      { status: 500 }
    );
  }
           }

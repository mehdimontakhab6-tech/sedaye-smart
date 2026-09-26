export type Provider = "openai" | "anthropic" | "gemini";

export type AIResult = {
  provider: Provider;
  model: string;
  answer: string;
  success: boolean;
  error?: string;
};

export type TeamResult = {
  answer: string;
  category: string;
  confidence: number;
  needs_review: boolean;
  reason: string;
  evidence: string[];
  providers: AIResult[];
};

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

function systemPrompt() {
  return `
تو عضو تیم هوش مصنوعی سامانه «صدای کارکنان ثبت احوال» هستی.

قواعد:
1. هرگز اطلاعات را حدس نزن.
2. اگر اطلاعات کافی نیست، صریحاً اعلام کن.
3. اطلاعات قدیمی را به عنوان اطلاعات فعلی معرفی نکن.
4. بین واقعیت، برداشت و پیشنهاد تفاوت بگذار.
5. در موضوعات اداری، سازمانی و حقوقی بسیار محتاط باش.
6. اگر پاسخ نیازمند منبع رسمی یا بررسی انسانی است، آن را اعلام کن.
7. پاسخ فارسی، روشن، دقیق و کاربردی باشد.
8. هدف، پاسخ درست و قابل اتکا است؛ نه صرفاً پاسخ سریع.
`;
}

function buildPrompt(question: string, knowledge: string) {
  return `
${systemPrompt()}

پایگاه دانش تأییدشده:
${knowledge || "اطلاعات تأییدشده‌ای در پایگاه دانش موجود نیست."}

سؤال کاربر:
${question}

یک پاسخ دقیق تهیه کن.
اگر اطلاعات کافی برای پاسخ وجود ندارد، حدس نزن.
`;
}

async function callOpenAI(prompt: string): Promise<AIResult> {
  const key = process.env.OPENAI_API_KEY;

  if (!key) {
    return {
      provider: "openai",
      model: OPENAI_MODEL,
      answer: "",
      success: false,
      error: "OPENAI_API_KEY is not configured",
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: prompt,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI HTTP ${response.status}`);
    }

    const data = await response.json();

    return {
      provider: "openai",
      model: OPENAI_MODEL,
      answer: data.output_text || "",
      success: true,
    };
  } catch (error) {
    return {
      provider: "openai",
      model: OPENAI_MODEL,
      answer: "",
      success: false,
      error: String(error),
    };
  }
}

async function callAnthropic(prompt: string): Promise<AIResult> {
  const key = process.env.ANTHROPIC_API_KEY;

  if (!key) {
    return {
      provider: "anthropic",
      model: ANTHROPIC_MODEL,
      answer: "",
      success: false,
      error: "ANTHROPIC_API_KEY is not configured",
    };
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 3000,
        system: systemPrompt(),
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic HTTP ${response.status}`);
    }

    const data = await response.json();

    const answer =
      data.content
        ?.filter((item: any) => item.type === "text")
        ?.map((item: any) => item.text)
        ?.join("\n") || "";

    return {
      provider: "anthropic",
      model: ANTHROPIC_MODEL,
      answer,
      success: true,
    };
  } catch (error) {
    return {
      provider: "anthropic",
      model: ANTHROPIC_MODEL,
      answer: "",
      success: false,
      error: String(error),
    };
  }
}

async function callGemini(prompt: string): Promise<AIResult> {
  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    return {
      provider: "gemini",
      model: GEMINI_MODEL,
      answer: "",
      success: false,
      error: "GEMINI_API_KEY is not configured",
    };
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini HTTP ${response.status}`);
    }

    const data = await response.json();

    const answer =
      data.candidates?.[0]?.content?.parts
        ?.map((item: any) => item.text || "")
        ?.join("\n") || "";

    return {
      provider: "gemini",
      model: GEMINI_MODEL,
      answer,
      success: true,
    };
  } catch (error) {
    return {
      provider: "gemini",
      model: GEMINI_MODEL,
      answer: "",
      success: false,
      error: String(error),
    };
  }
}

async function judgeAnswers(
  question: string,
  answers: string
): Promise<TeamResult | null> {
  const judge = await callOpenAI(`
${systemPrompt()}

تو ناظر نهایی تیم هوش مصنوعی هستی.

سؤال:
${question}

پاسخ‌های مستقل اعضای تیم:

${answers}

پاسخ‌ها را مقایسه کن.

وظایف:
- موارد مشترک را پیدا کن.
- اختلاف‌ها را مشخص کن.
- اطلاعات بدون پشتوانه را وارد پاسخ نکن.
- صرفاً به دلیل تکرار یک ادعا توسط چند مدل، آن را واقعیت قطعی فرض نکن.
- اگر اطلاعات کافی نیست، needs_review را true قرار بده.
- اگر پاسخ به اطلاعات روز یا منبع رسمی نیاز دارد، needs_review را true قرار بده.

فقط JSON معتبر زیر را برگردان:

{
  "answer": "پاسخ نهایی فارسی",
  "category": "question",
  "confidence": 0,
  "needs_review": true,
  "reason": "دلیل",
  "evidence": []
}
`);

  if (!judge.success || !judge.answer) {
    return null;
  }

  try {
    const cleaned = judge.answer
      .replace(/^```json/i, "")
      .replace(/^```/i, "")
      .replace(/```$/i, "")
      .trim();

    const result = JSON.parse(cleaned);

    return {
      answer: String(result.answer || ""),
      category: String(result.category || "other"),
      confidence: Number(result.confidence || 0),
      needs_review: Boolean(result.needs_review),
      reason: String(result.reason || ""),
      evidence: Array.isArray(result.evidence)
        ? result.evidence.map(String)
        : [],
      providers: [],
    };
  } catch {
    return null;
  }
}

export async function runAITeam(
  question: string,
  knowledge: string
): Promise<TeamResult> {
  const prompt = buildPrompt(question, knowledge);

  const providers = await Promise.all([
    callOpenAI(prompt),
    callAnthropic(prompt),
    callGemini(prompt),
  ]);

  const successful = providers.filter(
    (provider) =>
      provider.success && provider.answer.trim().length > 0
  );

  // برای جلوگیری از پاسخ حدسی، حداقل دو موتور باید پاسخ معتبر بدهند.
  if (successful.length < 2) {
    return {
      answer:
        "برای ارائه پاسخ دقیق، اطلاعات کافی از تیم هوش مصنوعی دریافت نشد. سؤال برای بررسی بیشتر ثبت می‌شود.",
      category: "نیازمند بررسی",
      confidence: 0,
      needs_review: true,
      reason:
        "کمتر از دو موتور هوش مصنوعی پاسخ معتبر ارائه کردند.",
      evidence: [],
      providers,
    };
  }

  const answers = successful
    .map(
      (item) =>
        `### ${item.provider}\n${item.answer}`
    )
    .join("\n\n");

  const finalResult = await judgeAnswers(question, answers);

  if (!finalResult) {
    return {
      answer:
        "پاسخ‌های تیم نیازمند بررسی نهایی هستند. سامانه برای جلوگیری از ارائه پاسخ نادرست، پاسخ قطعی ارائه نمی‌کند.",
      category: "نیازمند بررسی",
      confidence: 0,
      needs_review: true,
      reason: "ناظر نهایی تیم در دسترس نبود یا خروجی معتبر نبود.",
      evidence: [],
      providers,
    };
  }

  return {
    ...finalResult,
    providers,
  };
      }

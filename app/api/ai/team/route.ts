import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question = String(body?.question || "").trim();

    if (!question) {
      return NextResponse.json(
        { error: "لطفاً پرسش خود را وارد کنید." },
        { status: 400 }
      );
    }

    const { env } = getCloudflareContext();

    if (!env?.AI) {
      return NextResponse.json(
        {
          ok: false,
          error: "اتصال به Cloudflare AI برقرار نیست."
        },
        { status: 500 }
      );
    }

    const result: any = await env.AI.run(
      "@cf/google/gemma-4-26b-a4b-it",
      {
        messages: [
          {
            role: "system",
            content: `
تو «مدیر پاسخگو هوشمند» گروه «صدای کارکنان ثبت احوال» هستی.

به پرسش کاربر به زبان فارسی، دقیق، کاربردی و روشن پاسخ بده.

اگر اطلاعات رسمی یا منبع معتبر در اختیار نداری،
آن را به عنوان مقررات یا دستورالعمل رسمی معرفی نکن.

از ساختن اطلاعات، آمار، قانون یا بخشنامه جعلی خودداری کن.
`
          },
          {
            role: "user",
            content: question
          }
        ],
        max_tokens: 1500,
        temperature: 0.2,
        chat_template_kwargs: {
          enable_thinking: false
        }
      }
    );

    let answer = "";

    if (
      result?.choices?.[0]?.message?.content &&
      typeof result.choices[0].message.content === "string"
    ) {
      answer = result.choices[0].message.content.trim();
    }

    if (!answer && typeof result?.response === "string") {
      answer = result.response.trim();
    }

    if (!answer && typeof result?.text === "string") {
      answer = result.text.trim();
    }

    if (!answer) {
      return NextResponse.json(
        {
          ok: false,
          error: "مدل اجرا شد اما پاسخ متنی دریافت نشد.",
          raw: result
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      answer,
      manager: {
        name: "مدیر پاسخگو هوشمند",
        model: "@cf/google/gemma-4-26b-a4b-it"
      }
    });

  } catch (error: any) {
    console.error("AI TEAM ERROR:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "خطای ناشناخته در سامانه هوش مصنوعی."
      },
      { status: 500 }
    );
  }
}

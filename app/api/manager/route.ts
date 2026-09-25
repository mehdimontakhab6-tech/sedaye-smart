import { NextResponse } from "next/server";

type Category =
  | "پیشنهاد"
  | "مسئله"
  | "سؤال"
  | "اطلاع‌رسانی"
  | "تجربه"
  | "اصلاح فرآیند"
  | "نوآوری";

function classify(text: string): Category {
  const value = text.trim();

  if (
    /چطور|چگونه|آیا|کجا|چه زمانی|سؤال|سوال|استعلام/.test(
      value
    )
  ) {
    return "سؤال";
  }

  if (
    /پیشنهاد|بهتر است|بهتره|پیشنهاد می‌کنم|پیشنهاد میکنم/.test(
      value
    )
  ) {
    return "پیشنهاد";
  }

  if (
    /ایده|نوآوری|خلاق|هوشمند|راهکار جدید/.test(
      value
    )
  ) {
    return "نوآوری";
  }

  if (
    /فرآیند|فرایند|سامانه|رویه|مراحل|صدور|ثبت|اصلاح/.test(
      value
    )
  ) {
    return "اصلاح فرآیند";
  }

  if (
    /تجربه|تجربه من|تجربه بنده|در تجربه/.test(
      value
    )
  ) {
    return "تجربه";
  }

  if (
    /اطلاع|اطلاعیه|اعلام|خبر|به اطلاع/.test(
      value
    )
  ) {
    return "اطلاع‌رسانی";
  }

  return "مسئله";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const text = body?.text?.trim();

  if (!text) {
    return NextResponse.json(
      {
        ok: false,
        error: "متن پیام ارسال نشده است."
      },
      { status: 400 }
    );
  }

  const category = classify(text);

  return NextResponse.json({
    ok: true,
    category,
    text,
    needs_review: true
  });
}

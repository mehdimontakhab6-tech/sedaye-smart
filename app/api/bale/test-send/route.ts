import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

async function sendMessage(
  token: string,
  chatId: string,
  text: string
) {
  const response = await fetch(
    `https://tapi.bale.ai/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    }
  );

  const result = await response
    .json()
    .catch(() => ({}));

  return {
    ok: response.ok,
    status: response.status,
    result,
  };
}

export async function GET() {
  try {
    const { env } =
      await getCloudflareContext({
        async: true,
      });

    /*
     * همان توکن اصلی ربات صدای هوشمند
     */
    const token =
      env?.BALE_SMART_TOKEN;

    /*
     * گروه هدف
     */
    const chatId = String(
      env?.BALE_GROUP_ID || ""
    );

    if (!token || !chatId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "BALE_SMART_TOKEN یا BALE_GROUP_ID تنظیم نشده است.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * ─────────────────────────────────────
     * پیام تست تقویم
     * ─────────────────────────────────────
     */
    const calendarMessage =
      `☀️ تقویم روزانه — پیام آزمایشی

📅 تاریخ شمسی: ۱۴۰۵/۰۷/۱۲
📆 یکشنبه

🗓️ تاریخ قمری: آزمایشی
🌍 تاریخ میلادی: آزمایشی

⏰ زمان ارسال: آزمایشی

📊 چشم‌انداز سال
████████░░░░░░░░░░░░ ۴۰٪

🌙 وضعیت ماه: آزمایشی

✨ جرعه‌ای تفکر:
امروز فرصتی تازه برای بهتر انجام دادن یک کار کوچک است.

🤖 صدای هوشمند
پیام آزمایشی ارسال تقویم`;

    /*
     * ─────────────────────────────────────
     * پیام تست اخبار ثبت احوال
     * ─────────────────────────────────────
     */
    const newsMessage =
      `📰 ثبت احوال در رسانه ها

🔎 پیام آزمایشی ارسال اخبار ثبت احوال

این پیام برای بررسی اتصال سامانه «صدای هوشمند» به گروه بله ارسال شده است.

⏱️ در ارسال واقعی:
فقط اخبار مرتبط با ثبت احوال که در بازه دقیق
۲۲:۳۰ تا ۲۲:۳۰ تهران منتشر شده باشند
ارسال خواهند شد.

🚫 هیچ خبر خارج از این بازه ارسال نمی‌شود.

🤖 صدای هوشمند`;

    /*
     * ارسال اول: تقویم
     */
    const calendar =
      await sendMessage(
        token,
        chatId,
        calendarMessage
      );

    /*
     * ارسال دوم: اخبار
     */
    const news =
      await sendMessage(
        token,
        chatId,
        newsMessage
      );

    /*
     * نتیجه نهایی
     */
    return NextResponse.json({
      ok:
        calendar.ok &&
        news.ok,

      test: true,

      chat_id: chatId,

      calendar: {
        sent: calendar.ok,
        status: calendar.status,
        bale: calendar.result,
      },

      news: {
        sent: news.ok,
        status: news.status,
        bale: news.result,
      },

      message:
        calendar.ok && news.ok
          ? "هر دو پیام آزمایشی با موفقیت ارسال شدند."
          : "حداقل یکی از پیام‌های آزمایشی ارسال نشد.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        test: true,
        error:
          error instanceof Error
            ? error.message
            : "خطای ناشناخته",
      },
      {
        status: 500,
      }
    );
  }
}

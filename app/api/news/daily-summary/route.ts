import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const WEEKDAYS = [
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنج‌شنبه",
  "جمعه",
  "شنبه"
];

const MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند"
];

const ZODIAC = [
  "حمل",
  "ثور",
  "جوزا",
  "سرطان",
  "اسد",
  "سنبله",
  "میزان",
  "عقرب",
  "قوس",
  "جدی",
  "دلو",
  "حوت"
];

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function faNumber(value: number | string) {
  return String(value).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

function getPersianDate() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).formatToParts(now);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value || 0);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    date: now
  };
}

function getGregorianDate() {
  const now = new Date();

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

function getTime() {
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date());
}

async function getHijri(gregorian: string) {
  try {
    const [year, month, day] = gregorian.split("-");

    const response = await fetch(
      `https://api.aladhan.com/v1/gToH?date=${day}-${month}-${year}`
    );

    if (!response.ok) return null;

    const data: any = await response.json();

    return data?.data?.hijri || null;
  } catch {
    return null;
  }
}

async function getEvents(year: number, month: number, day: number) {
  try {
    const url =
      `https://hmarzban.github.io/pipe2time.ir/api/` +
      `${year}/events.json`;

    const response = await fetch(url);

    if (!response.ok) return [];

    const data: any = await response.json();

    const yearData = data?.[String(year)];

    if (!Array.isArray(yearData)) return [];

    const events: string[] = [];

    for (const monthData of yearData) {
      if (!Array.isArray(monthData?.events)) continue;

      for (const event of monthData.events) {
        const jDate = String(event.jDate || "");
        const expected =
          `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;

        if (jDate === expected) {
          events.push(String(event.text || ""));
        }
      }
    }

    return [...new Set(events)];
  } catch {
    return [];
  }
}

function isHoliday(day: number) {
  return day === 5;
}

export async function GET() {
  try {
    const { env } = await getCloudflareContext({ async: true });

    const token = env?.BALE_SMART_TOKEN;
    const chatId = String(env?.BALE_GROUP_ID || "4554953620");

    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error: "BALE_SMART_TOKEN تنظیم نشده است."
        },
        { status: 500 }
      );
    }

    const persian = getPersianDate();
    const gregorian = getGregorianDate();

    const [hijri, events] = await Promise.all([
      getHijri(gregorian),
      getEvents(
        persian.year,
        persian.month,
        persian.day
      )
    ]);

    const weekdayIndex = new Date(
      `${gregorian}T12:00:00+03:30`
    ).getDay();

    const weekday = WEEKDAYS[weekdayIndex];

    const workingDay =
      weekday !== "جمعه" && !isHoliday(persian.day);

    const zodiac = ZODIAC[persian.month - 1];

    const monthName =
      MONTHS[persian.month - 1] || "";

    const hijriText = hijri
      ? `${faNumber(hijri.day)} ${hijri.month?.ar || ""} ${faNumber(hijri.year)}`
      : "اطلاعات قمری در دسترس نیست";

    const eventText =
      events.length > 0
        ? events.map((e) => `• ${e}`).join("\n")
        : "مناسبت ثبت‌شده‌ای برای امروز پیدا نشد.";

    const message = [
      "☀️ روزت پر از اتفاقات خوب",
      "",
      "📅 تقویم روزانه",
      "",
      `🟢 شمسی: ${faNumber(persian.year)}/${faNumber(
        String(persian.month).padStart(2, "0")
      )}/${faNumber(String(persian.day).padStart(2, "0"))}`,
      `📆 ${weekday} ${faNumber(persian.day)} ${monthName} ${faNumber(persian.year)}`,
      `🌍 میلادی: ${gregorian}`,
      `🌙 قمری: ${hijriText}`,
      `🕐 ساعت ایران: ${getTime()}`,
      "",
      `📌 وضعیت روز: ${
        workingDay ? "روز کاری" : "تعطیل"
      }`,
      `♈ برج: ${zodiac}`,
      "",
      "🎯 مناسبت‌های امروز:",
      eventText,
      "",
      "💭 جرعه‌ای تفکر:",
      "هر روز فرصت تازه‌ای برای بهتر دیدن، بهتر اندیشیدن و بهتر عمل کردن است.",
      "",
      "🤖 مدیر هوشمند گروه"
    ].join("\n");

    const response = await fetch(
      `https://tapi.bale.ai/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          disable_web_page_preview: true
        })
      }
    );

    const result = await response.json().catch(() => ({}));

    return NextResponse.json({
      ok: response.ok && result?.ok === true,
      calendar: {
        shamsi: `${persian.year}/${persian.month}/${persian.day}`,
        gregorian,
        hijri: hijriText,
        weekday,
        workingDay,
        events
      },
      sent: result
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "خطای ناشناخته"
      },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const TIME_ZONE = "Asia/Tehran";
const digits = "۰۱۲۳۴۵۶۷۸۹";

const normalize = (value: string) =>
  value.replace(/[۰-۹]/g, (d) => String(digits.indexOf(d)));

function getTehranParts() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(now);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second")
  };
}

function getPersianDate(date: Date) {
  const parts = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";

  return {
    year: Number(normalize(get("year"))),
    month: Number(normalize(get("month"))),
    day: Number(normalize(get("day")))
  };
}

function toPersianNumber(value: number | string) {
  return String(value).replace(
    /\d/g,
    (d) => digits[Number(d)]
  );
}

function getWeekday(date: Date) {
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: TIME_ZONE,
    weekday: "long"
  }).format(date);
}

function getPersianDayOfYear(month: number, day: number) {
  let total = 0;

  for (let m = 1; m < month; m++) {
    total += m <= 6 ? 31 : m <= 11 ? 30 : 29;
  }

  return total + day;
}

function getYearProgress(month: number, day: number) {
  const dayOfYear = getPersianDayOfYear(month, day);
  const totalDays = 365;

  return {
    dayOfYear,
    totalDays,
    percent: ((dayOfYear / totalDays) * 100).toFixed(1)
  };
}

function getPersianZodiac(month: number) {
  const signs = [
    "حمل ♈",
    "ثور ♉",
    "جوزا ♊",
    "سرطان ♋",
    "اسد ♌",
    "سنبله ♍",
    "میزان ♎",
    "عقرب ♏",
    "قوس ♐",
    "جدی ♑",
    "دلو ♒",
    "حوت ♓"
  ];

  return signs[month - 1] || "";
}

function getMoonPhase(date: Date) {
  const knownNewMoon = Date.UTC(
    2000,
    0,
    6,
    18,
    14
  );

  const synodicMonth = 29.530588853;

  const age =
    ((date.getTime() - knownNewMoon) / 86400000) %
    synodicMonth;

  const normalized =
    age < 0
      ? age + synodicMonth
      : age;

  if (normalized < 1.85)
    return "ماه نو 🌑";

  if (normalized < 7.38)
    return "هلال افزاینده 🌒";

  if (normalized < 9.22)
    return "ربع اول 🌓";

  if (normalized < 14.77)
    return "تربیع افزاینده 🌔";

  if (normalized < 16.61)
    return "ماه کامل 🌕";

  if (normalized < 22.15)
    return "تربیع کاهنده 🌖";

  if (normalized < 23.99)
    return "ربع آخر 🌗";

  return "هلال کاهنده 🌘";
}

async function getHijriDate(gregorian: string) {
  try {
    const response = await fetch(
      `https://api.aladhan.com/v1/gToH?date=${gregorian}`,
      {
        headers: {
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) return null;

    const json = await response.json();
    const hijri = json?.data?.hijri;

    if (!hijri) return null;

    return {
      day: hijri.day,
      month:
        hijri.month?.ar ||
        hijri.month?.en ||
        "",
      year: hijri.year
    };
  } catch {
    return null;
  }
}

async function getEvents(persianYear: number) {
  try {
    const response = await fetch(
      `https://hmarzban.github.io/pipe2time.ir/api/${persianYear}/events.json`,
      {
        headers: {
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) return [];

    const data = await response.json();

    const events: any[] = [];

    if (Array.isArray(data)) {
      return data;
    }

    const yearData =
      data?.[String(persianYear)];

    if (Array.isArray(yearData)) {
      for (const monthData of yearData) {
        if (Array.isArray(monthData?.events)) {
          events.push(
            ...monthData.events
          );
        }
      }
    }

    if (Array.isArray(data?.events)) {
      events.push(
        ...data.events
      );
    }

    return events;
  } catch {
    return [];
  }
}

function getEventsForDay(
  events: any[],
  persianMonth: number,
  persianDay: number
) {
  return events.filter((event) => {
    const jDate = String(
      event?.jDate ||
      event?.date ||
      ""
    );

    const normalizedDate =
      normalize(jDate);

    const match =
      normalizedDate.match(
        /^(?:\d{4}[\/\-])?(\d{1,2})[\/\-](\d{1,2})$/
      );

    if (match) {
      const month = Number(match[1]);
      const day = Number(match[2]);

      if (
        month === persianMonth &&
        day === persianDay
      ) {
        return true;
      }
    }

    const month = Number(
      event?.jMonth ??
      event?.month ??
      event?.persianMonth ??
      0
    );

    const day = Number(
      event?.jDay ??
      event?.day ??
      event?.persianDay ??
      0
    );

    return (
      month === persianMonth &&
      day === persianDay
    );
  });
}

function getHoliday(events: any[]) {
  return events.some(
    (event) =>
      event?.isHoliday === true ||
      event?.isHoliday === 1 ||
      event?.isHoliday === "1" ||
      event?.holiday === true ||
      event?.holiday === 1 ||
      event?.holiday === "1" ||
      event?.is_holiday === true
  );
}

function getEventText(events: any[]) {
  return events
    .map((event) =>
      String(
        event?.text ||
        event?.title ||
        event?.name ||
        event?.description ||
        ""
      ).trim()
    )
    .filter(Boolean)
    .slice(0, 8);
}

export async function GET() {
  try {
    const { env } =
      await getCloudflareContext({
        async: true
      });

    const token =
      env?.BALE_SMART_TOKEN;

    const chatId = String(
      env?.BALE_GROUP_ID || ""
    );

    if (!token || !chatId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "BALE_SMART_TOKEN یا BALE_GROUP_ID تنظیم نشده است."
        },
        {
          status: 500
        }
      );
    }

    const now = new Date();

    const tehran =
      getTehranParts();

    const persian =
      getPersianDate(now);

    const gregorian =
      `${tehran.year}-` +
      `${String(tehran.month).padStart(2, "0")}-` +
      `${String(tehran.day).padStart(2, "0")}`;

    const weekday =
      getWeekday(now);

    const hijri =
      await getHijriDate(
        `${String(tehran.day).padStart(2, "0")}-` +
        `${String(tehran.month).padStart(2, "0")}-` +
        `${tehran.year}`
      );

    const allEvents =
      await getEvents(
        persian.year
      );

    const todayEvents =
      getEventsForDay(
        allEvents,
        persian.month,
        persian.day
      );

    const holiday =
      getHoliday(
        todayEvents
      );

    const progress =
      getYearProgress(
        persian.month,
        persian.day
      );

    const moonPhase =
      getMoonPhase(now);

    const zodiac =
      getPersianZodiac(
        persian.month
      );

    const eventsText =
      getEventText(
        todayEvents
      );

    const sendTehran =
      getTehranParts();

    const hijriText =
      hijri
        ? `${hijri.day} ${hijri.month} ${hijri.year}`
        : "نامشخص";

    const status =
      holiday
        ? "تعطیل رسمی"
        : "روز کاری";

    const message =
      `☀️ روزت پر از اتفاقات خوب\n\n` +
      `📅 تقویم روزانه\n\n` +

      `🇮🇷 تاریخ شمسی: ` +
      `${toPersianNumber(persian.year)}/` +
      `${toPersianNumber(
        String(persian.month).padStart(2, "0")
      )}/` +
      `${toPersianNumber(
        String(persian.day).padStart(2, "0")
      )}\n` +

      `🌍 تاریخ میلادی: ${gregorian}\n` +

      `🌙 تاریخ قمری: ${hijriText}\n` +

      `⏰ زمان واقعی ارسال: ` +
      `${sendTehran.hour}:` +
      `${sendTehran.minute}:` +
      `${sendTehran.second}\n` +

      `🗓️ روز هفته: ${weekday}\n` +

      `🏢 وضعیت: ${status}\n\n` +

      `📊 پیشرفت سال ` +
      `${toPersianNumber(persian.year)}: ` +
      `روز ${toPersianNumber(progress.dayOfYear)} ` +
      `از ${toPersianNumber(progress.totalDays)} ` +
      `— ${toPersianNumber(progress.percent)}٪\n` +

      `🌙 وضعیت ماه: ${moonPhase}\n` +

      `♈ برج: ${zodiac}\n\n` +

      `📌 مناسبت‌ها:\n` +

      `${
        eventsText.length
          ? eventsText
              .map((e) => `• ${e}`)
              .join("\n")
          : "• مناسبت ثبت‌شده‌ای برای امروز پیدا نشد."
      }\n\n` +

      `💭 جرعه‌ای تفکر:\n` +

      `«هر روز فرصتی تازه برای بهتر دیدن، ` +
      `بهتر اندیشیدن و بهتر ساختن است.»\n\n` +

      `🤝 با هم برای حل مسائل و ساختن فردایی بهتر`;

    const response =
      await fetch(
        `https://tapi.bale.ai/bot${token}/sendMessage`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            chat_id: chatId,
            text: message
          })
        }
      );

    const result =
      await response
        .json()
        .catch(() => ({}));

    return NextResponse.json({
      ok:
        response.ok &&
        result?.ok === true,

      bale_status:
        response.status,

      bale: result
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
      {
        status: 500
      }
    );
  }
}

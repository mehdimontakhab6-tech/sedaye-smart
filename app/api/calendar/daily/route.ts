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
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function getPersianDate(date: Date) {
  const parts = new Intl.DateTimeFormat(
    "fa-IR-u-ca-persian",
    {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  ).formatToParts(date);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";

  return {
    year: Number(normalize(get("year"))),
    month: Number(normalize(get("month"))),
    day: Number(normalize(get("day"))),
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
    weekday: "long",
  }).format(date);
}

function getPersianDayOfYear(
  month: number,
  day: number
) {
  let total = 0;

  for (let m = 1; m < month; m++) {
    total += m <= 6 ? 31 : m <= 11 ? 30 : 29;
  }

  return total + day;
}

function getYearProgress(
  month: number,
  day: number
) {
  const dayOfYear =
    getPersianDayOfYear(month, day);

  const totalDays = 365;

  return {
    dayOfYear,
    totalDays,
    percent: (
      (dayOfYear / totalDays) *
      100
    ).toFixed(1),
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
    "حوت ♓",
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
    ((date.getTime() - knownNewMoon) /
      86400000) %
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

async function getHijriDate(
  gregorian: string
) {
  try {
    const response = await fetch(
      `https://api.aladhan.com/v1/gToH?date=${gregorian}`,
      {
        headers: {
          Accept: "application/json",
        },
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
      year: hijri.year,
    };
  } catch {
    return null;
  }
}

async function getEvents(
  persianYear: number
) {
  try {
    const response = await fetch(
      `https://hmarzban.github.io/pipe2time.ir/api/${persianYear}/events.json`,
      {
        headers: {
          Accept: "application/json",
        },
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
        if (
          Array.isArray(
            monthData?.events
          )
        ) {
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

/* ---------------------------------------
   سخن بزرگان
   --------------------------------------- */

const GREAT_QUOTES = [
  {
    text: "آنچه می‌دانم این است که هیچ چیز نمی‌دانم.",
    author: "سقراط",
  },
  {
    text: "کیفیت زندگی ما به کیفیت پرسش‌هایی که می‌پرسیم وابسته است.",
    author: "نقل به مضمون",
  },
  {
    text: "دانش زمانی ارزشمندتر می‌شود که در عمل به کار گرفته شود.",
    author: "نقل به مضمون",
  },
  {
    text: "راه هزار کیلومتری با یک قدم آغاز می‌شود.",
    author: "لائوتسه",
  },
  {
    text: "خودت را بشناس؛ آغاز بسیاری از دانایی‌ها از همین‌جاست.",
    author: "نقل به مضمون از سنت فلسفی یونان",
  },
  {
    text: "بهترین زمان برای آغاز یک کار خوب، همین امروز است.",
    author: "نقل به مضمون",
  },
  {
    text: "انسان با اندیشه‌هایش ساخته می‌شود.",
    author: "نقل به مضمون",
  },
  {
    text: "آینده متعلق به کسانی است که امروز برای آن آماده می‌شوند.",
    author: "نقل به مضمون",
  },
  {
    text: "آرامش از جایی آغاز می‌شود که پذیرش را یاد می‌گیریم.",
    author: "نقل به مضمون",
  },
  {
    text: "هر دانشی که به عمل نرسد، فرصت رشد خود را از دست می‌دهد.",
    author: "نقل به مضمون",
  },
  {
    text: "برای تغییر جهان، نخست باید از خود آغاز کرد.",
    author: "نقل به مضمون",
  },
  {
    text: "گفت‌وگو پلی است میان انسان‌ها، حتی وقتی دیدگاه‌ها متفاوت است.",
    author: "نقل به مضمون",
  },
  {
    text: "پشتکار، فاصله میان تصمیم و نتیجه را کوتاه می‌کند.",
    author: "نقل به مضمون",
  },
  {
    text: "اشتباه می‌تواند آغاز یادگیری باشد، اگر از آن بیاموزیم.",
    author: "نقل به مضمون",
  },
  {
    text: "آدمی با انتخاب‌های روزانه‌اش آینده خود را می‌سازد.",
    author: "نقل به مضمون",
  },
  {
    text: "هیچ پیشرفتی بدون یادگیری و بازنگری پایدار نمی‌ماند.",
    author: "نقل به مضمون",
  },
  {
    text: "خرد فقط دانستن نیست؛ درست به‌کار بردن دانسته‌هاست.",
    author: "نقل به مضمون",
  },
  {
    text: "شنیدن واقعی، بخشی از هنر درست پاسخ دادن است.",
    author: "نقل به مضمون",
  },
  {
    text: "تغییرهای کوچک و پیوسته می‌توانند نتیجه‌های بزرگ بسازند.",
    author: "نقل به مضمون",
  },
  {
    text: "انسان زمانی رشد می‌کند که از پرسیدن نترسد.",
    author: "نقل به مضمون",
  },
  {
    text: "هر روز فرصتی برای بهتر کردن یک چیز کوچک است.",
    author: "نقل به مضمون",
  },
  {
    text: "مسئولیت‌پذیری، آغاز اعتمادسازی است.",
    author: "نقل به مضمون",
  },
  {
    text: "بهترین تصمیم همیشه آسان‌ترین تصمیم نیست.",
    author: "نقل به مضمون",
  },
  {
    text: "گاهی یک نگاه تازه، مسئله‌ای قدیمی را حل می‌کند.",
    author: "نقل به مضمون",
  },
  {
    text: "آگاهی نخستین گام برای ساختن تغییر پایدار است.",
    author: "نقل به مضمون",
  },
  {
    text: "آینده را کسانی می‌سازند که امروز مسئولانه عمل می‌کنند.",
    author: "نقل به مضمون",
  },
  {
    text: "همکاری زمانی قدرتمند است که هرکس سهم خود را درست انجام دهد.",
    author: "نقل به مضمون",
  },
  {
    text: "تجربه زمانی ارزشمند است که به بینش تبدیل شود.",
    author: "نقل به مضمون",
  },
  {
    text: "صبر، به معنای ایستادن نیست؛ یعنی ادامه دادن با آرامش.",
    author: "نقل به مضمون",
  },
  {
    text: "هر پاسخ خوب، از یک پرسش خوب آغاز می‌شود.",
    author: "نقل به مضمون",
  },
  {
    text: "دانایی با فروتنی کامل‌تر می‌شود.",
    author: "نقل به مضمون",
  },
];

/* ---------------------------------------
   جرعه‌ای تفکر
   --------------------------------------- */

const THOUGHTS = [
  "امروز فقط یک قدم کوچک بردار؛ مسیرهای بزرگ از قدم‌های کوچک ساخته می‌شوند.",
  "قبل از پاسخ دادن، یک لحظه بیشتر گوش بده؛ شاید نکته اصلی همان‌جا باشد.",
  "گاهی بهترین راه حل، نگاه کردن به مسئله از زاویه‌ای تازه است.",
  "امروز یک کار را بهتر از دیروز انجام بده؛ همین کافی است.",
  "آرامش یعنی بدانیم همه چیز را نمی‌توانیم کنترل کنیم، اما واکنش خود را می‌توانیم.",
  "هر گفت‌وگوی خوب می‌تواند آغاز یک تغییر خوب باشد.",
  "اگر چیزی ارزشمند است، برای بهتر شدنش زمان بگذار.",
  "پیشرفت همیشه بزرگ و چشمگیر نیست؛ گاهی فقط یک انتخاب درست است.",
  "امروز از خودت بپرس: چه چیزی را می‌توانم ساده‌تر انجام دهم؟",
  "گاهی لازم نیست سریع‌تر حرکت کنیم؛ لازم است درست‌تر حرکت کنیم.",
  "یک تصمیم کوچک امروز می‌تواند نتیجه بزرگی در آینده بسازد.",
  "به جای تمرکز بر اینکه چه کسی مقصر است، ببین چگونه می‌توان مسئله را حل کرد.",
  "یادگیری زمانی آغاز می‌شود که با اطمینان بگوییم: شاید راه بهتری هم وجود داشته باشد.",
  "امروز فرصتی است برای ساختن چیزی که فردای بهتر به آن نیاز دارد.",
  "هر انسانی چیزی برای آموختن و چیزی برای آموختن دادن دارد.",
  "اگر راهی جواب نداد، خودت را سرزنش نکن؛ راه دیگری را امتحان کن.",
  "گاهی یک جمله محترمانه می‌تواند فضای یک گفت‌وگو را کاملاً تغییر دهد.",
  "به چیزهایی توجه کن که هر روز تکرار می‌کنی؛ آینده از همین تکرارها ساخته می‌شود.",
  "مسائل پیچیده همیشه با راه‌حل‌های پیچیده حل نمی‌شوند.",
  "امروز یک کار ناتمام را یک قدم جلو ببر.",
  "در میان شتاب روزانه، چند دقیقه برای فکر کردن کنار بگذار.",
  "به جای انتظار برای شرایط کامل، با امکانات موجود بهترین کار ممکن را انجام بده.",
  "تفاوت میان دانستن و توانستن، تمرین است.",
  "اگر می‌خواهی تغییری ببینی، سهم خودت در آن تغییر را پیدا کن.",
  "گاهی بهترین پیشرفت، حذف یک عادت غیرضروری است.",
  "آدم‌ها بیشتر از پاسخ کامل، به شنیده شدن واقعی نیاز دارند.",
  "امروز می‌تواند روزی باشد که یک مسئله قدیمی را با روشی تازه ببینی.",
  "هر تصمیم خوب، هم به عقل نیاز دارد و هم به مسئولیت‌پذیری.",
  "برای ساختن اعتماد، ثبات در رفتار از حرف‌های بزرگ مهم‌تر است.",
  "آخر روز از خودت بپرس: امروز چه چیزی آموختم؟",
];

/* ---------------------------------------
   انتخاب پیام روز
   --------------------------------------- */

function getDailyContent(
  dayOfYear: number
) {
  const index =
    (dayOfYear - 1) %
    THOUGHTS.length;

  const quoteIndex =
    (dayOfYear - 1) %
    GREAT_QUOTES.length;

  return {
    thought: THOUGHTS[index],
    quote: GREAT_QUOTES[quoteIndex],
  };
}

/* بررسی فعال بودن ارسال تقویم */

async function isCalendarEnabled(
  env: CloudflareEnv
) {
  try {
    const url =
      env.NEXT_PUBLIC_SUPABASE_URL;

    const serviceKey =
      env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      console.error(
        "[calendar] Supabase configuration missing"
      );

      return true;
    }

    const response = await fetch(
      `${url}/rest/v1/settings?select=key,value&key=eq.schedule_calendar&limit=1`,
      {
        headers: {
          apikey: serviceKey,
          Authorization:
            `Bearer ${serviceKey}`,
        },
      }
    );

    if (!response.ok) {
      console.error(
        "[calendar] Failed to read schedule setting:",
        response.status
      );

      return true;
    }

    const rows =
      await response.json();

    if (
      !Array.isArray(rows) ||
      !rows.length
    ) {
      return true;
    }

    return rows[0]?.value !== "false";
  } catch (error) {
    console.error(
      "[calendar] Schedule setting error:",
      error
    );

    return true;
  }
}

export async function GET() {
  try {
    const { env } =
      await getCloudflareContext({
        async: true,
      });

    /* اگر ارسال تقویم لغو شده باشد */
    const enabled =
      await isCalendarEnabled(env);

    if (!enabled) {
      console.log(
        "[calendar] Sending is cancelled."
      );

      return NextResponse.json({
        ok: true,
        cancelled: true,
        sent: false,
        message:
          "ارسال تقویم لغو شده است.",
      });
    }

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
            "BALE_SMART_TOKEN یا BALE_GROUP_ID تنظیم نشده است.",
        },
        {
          status: 500,
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

    /* پیام اختصاصی همان روز */
    const dailyContent =
      getDailyContent(
        progress.dayOfYear
      );

    /* زمان واقعی درست قبل از ارسال */
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
      `روز ${toPersianNumber(
        progress.dayOfYear
      )} از ${toPersianNumber(
        progress.totalDays
      )} — ${toPersianNumber(
        progress.percent
      )}٪\n` +

      `🌙 وضعیت ماه: ${moonPhase}\n` +

      `♈ برج: ${zodiac}\n\n` +

      `📌 مناسبت‌ها:\n` +

      `${
        eventsText.length
          ? eventsText
              .map(
                (e) => `• ${e}`
              )
              .join("\n")
          : "• مناسبت ثبت‌شده‌ای برای امروز پیدا نشد."
      }\n\n` +

      `💬 سخن بزرگان:\n` +

      `«${dailyContent.quote.text}»\n` +

      `— ${dailyContent.quote.author}\n\n` +

      `💭 جرعه‌ای تفکر:\n` +

      `«${dailyContent.thought}»\n\n` +

      `🤝 با هم برای حل مسائل و ساختن فردایی بهتر`;

    const response =
      await fetch(
        `https://tapi.bale.ai/bot${token}/sendMessage`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            chat_id: chatId,
            text: message,
          }),
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

      cancelled: false,

      sent: true,

      bale_status:
        response.status,

      bale: result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,

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

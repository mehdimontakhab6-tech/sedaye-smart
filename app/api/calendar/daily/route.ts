import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { satori } from "@cf-wasm/satori/workerd";
import { Resvg } from "@cf-wasm/resvg/workerd";

const TIME_ZONE = "Asia/Tehran";
const WIDTH = 1024;
const HEIGHT = 1536;

const digits = "۰۱۲۳۴۵۶۷۸۹";

function fa(value: number | string) {
  return String(value).replace(
    /\d/g,
    (d) => digits[Number(d)]
  );
}

function normalize(value: string) {
  return value.replace(/[۰-۹]/g, (d) =>
    String(digits.indexOf(d))
  );
}

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
  const dayOfYear = getPersianDayOfYear(month, day);

  const totalDays = 365;

  return {
    dayOfYear,
    totalDays,
    percent: (
      (dayOfYear / totalDays) *
      100
    ).toFixed(1),
    remaining: Math.max(
      0,
      totalDays - dayOfYear
    ),
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

function getAnimal(year: number) {
  const animals = [
    "موش",
    "گاو",
    "ببر",
    "خرگوش",
    "اژدها",
    "مار",
    "اسب",
    "بز",
    "میمون",
    "خروس",
    "سگ",
    "خوک",
  ];

  return animals[
    ((year - 4) % 12 + 12) % 12
  ];
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

  let age =
    ((date.getTime() - knownNewMoon) /
      86400000) %
    synodicMonth;

  if (age < 0) {
    age += synodicMonth;
  }

  if (age < 1.85) return "ماه نو 🌑";
  if (age < 7.38) return "هلال افزاینده 🌒";
  if (age < 9.22) return "ربع اول 🌓";
  if (age < 14.77) return "تربیع افزاینده 🌔";
  if (age < 16.61) return "ماه کامل 🌕";
  if (age < 22.15) return "تربیع کاهنده 🌖";
  if (age < 23.99) return "ربع آخر 🌗";

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

    if (Array.isArray(data)) {
      return data;
    }

    const events: any[] = [];

    const yearData =
      data?.[String(persianYear)];

    if (Array.isArray(yearData)) {
      for (const monthData of yearData) {
        if (
          Array.isArray(monthData?.events)
        ) {
          events.push(
            ...monthData.events
          );
        }
      }
    }

    if (Array.isArray(data?.events)) {
      events.push(...data.events);
    }

    return events;
  } catch {
    return [];
  }
}

function getEventsForDay(
  events: any[],
  month: number,
  day: number
) {
  return events.filter((event) => {
    const jDate = String(
      event?.jDate ||
      event?.date ||
      ""
    );

    const normalized = normalize(jDate);

    const match = normalized.match(
      /^(?:\d{4}[\/\-])?(\d{1,2})[\/\-](\d{1,2})$/
    );

    if (match) {
      return (
        Number(match[1]) === month &&
        Number(match[2]) === day
      );
    }

    const eventMonth = Number(
      event?.jMonth ??
      event?.month ??
      event?.persianMonth ??
      0
    );

    const eventDay = Number(
      event?.jDay ??
      event?.day ??
      event?.persianDay ??
      0
    );

    return (
      eventMonth === month &&
      eventDay === day
    );
  });
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
    .slice(0, 5);
}

function isHoliday(events: any[]) {
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

/*
 * بانک اولیه محتوای روزانه.
 *
 * نکته:
 * این بخش عمداً با نقل‌قول‌های جعلی پر نشده است.
 * بانک ۳۶۵ سخن مستند در مرحله بعدی اضافه می‌شود.
 */

const DAILY_CONTENT = [
  {
    thought:
      "امروز فقط یک قدم کوچک بردار؛ مسیرهای بزرگ از قدم‌های کوچک ساخته می‌شوند.",
    quote:
      "دانایی، آغاز هر تغییر پایدار است.",
    author:
      "محتوای تأملی گروه",
    source:
      "صدای کارکنان ثبت احوال",
  },
  {
    thought:
      "قبل از پاسخ دادن، کمی بیشتر گوش بده؛ شاید نکته اصلی همان‌جا باشد.",
    quote:
      "هر پاسخ خوب، از یک پرسش خوب آغاز می‌شود.",
    author:
      "محتوای تأملی گروه",
    source:
      "صدای کارکنان ثبت احوال",
  },
  {
    thought:
      "گاهی بهترین راه‌حل، نگاه کردن به مسئله از زاویه‌ای تازه است.",
    quote:
      "تغییر از جایی آغاز می‌شود که مسئله را درست ببینیم.",
    author:
      "محتوای تأملی گروه",
    source:
      "صدای کارکنان ثبت احوال",
  },
  {
    thought:
      "امروز یک کار را بهتر از دیروز انجام بده؛ همین کافی است.",
    quote:
      "پیشرفت، مجموعه‌ای از قدم‌های کوچک و پیوسته است.",
    author:
      "محتوای تأملی گروه",
    source:
      "صدای کارکنان ثبت احوال",
  },
  {
    thought:
      "آرامش یعنی بدانیم همه چیز را نمی‌توانیم کنترل کنیم، اما واکنش خود را می‌توانیم.",
    quote:
      "مسئولیت‌پذیری از انتخاب واکنش درست آغاز می‌شود.",
    author:
      "محتوای تأملی گروه",
    source:
      "صدای کارکنان ثبت احوال",
  },
  {
    thought:
      "هر گفت‌وگوی خوب می‌تواند آغاز یک تغییر خوب باشد.",
    quote:
      "گفت‌وگو، راهی برای نزدیک‌تر شدن اندیشه‌هاست.",
    author:
      "محتوای تأملی گروه",
    source:
      "صدای کارکنان ثبت احوال",
  },
  {
    thought:
      "اگر چیزی ارزشمند است، برای بهتر شدنش زمان بگذار.",
    quote:
      "کیفیت، نتیجه توجه مداوم به جزئیات است.",
    author:
      "محتوای تأملی گروه",
    source:
      "صدای کارکنان ثبت احوال",
  },
  {
    thought:
      "پیشرفت همیشه بزرگ و چشمگیر نیست؛ گاهی فقط یک انتخاب درست است.",
    quote:
      "یک انتخاب درست می‌تواند آغاز یک مسیر تازه باشد.",
    author:
      "محتوای تأملی گروه",
    source:
      "صدای کارکنان ثبت احوال",
  },
  {
    thought:
      "امروز از خودت بپرس: چه چیزی را می‌توانم ساده‌تر انجام دهم؟",
    quote:
      "ساده‌سازی، بخشی از هنر حل مسئله است.",
    author:
      "محتوای تأملی گروه",
    source:
      "صدای کارکنان ثبت احوال",
  },
  {
    thought:
      "گاهی لازم نیست سریع‌تر حرکت کنیم؛ لازم است درست‌تر حرکت کنیم.",
    quote:
      "سرعت بدون جهت، پیشرفت نیست.",
    author:
      "محتوای تأملی گروه",
    source:
      "صدای کارکنان ثبت احوال",
  },
];

function getDailyContent(day: number) {
  return DAILY_CONTENT[
    (day - 1) %
      DAILY_CONTENT.length
  ];
}

async function isCalendarEnabled(
  env: CloudflareEnv
) {
  try {
    const url =
      env.NEXT_PUBLIC_SUPABASE_URL;

    const serviceKey =
      env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
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
      return true;
    }

    const rows =
      await response.json();

    if (
      !Array.isArray(rows) ||
      rows.length === 0
    ) {
      return true;
    }

    return rows[0]?.value !== "false";
  } catch {
    return true;
  }
}

async function getFont() {
  const response = await fetch(
    "https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/fonts/ttf/Vazirmatn-Regular.ttf"
  );

  if (!response.ok) {
    throw new Error(
      "خطا در دریافت فونت فارسی"
    );
  }

  return response.arrayBuffer();
}

function makeElement(
  type: string,
  style: Record<string, unknown>,
  children?: unknown
) {
  return {
    type,
    props: {
      style,
      ...(children !== undefined
        ? { children }
        : {}),
    },
  };
}

async function createInfographic(data: {
  title: string;
  weekday: string;
  persianDate: string;
  hijriDate: string;
  gregorianDate: string;
  time: string;
  progress: string;
  remaining: string;
  moon: string;
  zodiac: string;
  animal: string;
  events: string[];
  thought: string;
  quote: string;
  author: string;
  source: string;
}) {
  const fontData = await getFont();

  const eventNodes =
    data.events.length
      ? data.events.map((event) =>
          makeElement(
            "div",
            {
              display: "flex",
              direction: "rtl",
              fontSize: 28,
              lineHeight: 1.5,
              marginBottom: 10,
              color: "#243447",
            },
            `• ${event}`
          )
        )
      : [
          makeElement(
            "div",
            {
              display: "flex",
              direction: "rtl",
              fontSize: 27,
              color: "#536271",
            },
            "• مناسبت ثبت‌شده‌ای برای امروز پیدا نشد."
          ),
        ];

  const tree = makeElement(
    "div",
    {
      width: WIDTH,
      height: HEIGHT,
      display: "flex",
      flexDirection: "column",
      direction: "rtl",
      background:
        "linear-gradient(180deg,#f4f8fb 0%,#ffffff 100%)",
      fontFamily: "Vazirmatn",
      color: "#17212b",
      padding: 48,
      boxSizing: "border-box",
    },
    [
      makeElement(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          paddingBottom: 30,
        },
        [
          makeElement(
            "div",
            {
              fontSize: 40,
              fontWeight: 700,
              color: "#123c69",
              marginBottom: 14,
            },
            data.title
          ),
          makeElement(
            "div",
            {
              fontSize: 34,
              fontWeight: 700,
              color: "#d88900",
            },
            "☀️ روزت پر از اتفاقات خوب"
          ),
        ]
      ),

      makeElement(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          borderRadius: 30,
          padding: 32,
          marginBottom: 24,
          border: "2px solid #e5edf4",
        },
        [
          makeElement(
            "div",
            {
              fontSize: 31,
              fontWeight: 700,
              color: "#123c69",
              marginBottom: 18,
            },
            `${data.weekday} — ${data.persianDate}`
          ),

          makeElement(
            "div",
            {
              fontSize: 25,
              color: "#4b5d6b",
              marginBottom: 10,
            },
            `میلادی: ${data.gregorianDate}`
          ),

          makeElement(
            "div",
            {
              fontSize: 25,
              color: "#4b5d6b",
              marginBottom: 10,
            },
            `قمری: ${data.hijriDate}`
          ),

          makeElement(
            "div",
            {
              fontSize: 27,
              color: "#123c69",
              fontWeight: 700,
            },
            `⏰ ساعت تهران: ${data.time}`
          ),
        ]
      ),

      makeElement(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          borderRadius: 30,
          padding: 32,
          marginBottom: 24,
          border: "2px solid #e5edf4",
        },
        [
          makeElement(
            "div",
            {
              fontSize: 29,
              fontWeight: 700,
              color: "#123c69",
              marginBottom: 16,
            },
            "📊 چشم‌انداز سال"
          ),

          makeElement(
            "div",
            {
              height: 28,
              width: 880,
              background: "#e6edf3",
              borderRadius: 20,
              display: "flex",
              overflow: "hidden",
              marginBottom: 14,
            },
            makeElement(
              "div",
              {
                width: `${Math.min(
                  100,
                  Number(
                    data.progress
                  )
                )}%`,
                height: 28,
                background: "#d88900",
                borderRadius: 20,
              }
            )
          ),

          makeElement(
            "div",
            {
              fontSize: 24,
              color: "#536271",
            },
            `روز ${data.progress}% از سال — ${data.remaining} روز باقی‌مانده`
          ),
        ]
      ),

      makeElement(
        "div",
        {
          display: "flex",
          flexDirection: "row",
          gap: 18,
          marginBottom: 24,
        },
        [
          makeElement(
            "div",
            {
              flex: 1,
              display: "flex",
              flexDirection: "column",
              background: "#ffffff",
              borderRadius: 26,
              padding: 26,
              border: "2px solid #e5edf4",
            },
            [
              makeElement(
                "div",
                {
                  fontSize: 23,
                  color: "#6a7782",
                  marginBottom: 8,
                },
                "ماه"
              ),
              makeElement(
                "div",
                {
                  fontSize: 27,
                  fontWeight: 700,
                },
                data.moon
              ),
            ]
          ),

          makeElement(
            "div",
            {
              flex: 1,
              display: "flex",
              flexDirection: "column",
              background: "#ffffff",
              borderRadius: 26,
              padding: 26,
              border: "2px solid #e5edf4",
            },
            [
              makeElement(
                "div",
                {
                  fontSize: 23,
                  color: "#6a7782",
                  marginBottom: 8,
                },
                "برج"
              ),
              makeElement(
                "div",
                {
                  fontSize: 27,
                  fontWeight: 700,
                },
                data.zodiac
              ),
            ]
          ),

          makeElement(
            "div",
            {
              flex: 1,
              display: "flex",
              flexDirection: "column",
              background: "#ffffff",
              borderRadius: 26,
              padding: 26,
              border: "2px solid #e5edf4",
            },
            [
              makeElement(
                "div",
                {
                  fontSize: 23,
                  color: "#6a7782",
                  marginBottom: 8,
                },
                "نماد سال"
              ),
              makeElement(
                "div",
                {
                  fontSize: 27,
                  fontWeight: 700,
                },
                data.animal
              ),
            ]
          ),
        ]
      ),

      makeElement(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          borderRadius: 30,
          padding: 30,
          marginBottom: 24,
          border: "2px solid #e5edf4",
        },
        [
          makeElement(
            "div",
            {
              fontSize: 29,
              fontWeight: 700,
              color: "#123c69",
              marginBottom: 15,
            },
            "📌 مناسبت‌های امروز"
          ),
          ...eventNodes,
        ]
      ),

      makeElement(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          background: "#fffaf0",
          borderRadius: 30,
          padding: 30,
          marginBottom: 24,
          border: "2px solid #f0dfb9",
        },
        [
          makeElement(
            "div",
            {
              fontSize: 29,
              fontWeight: 700,
              color: "#9b6500",
              marginBottom: 15,
            },
            "💬 سخن امروز"
          ),
          makeElement(
            "div",
            {
              fontSize: 29,
              lineHeight: 1.6,
              fontWeight: 600,
              marginBottom: 14,
            },
            `«${data.quote}»`
          ),
          makeElement(
            "div",
            {
              fontSize: 22,
              color: "#59636c",
              marginBottom: 6,
            },
            `— ${data.author}`
          ),
          makeElement(
            "div",
            {
              fontSize: 19,
              color: "#78838c",
            },
            `منبع: ${data.source}`
          ),
        ]
      ),

      makeElement(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          background: "#eef6fb",
          borderRadius: 30,
          padding: 30,
          marginBottom: 28,
        },
        [
          makeElement(
            "div",
            {
              fontSize: 29,
              fontWeight: 700,
              color: "#123c69",
              marginBottom: 14,
            },
            "💭 جرعه‌ای تفکر"
          ),
          makeElement(
            "div",
            {
              fontSize: 27,
              lineHeight: 1.65,
              color: "#243447",
            },
            `«${data.thought}»`
          ),
        ]
      ),

      makeElement(
        "div",
        {
          marginTop: "auto",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontSize: 26,
          fontWeight: 700,
          color: "#123c69",
          paddingTop: 18,
        },
        "هم‌صدایی برای تحول و بهبود"
      ),
    ]
  );

  const svg = await satori(tree, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      {
        name: "Vazirmatn",
        data: fontData,
        weight: 400,
        style: "normal",
      },
    ],
  });

  const renderer =
    await Resvg.async(svg);

  const png =
    renderer.render().asPng();

  return png;
}

async function sendPhotoToBale(
  token: string,
  chatId: string,
  png: Uint8Array,
  caption: string
) {
  const form = new FormData();

  form.append(
    "chat_id",
    chatId
  );

  form.append(
    "caption",
    caption
  );

  form.append(
    "photo",
    new Blob(
      [png],
      {
        type: "image/png",
      }
    ),
    "calendar.png"
  );

  const response = await fetch(
    `https://tapi.bale.ai/bot${token}/sendPhoto`,
    {
      method: "POST",
      body: form,
    }
  );

  const result =
    await response
      .json()
      .catch(() => ({}));

  return {
    response,
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
     * این بخش عمداً حفظ شده تا
     * دکمه لغو تقویم همچنان کار کند.
     */
    const enabled =
      await isCalendarEnabled(env);

    if (!enabled) {
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
        { status: 500 }
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

    const progress =
      getYearProgress(
        persian.month,
        persian.day
      );

    const content =
      getDailyContent(
        progress.dayOfYear
      );

    const hijriText =
      hijri
        ? `${hijri.day} ${hijri.month} ${hijri.year}`
        : "نامشخص";

    const time =
      `${tehran.hour}:` +
      `${tehran.minute}:` +
      `${tehran.second}`;

    const infographic =
      await createInfographic({
        title:
          "تقویم روزانه گروه صدای کارکنان ثبت احوال",

        weekday,

        persianDate:
          `${fa(persian.year)}/` +
          `${fa(String(persian.month).padStart(2, "0"))}/` +
          `${fa(String(persian.day).padStart(2, "0"))}`,

        hijriDate:
          hijriText,

        gregorianDate:
          gregorian,

        time,

        progress:
          progress.percent,

        remaining:
          fa(progress.remaining),

        moon:
          getMoonPhase(now),

        zodiac:
          getPersianZodiac(
            persian.month
          ),

        animal:
          getAnimal(
            persian.year
          ),

        events:
          getEventText(
            todayEvents
          ),

        thought:
          content.thought,

        quote:
          content.quote,

        author:
          content.author,

        source:
          content.source,
      });

    const sent =
      await sendPhotoToBale(
        token,
        chatId,
        infographic,
        "تقویم روزانه گروه صدای کارکنان ثبت احوال"
      );

    return NextResponse.json({
      ok:
        sent.response.ok &&
        sent.result?.ok === true,

      cancelled: false,

      sent:
        sent.response.ok,

      bale_status:
        sent.response.status,

      bale:
        sent.result,
    });
  } catch (error) {
    console.error(
      "[calendar] error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "خطای ناشناخته",
      },
      { status: 500 }
    );
  }
    }

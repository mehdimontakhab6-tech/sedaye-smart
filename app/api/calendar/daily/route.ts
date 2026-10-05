import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const TIME_ZONE = "Asia/Tehran";
const WIDTH = 1024;
const HEIGHT = 1536;

const digits = "۰۱۲۳۴۵۶۷۸۹";

function fa(value: number | string) {
  return String(value).replace(/\d/g, (d) => digits[Number(d)]);
}

function normalize(value: string) {
  return value.replace(/[۰-۹]/g, (d) =>
    String(digits.indexOf(d))
  );
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function getPersianDayOfYear(month: number, day: number) {
  let total = 0;

  for (let m = 1; m < month; m++) {
    total += m <= 6 ? 31 : m <= 11 ? 30 : 29;
  }

  return total + day;
}

function isPersianLeapYear(year: number) {
  const start = new Date(
    `${year}-03-20T12:00:00+03:30`
  );

  const next = new Date(
    `${year + 1}-03-20T12:00:00+03:30`
  );

  const diff =
    Math.round(
      (next.getTime() - start.getTime()) / 86400000
    );

  return diff >= 366;
}

function getYearProgress(month: number, day: number, year: number) {
  const dayOfYear = getPersianDayOfYear(month, day);
  const totalDays = isPersianLeapYear(year) ? 366 : 365;

  return {
    dayOfYear,
    totalDays,
    percent: ((dayOfYear / totalDays) * 100).toFixed(1),
    remaining: Math.max(0, totalDays - dayOfYear),
    weeksRemaining: Math.ceil(
      Math.max(0, totalDays - dayOfYear) / 7
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

  return animals[((year - 4) % 12 + 12) % 12];
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
    ((date.getTime() - knownNewMoon) / 86400000) %
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

async function getHijriDate(gregorian: string) {
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

async function getEvents(persianYear: number) {
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

    const yearData = data?.[String(persianYear)];

    if (Array.isArray(yearData)) {
      for (const monthData of yearData) {
        if (Array.isArray(monthData?.events)) {
          events.push(...monthData.events);
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

/*
 * محتوای تأملی.
 *
 * فعلاً از نسبت دادن نقل‌قول‌های غیرمستند
 * به افراد مشهور خودداری شده است.
 *
 * این بخش بعداً می‌تواند با بانک ۳۶۵
 * نقل‌قول مستند و منبع‌دار تکمیل شود.
 */

const DAILY_CONTENT = [
  {
    thought:
      "امروز فقط یک قدم کوچک بردار؛ مسیرهای بزرگ از قدم‌های کوچک ساخته می‌شوند.",
    quote:
      "پیشرفت، نتیجه قدم‌های کوچک و پیوسته است.",
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
      "بهتر شدن، همیشه با یک تغییر کوچک آغاز می‌شود.",
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
    (day - 1) % DAILY_CONTENT.length
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

function createInfographicHtml(data: {
  weekday: string;
  persianDate: string;
  hijriDate: string;
  gregorianDate: string;
  time: string;
  progress: string;
  remaining: string;
  weeksRemaining: string;
  moon: string;
  zodiac: string;
  animal: string;
  events: string[];
  thought: string;
  quote: string;
  author: string;
  source: string;
}) {
  const eventsHtml = data.events.length
    ? data.events
        .map(
          (event) => `
            <div class="event">
              <span class="bullet">●</span>
              <span>${escapeHtml(event)}</span>
            </div>
          `
        )
        .join("")
    : `
        <div class="event">
          <span class="bullet">●</span>
          <span>مناسبت ثبت‌شده‌ای برای امروز پیدا نشد.</span>
        </div>
      `;

  return `
<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${WIDTH}, height=${HEIGHT}">
<style>

@font-face {
  font-family: Vazirmatn;
  src: url("https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/fonts/ttf/Vazirmatn-Regular.ttf") format("truetype");
  font-weight: 400;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  width: ${WIDTH}px;
  height: ${HEIGHT}px;
  overflow: hidden;
}

body {
  font-family: Vazirmatn, Arial, sans-serif;
  background:
    linear-gradient(
      180deg,
      #eef6fb 0%,
      #ffffff 42%,
      #f7fafc 100%
    );
  color: #17212b;
}

.page {
  width: ${WIDTH}px;
  height: ${HEIGHT}px;
  padding: 42px 48px 34px;
  display: flex;
  flex-direction: column;
}

.header {
  text-align: center;
  margin-bottom: 22px;
}

.title {
  font-size: 38px;
  font-weight: 700;
  color: #123c69;
  margin-bottom: 10px;
}

.subtitle {
  font-size: 31px;
  font-weight: 700;
  color: #d88900;
}

.card {
  background: rgba(255,255,255,0.96);
  border: 2px solid #e3ebf2;
  border-radius: 26px;
  padding: 23px 28px;
  margin-bottom: 17px;
  box-shadow:
    0 8px 24px rgba(25, 55, 80, 0.06);
}

.date-main {
  font-size: 29px;
  font-weight: 700;
  color: #123c69;
  margin-bottom: 9px;
}

.date-line {
  font-size: 22px;
  color: #596a78;
  margin-bottom: 6px;
}

.time {
  font-size: 24px;
  font-weight: 700;
  color: #123c69;
  margin-top: 5px;
}

.section-title {
  font-size: 25px;
  font-weight: 700;
  color: #123c69;
  margin-bottom: 13px;
}

.progress-track {
  width: 100%;
  height: 23px;
  background: #e6edf3;
  border-radius: 20px;
  overflow: hidden;
}

.progress-fill {
  width: ${Math.min(
    100,
    Number(data.progress)
  )}%;
  height: 23px;
  background: linear-gradient(
    90deg,
    #d88900,
    #f0ad2c
  );
  border-radius: 20px;
}

.progress-info {
  margin-top: 9px;
  display: flex;
  justify-content: space-between;
  font-size: 19px;
  color: #596a78;
}

.stats {
  display: flex;
  gap: 14px;
  margin-bottom: 17px;
}

.stat {
  flex: 1;
  background: #ffffff;
  border: 2px solid #e3ebf2;
  border-radius: 23px;
  padding: 19px 15px;
  min-height: 92px;
}

.stat-label {
  font-size: 17px;
  color: #778591;
  margin-bottom: 6px;
}

.stat-value {
  font-size: 21px;
  font-weight: 700;
  color: #243447;
}

.events {
  padding-top: 1px;
}

.event {
  display: flex;
  gap: 9px;
  align-items: flex-start;
  font-size: 20px;
  line-height: 1.45;
  color: #334554;
  margin-bottom: 7px;
}

.bullet {
  color: #d88900;
  font-size: 12px;
  margin-top: 8px;
}

.quote-card {
  background:
    linear-gradient(
      135deg,
      #fffaf0,
      #fffdf8
    );
  border-color: #f0dfb9;
}

.quote {
  font-size: 23px;
  line-height: 1.55;
  font-weight: 700;
  color: #273746;
  margin-bottom: 9px;
}

.author {
  font-size: 17px;
  color: #687681;
}

.source {
  font-size: 15px;
  color: #89949c;
  margin-top: 4px;
}

.thought-card {
  background:
    linear-gradient(
      135deg,
      #edf7fc,
      #f8fbfd
    );
  border-color: #d8eaf4;
}

.thought {
  font-size: 22px;
  line-height: 1.55;
  color: #243447;
  font-weight: 600;
}

.footer {
  margin-top: auto;
  text-align: center;
  font-size: 23px;
  font-weight: 700;
  color: #123c69;
  padding-top: 10px;
}

</style>
</head>

<body>
<div class="page">

  <div class="header">
    <div class="title">
      تقویم روزانه گروه صدای کارکنان ثبت احوال
    </div>
    <div class="subtitle">
      ☀️ روزت پر از اتفاقات خوب
    </div>
  </div>

  <div class="card">
    <div class="date-main">
      ${escapeHtml(data.weekday)} — ${escapeHtml(data.persianDate)}
    </div>

    <div class="date-line">
      میلادی: ${escapeHtml(data.gregorianDate)}
    </div>

    <div class="date-line">
      قمری: ${escapeHtml(data.hijriDate)}
    </div>

    <div class="time">
      ⏰ ساعت تهران: ${escapeHtml(data.time)}
    </div>
  </div>

  <div class="card">
    <div class="section-title">
      📊 چشم‌انداز سال
    </div>

    <div class="progress-track">
      <div class="progress-fill"></div>
    </div>

    <div class="progress-info">
      <span>
        ${escapeHtml(data.progress)}٪ از سال گذشته
      </span>

      <span>
        ${escapeHtml(data.remaining)} روز باقی‌مانده
      </span>
    </div>

    <div class="progress-info">
      <span>
        حدود ${escapeHtml(data.weeksRemaining)} هفته باقی‌مانده
      </span>
    </div>
  </div>

  <div class="stats">

    <div class="stat">
      <div class="stat-label">ماه</div>
      <div class="stat-value">
        ${escapeHtml(data.moon)}
      </div>
    </div>

    <div class="stat">
      <div class="stat-label">برج</div>
      <div class="stat-value">
        ${escapeHtml(data.zodiac)}
      </div>
    </div>

    <div class="stat">
      <div class="stat-label">نماد سال</div>
      <div class="stat-value">
        ${escapeHtml(data.animal)}
      </div>
    </div>

  </div>

  <div class="card">
    <div class="section-title">
      📌 مناسبت‌های امروز
    </div>

    <div class="events">
      ${eventsHtml}
    </div>
  </div>

  <div class="card quote-card">
    <div class="section-title">
      💬 سخن امروز
    </div>

    <div class="quote">
      «${escapeHtml(data.quote)}»
    </div>

    <div class="author">
      — ${escapeHtml(data.author)}
    </div>

    <div class="source">
      منبع: ${escapeHtml(data.source)}
    </div>
  </div>

  <div class="card thought-card">
    <div class="section-title">
      💭 جرعه‌ای تفکر
    </div>

    <div class="thought">
      «${escapeHtml(data.thought)}»
    </div>
  </div>

  <div class="footer">
    هم‌صدایی برای تحول و بهبود
  </div>

</div>
</body>
</html>
`;
}

async function createInfographic(
  env: CloudflareEnv,
  data: {
    weekday: string;
    persianDate: string;
    hijriDate: string;
    gregorianDate: string;
    time: string;
    progress: string;
    remaining: string;
    weeksRemaining: string;
    moon: string;
    zodiac: string;
    animal: string;
    events: string[];
    thought: string;
    quote: string;
    author: string;
    source: string;
  }
) {
  if (!env.BROWSER) {
    throw new Error(
      "اتصال BROWSER در Cloudflare تنظیم نشده است."
    );
  }

  const html =
    createInfographicHtml(data);

  const response =
    await env.BROWSER.quickAction(
      "screenshot",
      {
        html,
        viewport: {
          width: WIDTH,
          height: HEIGHT,
          deviceScaleFactor: 1,
        },
        screenshotOptions: {
          fullPage: false,
          type: "png",
        },
        gotoOptions: {
          waitUntil: "networkidle0",
          timeout: 30000,
        },
      }
    );

  if (!response.ok) {
    const errorText =
      await response.text().catch(
        () => ""
      );

    throw new Error(
      `خطا در تولید تصویر توسط Browser Run: ${response.status} ${errorText}`
    );
  }

  return new Uint8Array(
    await response.arrayBuffer()
  );
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
    [new Uint8Array(png)],
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
     * این قسمت دست‌نخورده باقی مانده
     * تا امکان لغو ارسال تقویم حفظ شود.
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

    const chatId =
      String(
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

    const now =
      new Date();

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
        persian.day,
        persian.year
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
      await createInfographic(
        env,
        {
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

          weeksRemaining:
            fa(progress.weeksRemaining),

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
        }
      );

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
      {
        status: 500,
      }
    );
  }
    }

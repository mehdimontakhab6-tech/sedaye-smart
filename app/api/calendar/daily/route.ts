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

  const diff = Math.round(
    (next.getTime() - start.getTime()) / 86400000
  );

  return diff >= 366;
}

function getYearProgress(
  month: number,
  day: number,
  year: number
) {
  const dayOfYear = getPersianDayOfYear(
    month,
    day
  );

  const totalDays = isPersianLeapYear(year)
    ? 366
    : 365;

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
    weeksRemaining: Math.ceil(
      Math.max(
        0,
        totalDays - dayOfYear
      ) / 7
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

  if (age < 1.85)
    return "ماه نو 🌑";

  if (age < 7.38)
    return "هلال افزاینده 🌒";

  if (age < 9.22)
    return "ربع اول 🌓";

  if (age < 14.77)
    return "تربیع افزاینده 🌔";

  if (age < 16.61)
    return "ماه کامل 🌕";

  if (age < 22.15)
    return "تربیع کاهنده 🌖";

  if (age < 23.99)
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

    if (!response.ok) {
      return null;
    }

    const json = await response.json();

    const hijri = json?.data?.hijri;

    if (!hijri) {
      return null;
    }

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

    if (!response.ok) {
      return [];
    }

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
  month: number,
  day: number
) {
  return events.filter((event) => {
    const jDate = String(
      event?.jDate ||
      event?.date ||
      ""
    );

    const normalized =
      normalize(jDate);

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

function getEventText(
  events: any[]
) {
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
 * فعلاً از نسبت دادن نقل‌قول‌های
 * غیرمستند به افراد مشهور
 * خودداری شده است.
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
    (day - 1) %
      DAILY_CONTENT.length
  ];
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
  const progressValue = Math.min(
    100,
    Math.max(
      0,
      Number(data.progress)
    )
  );

  const eventsHtml =
    data.events.length
      ? data.events
          .map(
            (event) => `
              <div class="event-row">
                <div class="event-icon">✓</div>
                <div class="event-text">
                  ${escapeHtml(event)}
                </div>
              </div>
            `
          )
          .join("")
      : `
          <div class="event-row">
            <div class="event-icon">•</div>
            <div class="event-text">
              مناسبتی برای امروز ثبت نشده است.
            </div>
          </div>
        `;

  return `
<!doctype html>
<html lang="fa" dir="rtl">
<head>

<meta charset="utf-8">

<meta
  name="viewport"
  content="width=${WIDTH}, height=${HEIGHT}"
>

<style>

@font-face {
  font-family: Vazirmatn;
  src: url("https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/fonts/ttf/Vazirmatn-Regular.ttf")
    format("truetype");
  font-weight: 400;
}

@font-face {
  font-family: Vazirmatn;
  src: url("https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/fonts/ttf/Vazirmatn-Bold.ttf")
    format("truetype");
  font-weight: 700;
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
  font-family:
    Vazirmatn,
    Arial,
    sans-serif;

  background:
    radial-gradient(
      circle at 90% 5%,
      rgba(43, 125, 190, 0.16),
      transparent 26%
    ),
    radial-gradient(
      circle at 5% 35%,
      rgba(245, 171, 49, 0.12),
      transparent 24%
    ),
    linear-gradient(
      180deg,
      #f2f7fb 0%,
      #ffffff 46%,
      #f4f8fb 100%
    );

  color: #182a3a;
}

.page {
  width: ${WIDTH}px;
  height: ${HEIGHT}px;

  padding:
    34px
    42px
    30px;

  position: relative;

  display: flex;
  flex-direction: column;

  overflow: hidden;
}

/* HERO */

.hero {
  height: 258px;

  border-radius: 38px;

  padding:
    34px
    42px;

  position: relative;
  overflow: hidden;

  color: white;

  background:
    linear-gradient(
      135deg,
      #0b3558 0%,
      #145b8d 55%,
      #2387b8 100%
    );

  box-shadow:
    0 20px 45px
    rgba(16, 63, 93, 0.20);

  margin-bottom: 18px;
}

.hero::before {
  content: "";

  position: absolute;

  width: 300px;
  height: 300px;

  border-radius: 50%;

  top: -145px;
  left: -90px;

  background:
    rgba(255,255,255,0.07);
}

.hero::after {
  content: "";

  position: absolute;

  width: 240px;
  height: 240px;

  border-radius: 50%;

  bottom: -160px;
  right: -45px;

  background:
    rgba(255,190,55,0.16);
}

.hero-content {
  position: relative;
  z-index: 2;
}

.brand {
  font-size: 24px;
  font-weight: 700;

  opacity: 0.88;

  margin-bottom: 8px;
}

.hero-title {
  font-size: 38px;
  line-height: 1.25;

  font-weight: 700;

  margin-bottom: 12px;
}

.hero-subtitle {
  font-size: 23px;

  color: #ffe6a9;

  font-weight: 700;
}

.sun {
  position: absolute;

  left: 38px;
  top: 35px;

  width: 88px;
  height: 88px;

  border-radius: 50%;

  background:
    radial-gradient(
      circle,
      #fff8d7 0%,
      #ffd66a 55%,
      #f2a62a 100%
    );

  box-shadow:
    0 0 50px
    rgba(255,207,86,0.34);
}

/* MAIN DATE */

.date-panel {
  margin-top: 16px;

  min-height: 198px;

  background: rgba(
    255,
    255,
    255,
    0.96
  );

  border: 1px solid #e1ebf2;

  border-radius: 30px;

  padding: 24px 30px;

  box-shadow:
    0 13px 35px
    rgba(25,55,80,0.07);

  position: relative;
}

.date-weekday {
  color: #6b7d8b;

  font-size: 22px;

  font-weight: 700;

  margin-bottom: 4px;
}

.date-main {
  color: #0d4771;

  font-size: 46px;

  font-weight: 700;

  letter-spacing: -1px;

  line-height: 1.25;

  margin-bottom: 14px;
}

.date-grid {
  display: flex;

  gap: 12px;
}

.date-chip {
  flex: 1;

  background: #f4f8fb;

  border-radius: 16px;

  padding: 11px 14px;

  border: 1px solid #e2ebf1;
}

.date-chip-label {
  color: #82919c;

  font-size: 14px;

  margin-bottom: 3px;
}

.date-chip-value {
  color: #314656;

  font-size: 18px;

  font-weight: 700;
}

.clock {
  position: absolute;

  left: 27px;
  top: 25px;

  background:
    linear-gradient(
      135deg,
      #0d4d76,
      #1c7fa9
    );

  color: white;

  border-radius: 18px;

  padding:
    10px
    17px;

  font-size: 19px;

  font-weight: 700;

  box-shadow:
    0 7px 17px
    rgba(13,77,118,0.18);
}

/* YEAR PROGRESS */

.progress-panel {
  margin-top: 16px;

  background: #ffffff;

  border-radius: 30px;

  padding: 21px 28px;

  border: 1px solid #e2ebf1;

  box-shadow:
    0 12px 32px
    rgba(25,55,80,0.06);
}

.panel-heading {
  display: flex;

  justify-content: space-between;

  align-items: center;

  margin-bottom: 13px;
}

.panel-title {
  font-size: 23px;

  color: #164e75;

  font-weight: 700;
}

.percent {
  font-size: 20px;

  color: #e29a1d;

  font-weight: 700;
}

.progress-track {
  height: 25px;

  width: 100%;

  background: #e9eff4;

  border-radius: 20px;

  padding: 4px;

  overflow: hidden;
}

.progress-fill {
  width: ${progressValue}%;

  height: 17px;

  border-radius: 15px;

  background:
    linear-gradient(
      90deg,
      #f0a52a,
      #f7c75d,
      #eaa12c
    );

  box-shadow:
    0 3px 9px
    rgba(235,165,42,0.25);
}

.progress-meta {
  display: flex;

  justify-content: space-between;

  margin-top: 9px;

  font-size: 16px;

  color: #738390;
}

/* STATS */

.stats {
  display: flex;

  gap: 13px;

  margin-top: 16px;
}

.stat {
  flex: 1;

  min-height: 112px;

  background: #ffffff;

  border-radius: 25px;

  border: 1px solid #e1eaf0;

  padding:
    17px
    13px;

  text-align: center;

  box-shadow:
    0 10px 25px
    rgba(25,55,80,0.055);
}

.stat-icon {
  font-size: 29px;

  line-height: 1;

  margin-bottom: 7px;
}

.stat-label {
  font-size: 14px;

  color: #83919c;

  margin-bottom: 4px;
}

.stat-value {
  font-size: 18px;

  color: #274355;

  font-weight: 700;

  line-height: 1.35;
}

/* EVENTS */

.events-panel {
  margin-top: 16px;

  background:
    linear-gradient(
      135deg,
      #ffffff,
      #f8fbfd
    );

  border-radius: 30px;

  border: 1px solid #e0e9ef;

  padding: 20px 27px;

  box-shadow:
    0 10px 28px
    rgba(25,55,80,0.055);
}

.events-heading {
  display: flex;

  align-items: center;

  gap: 10px;

  font-size: 23px;

  font-weight: 700;

  color: #164e75;

  margin-bottom: 13px;
}

.event-row {
  display: flex;

  align-items: flex-start;

  gap: 11px;

  padding: 8px 0;

  border-bottom:
    1px solid #edf1f4;

  font-size: 17px;

  color: #3e5362;

  line-height: 1.45;
}

.event-row:last-child {
  border-bottom: none;
}

.event-icon {
  flex: 0 0 27px;

  width: 27px;
  height: 27px;

  border-radius: 50%;

  display: flex;

  align-items: center;

  justify-content: center;

  background: #e8f4f8;

  color: #1681a5;

  font-size: 14px;

  font-weight: 700;
}

.event-text {
  flex: 1;
}

/* QUOTE */

.quote-panel {
  margin-top: 16px;

  border-radius: 30px;

  padding:
    21px
    28px;

  position: relative;

  overflow: hidden;

  background:
    linear-gradient(
      135deg,
      #fff9ec,
      #fffdf7
    );

  border: 1px solid #f0dfb6;

  box-shadow:
    0 10px 27px
    rgba(184,133,42,0.07);
}

.quote-mark {
  position: absolute;

  left: 22px;
  top: -9px;

  font-size: 92px;

  line-height: 1;

  color: #edc66d;

  opacity: 0.45;

  font-family: Georgia, serif;
}

.quote-heading {
  color: #a87312;

  font-size: 20px;

  font-weight: 700;

  margin-bottom: 9px;
}

.quote {
  position: relative;

  z-index: 2;

  color: #39434b;

  font-size: 21px;

  font-weight: 700;

  line-height: 1.55;

  margin-bottom: 8px;
}

.quote-author {
  color: #7d858b;

  font-size: 15px;
}

/* THOUGHT */

.thought-panel {
  margin-top: 16px;

  border-radius: 30px;

  padding:
    20px
    28px;

  background:
    linear-gradient(
      135deg,
      #0d466b,
      #176e91
    );

  color: white;

  box-shadow:
    0 14px 32px
    rgba(16,77,108,0.18);

  position: relative;

  overflow: hidden;
}

.thought-panel::after {
  content: "✦";

  position: absolute;

  left: 25px;
  bottom: -25px;

  font-size: 125px;

  color:
    rgba(255,255,255,0.07);
}

.thought-heading {
  font-size: 20px;

  color: #ffe4a1;

  font-weight: 700;

  margin-bottom: 8px;
}

.thought {
  font-size: 20px;

  line-height: 1.55;

  font-weight: 700;

  position: relative;

  z-index: 2;
}

/* FOOTER */

.footer {
  margin-top: auto;

  padding-top: 17px;

  text-align: center;

  color: #527083;

  font-size: 19px;

  font-weight: 700;

  letter-spacing: 0.2px;
}

.footer-line {
  width: 110px;

  height: 3px;

  border-radius: 5px;

  background:
    linear-gradient(
      90deg,
      #e8a32b,
      #1b7197
    );

  margin:
    0 auto
    10px;
}

</style>
</head>

<body>

<div class="page">

  <!-- HERO -->

  <section class="hero">

    <div class="sun"></div>

    <div class="hero-content">

      <div class="brand">
        صدای کارکنان ثبت احوال
      </div>

      <div class="hero-title">
        تقویم روزانه گروه
      </div>

      <div class="hero-subtitle">
        ☀️ روزت پر از اتفاقات خوب
      </div>

    </div>

  </section>

  <!-- DATE -->

  <section class="date-panel">

    <div class="clock">
      ⏰ ${escapeHtml(data.time)}
    </div>

    <div class="date-weekday">
      ${escapeHtml(data.weekday)}
    </div>

    <div class="date-main">
      ${escapeHtml(data.persianDate)}
    </div>

    <div class="date-grid">

      <div class="date-chip">
        <div class="date-chip-label">
          میلادی
        </div>

        <div class="date-chip-value">
          ${escapeHtml(data.gregorianDate)}
        </div>
      </div>

      <div class="date-chip">
        <div class="date-chip-label">
          قمری
        </div>

        <div class="date-chip-value">
          ${escapeHtml(data.hijriDate)}
        </div>
      </div>

    </div>

  </section>

  <!-- YEAR PROGRESS -->

  <section class="progress-panel">

    <div class="panel-heading">

      <div class="panel-title">
        📊 چشم‌انداز سال
      </div>

      <div class="percent">
        ${escapeHtml(data.progress)}٪
      </div>

    </div>

    <div class="progress-track">

      <div class="progress-fill"></div>

    </div>

    <div class="progress-meta">

      <span>
        ${escapeHtml(data.remaining)}
        روز باقی‌مانده
      </span>

      <span>
        حدود
        ${escapeHtml(data.weeksRemaining)}
        هفته
      </span>

    </div>

  </section>

  <!-- STATS -->

  <section class="stats">

    <div class="stat">

      <div class="stat-icon">
        🌙
      </div>

      <div class="stat-label">
        وضعیت ماه
      </div>

      <div class="stat-value">
        ${escapeHtml(data.moon)}
      </div>

    </div>

    <div class="stat">

      <div class="stat-icon">
        ♈
      </div>

      <div class="stat-label">
        برج
      </div>

      <div class="stat-value">
        ${escapeHtml(data.zodiac)}
      </div>

    </div>

    <div class="stat">

      <div class="stat-icon">
        🐎
      </div>

      <div class="stat-label">
        نماد سال
      </div>

      <div class="stat-value">
        ${escapeHtml(data.animal)}
      </div>

    </div>

  </section>

  <!-- EVENTS -->

  <section class="events-panel">

    <div class="events-heading">
      📌 مناسبت‌های امروز
    </div>

    ${eventsHtml}

  </section>

  <!-- QUOTE -->

  <section class="quote-panel">

    <div class="quote-mark">
      “
    </div>

    <div class="quote-heading">
      💬 سخن امروز
    </div>

    <div class="quote">
      «${escapeHtml(data.quote)}»
    </div>

    <div class="quote-author">
      — ${escapeHtml(data.author)}
      · ${escapeHtml(data.source)}
    </div>

  </section>

  <!-- THOUGHT -->

  <section class="thought-panel">

    <div class="thought-heading">
      💭 جرعه‌ای تفکر
    </div>

    <div class="thought">
      «${escapeHtml(data.thought)}»
    </div>

  </section>

  <!-- FOOTER -->

  <footer class="footer">

    <div class="footer-line"></div>

    هم‌صدایی برای تحول و بهبود

  </footer>

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
      await response
        .text()
        .catch(() => "");

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

  const response =
    await fetch(
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
     * حفظ قابلیت لغو ارسال تقویم
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
      `${String(
        tehran.month
      ).padStart(2, "0")}-` +
      `${String(
        tehran.day
      ).padStart(2, "0")}`;

    const weekday =
      getWeekday(now);

    const hijri =
      await getHijriDate(
        `${String(
          tehran.day
        ).padStart(2, "0")}-` +
        `${String(
          tehran.month
        ).padStart(2, "0")}-` +
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
            `${fa(
              String(
                persian.month
              ).padStart(2, "0")
            )}/` +
            `${fa(
              String(
                persian.day
              ).padStart(2, "0")
            )}`,

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
            fa(
              progress.weeksRemaining
            ),

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

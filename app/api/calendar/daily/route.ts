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
  return value
    .replace(/[۰-۹]/g, (d) => String(digits.indexOf(d)))
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, " ");
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* -------------------------------------------------------
   زمان تهران
------------------------------------------------------- */

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

/* -------------------------------------------------------
   تاریخ شمسی
------------------------------------------------------- */

function getPersianDate(date: Date) {
  const parts = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

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

/* -------------------------------------------------------
   روز سال و درصد پیشرفت
------------------------------------------------------- */

function getPersianDayOfYear(month: number, day: number) {
  let total = 0;

  for (let m = 1; m < month; m++) {
    total += m <= 6 ? 31 : m <= 11 ? 30 : 29;
  }

  return total + day;
}

function isPersianLeapYear(year: number) {
  const start = new Date(`${year}-03-20T12:00:00+03:30`);
  const next = new Date(`${year + 1}-03-20T12:00:00+03:30`);

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

/* -------------------------------------------------------
   برج
------------------------------------------------------- */

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

/* -------------------------------------------------------
   حیوان سال
   ۱۴۰۵ = اسب
------------------------------------------------------- */

function getAnimal(year: number) {
  const animals = [
    "موش 🐀",
    "گاو 🐂",
    "ببر 🐅",
    "خرگوش 🐇",
    "اژدها 🐉",
    "مار 🐍",
    "اسب 🐎",
    "بز 🐐",
    "میمون 🐒",
    "خروس 🐓",
    "سگ 🐕",
    "خوک 🐖",
  ];

  return animals[
    ((year - 1399) % 12 + 12) % 12
  ];
}

/* -------------------------------------------------------
   وضعیت ماه
------------------------------------------------------- */

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

/* -------------------------------------------------------
   تاریخ قمری
------------------------------------------------------- */

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

/* -------------------------------------------------------
   مناسبت‌ها
------------------------------------------------------- */

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
    .slice(0, 6);
}

/* -------------------------------------------------------
   محتوای روزانه
------------------------------------------------------- */

const DAILY_CONTENT = [
  {
    thought:
      "مسائل پیچیده همیشه با راه‌حل‌های پیچیده حل نمی‌شوند.",
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

/* -------------------------------------------------------
   طراحی کامل تصویر
------------------------------------------------------- */

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
    Math.max(0, Number(data.progress))
  );

  const eventsHtml = data.events.length
    ? data.events
        .map(
          (event) => `
            <div class="event-row">
              <span class="event-bullet">✦</span>
              <span class="event-text">
                ${escapeHtml(event)}
              </span>
            </div>
          `
        )
        .join("")
    : `
        <div class="event-row">
          <span class="event-bullet">✦</span>
          <span class="event-text">
            مناسبتی برای امروز ثبت نشده است.
          </span>
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

  color: #18384d;

  background:
    linear-gradient(
      180deg,
      #bde8ff 0%,
      #eaf8ff 18%,
      #ffffff 48%,
      #f2faef 78%,
      #dcefd7 100%
    );
}

.page {
  width: ${WIDTH}px;
  height: ${HEIGHT}px;

  padding:
    0
    30px
    26px;

  overflow: hidden;

  position: relative;
}

/* --------------------------------
   نور و تزئینات طبیعی
-------------------------------- */

.page::before {
  content: "";

  position: absolute;

  width: 330px;
  height: 330px;

  top: -130px;
  left: -90px;

  border-radius: 50%;

  background:
    radial-gradient(
      circle,
      rgba(255,231,123,.95) 0%,
      rgba(255,218,109,.55) 28%,
      rgba(255,255,255,0) 72%
    );
}

.page::after {
  content: "";

  position: absolute;

  width: 390px;
  height: 240px;

  right: -120px;
  bottom: -100px;

  border-radius: 50%;

  background:
    radial-gradient(
      ellipse,
      rgba(93,180,106,.25),
      transparent 70%
    );
}

/* --------------------------------
   هدر
-------------------------------- */

.hero {
  height: 270px;

  margin:
    0
    -30px
    18px;

  position: relative;

  display: flex;

  align-items: flex-end;
  justify-content: center;

  padding:
    0
    45px
    43px;

  overflow: hidden;

  background:
    radial-gradient(
      circle at 50% 42%,
      rgba(255,239,155,.98) 0 6%,
      rgba(255,221,121,.65) 13%,
      rgba(255,255,255,0) 34%
    ),
    linear-gradient(
      180deg,
      #82cdf6 0%,
      #c8eaff 48%,
      #eaf6df 100%
    );

  border-radius:
    0
    0
    50%
    50% /
    0
    0
    22%
    22%;
}

.hero::before {
  content: "";

  position: absolute;

  left: -10%;
  right: -10%;
  bottom: 0;

  height: 115px;

  background:
    linear-gradient(
      145deg,
      transparent 0 34%,
      #6598a7 35% 48%,
      transparent 49%
    ),
    linear-gradient(
      35deg,
      transparent 0 48%,
      #527f91 49% 61%,
      transparent 62%
    ),
    linear-gradient(
      160deg,
      transparent 0 54%,
      #86aeb1 55% 70%,
      transparent 71%
    );

  opacity: .72;
}

.hero::after {
  content: "";

  position: absolute;

  left: 0;
  right: 0;
  bottom: 0;

  height: 72px;

  background:
    linear-gradient(
      180deg,
      transparent,
      rgba(226,244,220,.95)
    );
}

.hero-title {
  position: relative;
  z-index: 3;

  color: #063f67;

  font-size: 43px;

  line-height: 1.35;

  font-weight: 700;

  text-align: center;

  text-shadow:
    0 3px 10px
    rgba(255,255,255,.95);
}

/* --------------------------------
   سلام صبحگاهی
-------------------------------- */

.greeting {
  position: absolute;

  top: 30px;
  right: 34px;

  z-index: 5;

  color: #195d78;

  font-size: 20px;

  font-weight: 700;
}

/* --------------------------------
   تاریخ
-------------------------------- */

.date-panel {
  min-height: 270px;

  padding:
    28px
    32px
    25px;

  position: relative;

  border-radius: 34px;

  background:
    linear-gradient(
      135deg,
      rgba(255,255,255,.98),
      rgba(244,251,255,.95)
    );

  box-shadow:
    0 14px 35px
    rgba(37,101,133,.10);
}

.date-panel::before {
  content: "";

  position: absolute;

  top: 17px;
  right: 28px;
  left: 28px;

  height: 4px;

  border-radius: 10px;

  background:
    linear-gradient(
      90deg,
      #39a7d7,
      #8bd7c2,
      #f3c968
    );

  opacity: .65;
}

.date-weekday {
  margin-top: 20px;

  color: #587689;

  font-size: 25px;

  font-weight: 700;

  text-align: right;
}

.date-main {
  margin-top: 4px;

  color: #0a4d77;

  font-size: 53px;

  line-height: 1.22;

  font-weight: 700;

  text-align: right;
}

.greeting-line {
  margin-top: 6px;

  color: #24906f;

  font-size: 22px;

  font-weight: 700;

  text-align: right;
}

.clock {
  position: absolute;

  top: 28px;
  left: 30px;

  padding:
    11px
    19px;

  border-radius: 20px;

  color: #ffffff;

  background:
    linear-gradient(
      135deg,
      #17638b,
      #2997b6
    );

  font-size: 22px;

  font-weight: 700;

  box-shadow:
    0 9px 20px
    rgba(24,100,139,.22);
}

.date-grid {
  display: flex;

  flex-direction: row-reverse;

  gap: 14px;

  margin-top: 18px;
}

.date-chip {
  flex: 1;

  padding:
    12px
    16px;

  border-radius: 19px;

  background:
    rgba(255,255,255,.78);

  box-shadow:
    inset 0 0 0 1px
    rgba(165,204,223,.55);

  text-align: right;
}

.date-chip-label {
  color: #7c919e;

  font-size: 17px;

  margin-bottom: 3px;
}

.date-chip-value {
  color: #29495d;

  font-size: 21px;

  font-weight: 700;
}

/* --------------------------------
   پیشرفت سال
-------------------------------- */

.progress-panel {
  margin-top: 17px;

  padding:
    22px
    28px;

  border-radius: 30px;

  background:
    linear-gradient(
      135deg,
      #edfdf6,
      #fbfffd
    );

  box-shadow:
    0 12px 28px
    rgba(44,139,112,.08);
}

.panel-heading {
  display: flex;

  flex-direction: row-reverse;

  justify-content: space-between;

  align-items: center;

  margin-bottom: 13px;
}

.panel-title {
  color: #116d60;

  font-size: 28px;

  font-weight: 700;
}

.percent {
  color: #18536e;

  font-size: 25px;

  font-weight: 700;
}

.progress-track {
  width: 100%;

  height: 28px;

  padding: 4px;

  overflow: hidden;

  border-radius: 20px;

  background:
    #d9efea;
}

.progress-fill {
  width: ${progressValue}%;

  height: 20px;

  border-radius: 18px;

  background:
    linear-gradient(
      90deg,
      #28a678,
      #61c77e
    );
}

.progress-meta {
  display: flex;

  flex-direction: row-reverse;

  justify-content: space-between;

  margin-top: 9px;

  color: #587d77;

  font-size: 19px;
}

/* --------------------------------
   سه شاخص
-------------------------------- */

.stats {
  display: flex;

  flex-direction: row-reverse;

  gap: 14px;

  margin-top: 17px;
}

.stat {
  flex: 1;

  min-height: 132px;

  padding:
    15px
    13px;

  border-radius: 27px;

  background:
    linear-gradient(
      135deg,
      #ffffff,
      #f8fbff
    );

  box-shadow:
    0 10px 25px
    rgba(68,93,133,.08);

  text-align: center;
}

.stat:nth-child(1) {
  background:
    linear-gradient(
      135deg,
      #fffaf0,
      #ffffff
    );
}

.stat:nth-child(2) {
  background:
    linear-gradient(
      135deg,
      #f7f4ff,
      #ffffff
    );
}

.stat:nth-child(3) {
  background:
    linear-gradient(
      135deg,
      #f0fbf5,
      #ffffff
    );
}

.stat-icon {
  font-size: 34px;

  line-height: 1;

  margin-bottom: 8px;
}

.stat-label {
  color: #758794;

  font-size: 17px;

  margin-bottom: 4px;
}

.stat-value {
  color: #27485d;

  font-size: 21px;

  font-weight: 700;

  line-height: 1.35;
}

/* --------------------------------
   مناسبت‌ها
-------------------------------- */

.events-panel {
  margin-top: 17px;

  padding:
    22px
    29px;

  border-radius: 31px;

  background:
    linear-gradient(
      135deg,
      #fff9eb,
      #fffefd
    );

  box-shadow:
    0 12px 28px
    rgba(205,142,37,.08);

  direction: rtl;

  text-align: right;
}

.events-heading {
  margin-bottom: 11px;

  color: #c87909;

  font-size: 30px;

  font-weight: 700;

  text-align: right;
}

.event-row {
  display: flex;

  flex-direction: row-reverse;

  align-items: flex-start;

  gap: 12px;

  padding:
    8px
    0;

  color: #354d5d;

  font-size: 21px;

  line-height: 1.55;

  text-align: right;
}

.event-bullet {
  flex: 0 0 30px;

  width: 30px;
  height: 30px;

  display: flex;

  align-items: center;
  justify-content: center;

  border-radius: 50%;

  color: white;

  background:
    linear-gradient(
      135deg,
      #f1a529,
      #e17e19
    );

  font-size: 15px;

  font-weight: 700;
}

.event-text {
  flex: 1;

  text-align: right;
}

/* --------------------------------
   سخن بزرگان
-------------------------------- */

.quote-panel {
  margin-top: 17px;

  padding:
    22px
    30px;

  border-radius: 31px;

  background:
    linear-gradient(
      135deg,
      #f7f4ff,
      #ffffff
    );

  box-shadow:
    0 12px 28px
    rgba(91,77,160,.08);

  direction: rtl;

  text-align: right;
}

.quote-heading {
  margin-bottom: 8px;

  color: #5e4da2;

  font-size: 30px;

  font-weight: 700;

  text-align: right;
}

.quote {
  color: #273f57;

  font-size: 27px;

  line-height: 1.55;

  font-weight: 700;

  text-align: right;
}

.quote-author {
  margin-top: 8px;

  color: #746d82;

  font-size: 18px;

  text-align: right;
}

/* --------------------------------
   جرعه تفکر
-------------------------------- */

.thought-panel {
  margin-top: 17px;

  padding:
    22px
    30px;

  border-radius: 31px;

  background:
    linear-gradient(
      135deg,
      #eefcfc,
      #ffffff
    );

  box-shadow:
    0 12px 28px
    rgba(35,145,145,.08);

  direction: rtl;

  text-align: right;
}

.thought-heading {
  margin-bottom: 8px;

  color: #087d80;

  font-size: 30px;

  font-weight: 700;

  text-align: right;
}

.thought {
  color: #183f56;

  font-size: 27px;

  line-height: 1.55;

  font-weight: 700;

  text-align: right;
}

.thought::after {
  content: "✦";

  display: block;

  margin-top: 5px;

  color: #29a99c;

  font-size: 23px;

  text-align: center;
}

/* --------------------------------
   فضای پایانی
-------------------------------- */

.bottom-nature {
  height: 55px;

  margin:
    10px
    -30px
    0;

  position: relative;

  overflow: hidden;

  background:
    linear-gradient(
      180deg,
      transparent,
      rgba(121,180,113,.12)
    );
}

.bottom-nature::before {
  content: "";

  position: absolute;

  width: 520px;
  height: 110px;

  right: -70px;
  bottom: -75px;

  border-radius: 50%;

  background:
    #a8d69e;
}

.bottom-nature::after {
  content: "";

  position: absolute;

  width: 480px;
  height: 95px;

  left: -60px;
  bottom: -70px;

  border-radius: 50%;

  background:
    #c6e6b8;
}

</style>

</head>

<body>

<div class="page">

  <section class="hero">

    <div class="greeting">
      روزت پر از اتفاقات خوب ☀️
    </div>

    <div class="hero-title">
      تقویم روزانه گروه صدای کارکنان ثبت احوال
    </div>

  </section>

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

    <div class="greeting-line">
      یک روز تازه، یک فرصت تازه برای بهتر شدن 🌱
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
        ♎
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

  <section class="events-panel">

    <div class="events-heading">
      📌 رویدادها و مناسبت‌ها
    </div>

    ${eventsHtml}

  </section>

  <section class="quote-panel">

    <div class="quote-heading">
      🪶 سخن بزرگان
    </div>

    <div class="quote">
      «${escapeHtml(data.quote)}»
    </div>

    <div class="quote-author">
      — ${escapeHtml(data.author)}
      ·
      ${escapeHtml(data.source)}
    </div>

  </section>

  <section class="thought-panel">

    <div class="thought-heading">
      💡 جرعه‌ای تفکر
    </div>

    <div class="thought">
      «${escapeHtml(data.thought)}»
    </div>

  </section>

  <div class="bottom-nature"></div>

</div>

</body>
</html>
`;
}

/* -------------------------------------------------------
   ساخت تصویر با Browser
------------------------------------------------------- */

async function createInfographic(
  env: CloudflareEnv,
  data: Parameters<
    typeof createInfographicHtml
  >[0]
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

/* -------------------------------------------------------
   ارسال تصویر به بله
------------------------------------------------------- */

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

/* -------------------------------------------------------
   فعال / لغو بودن ارسال تقویم
------------------------------------------------------- */

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

    const response =
      await fetch(
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

/* -------------------------------------------------------
   GET
------------------------------------------------------- */

export async function GET() {
  try {

    const { env } =
      await getCloudflareContext({
        async: true,
      });

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

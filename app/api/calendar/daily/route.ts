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
  return value.replace(/[۰-۹]/g, (d) => String(digits.indexOf(d)));
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
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const synodicMonth = 29.530588853;

  let age =
    ((date.getTime() - knownNewMoon) / 86400000) %
    synodicMonth;

  if (age < 0) age += synodicMonth;

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
      { headers: { Accept: "application/json" } }
    );

    if (!response.ok) return null;

    const json = await response.json();
    const hijri = json?.data?.hijri;

    if (!hijri) return null;

    return {
      day: hijri.day,
      month: hijri.month?.ar || hijri.month?.en || "",
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
      { headers: { Accept: "application/json" } }
    );

    if (!response.ok) return [];

    const data = await response.json();

    if (Array.isArray(data)) return data;

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

    return eventMonth === month && eventDay === day;
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

const DAILY_CONTENT = [
  {
    thought: "مسائل پیچیده همیشه با راه‌حل‌های پیچیده حل نمی‌شوند.",
    quote: "پیشرفت، نتیجه قدم‌های کوچک و پیوسته است.",
    author: "محتوای تأملی گروه",
    source: "صدای کارکنان ثبت احوال",
  },
  {
    thought: "قبل از پاسخ دادن، کمی بیشتر گوش بده؛ شاید نکته اصلی همان‌جا باشد.",
    quote: "هر پاسخ خوب، از یک پرسش خوب آغاز می‌شود.",
    author: "محتوای تأملی گروه",
    source: "صدای کارکنان ثبت احوال",
  },
  {
    thought: "گاهی بهترین راه‌حل، نگاه کردن به مسئله از زاویه‌ای تازه است.",
    quote: "تغییر از جایی آغاز می‌شود که مسئله را درست ببینیم.",
    author: "محتوای تأملی گروه",
    source: "صدای کارکنان ثبت احوال",
  },
  {
    thought: "امروز یک کار را بهتر از دیروز انجام بده؛ همین کافی است.",
    quote: "بهتر شدن، همیشه با یک تغییر کوچک آغاز می‌شود.",
    author: "محتوای تأملی گروه",
    source: "صدای کارکنان ثبت احوال",
  },
  {
    thought: "آرامش یعنی بدانیم همه چیز را نمی‌توانیم کنترل کنیم، اما واکنش خود را می‌توانیم.",
    quote: "مسئولیت‌پذیری از انتخاب واکنش درست آغاز می‌شود.",
    author: "محتوای تأملی گروه",
    source: "صدای کارکنان ثبت احوال",
  },
  {
    thought: "هر گفت‌وگوی خوب می‌تواند آغاز یک تغییر خوب باشد.",
    quote: "گفت‌وگو، راهی برای نزدیک‌تر شدن اندیشه‌هاست.",
    author: "محتوای تأملی گروه",
    source: "صدای کارکنان ثبت احوال",
  },
  {
    thought: "اگر چیزی ارزشمند است، برای بهتر شدنش زمان بگذار.",
    quote: "کیفیت، نتیجه توجه مداوم به جزئیات است.",
    author: "محتوای تأملی گروه",
    source: "صدای کارکنان ثبت احوال",
  },
  {
    thought: "پیشرفت همیشه بزرگ و چشمگیر نیست؛ گاهی فقط یک انتخاب درست است.",
    quote: "یک انتخاب درست می‌تواند آغاز یک مسیر تازه باشد.",
    author: "محتوای تأملی گروه",
    source: "صدای کارکنان ثبت احوال",
  },
  {
    thought: "امروز از خودت بپرس: چه چیزی را می‌توانم ساده‌تر انجام دهم؟",
    quote: "ساده‌سازی، بخشی از هنر حل مسئله است.",
    author: "محتوای تأملی گروه",
    source: "صدای کارکنان ثبت احوال",
  },
  {
    thought: "گاهی لازم نیست سریع‌تر حرکت کنیم؛ لازم است درست‌تر حرکت کنیم.",
    quote: "سرعت بدون جهت، پیشرفت نیست.",
    author: "محتوای تأملی گروه",
    source: "صدای کارکنان ثبت احوال",
  },
];

function getDailyContent(day: number) {
  return DAILY_CONTENT[
    (day - 1) % DAILY_CONTENT.length
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
    Math.max(0, Number(data.progress))
  );

  const eventsHtml = data.events.length
    ? data.events
        .map(
          (event) => `
            <div class="event-row">
              <div class="event-icon">✓</div>
              <div class="event-text">${escapeHtml(event)}</div>
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
<meta name="viewport" content="width=${WIDTH}, height=${HEIGHT}">
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
  font-family: Vazirmatn, Arial, sans-serif;
  color: #173653;
  background:
    linear-gradient(180deg, #eef8ff 0%, #ffffff 34%, #f6fbff 100%);
}

.page {
  width: ${WIDTH}px;
  height: ${HEIGHT}px;
  padding: 0 26px 24px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.hero {
  height: 255px;
  margin: 0 -26px 18px;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0 38px 45px;
  background:
    radial-gradient(circle at 50% 55%, rgba(255,231,147,.96) 0 5%, rgba(255,205,95,.55) 12%, transparent 30%),
    linear-gradient(180deg, #a9ddff 0%, #f8f0d2 52%, #d9ecf6 72%, #a8cbd8 100%);
  border-radius: 0 0 48% 48% / 0 0 28% 28%;
}

.hero::before {
  content: "";
  position: absolute;
  inset: 70px -80px 0;
  background:
    linear-gradient(150deg, transparent 0 45%, rgba(57,91,125,.88) 46% 54%, transparent 55%),
    linear-gradient(25deg, transparent 0 51%, rgba(75,116,145,.78) 52% 60%, transparent 61%);
  opacity: .9;
}

.hero::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 76px;
  background: linear-gradient(180deg, transparent, rgba(255,255,255,.92));
}

.hero-title {
  position: relative;
  z-index: 2;
  color: #083e70;
  font-size: 43px;
  line-height: 1.35;
  font-weight: 700;
  text-align: center;
  text-shadow: 0 3px 12px rgba(255,255,255,.9);
}

.date-panel {
  min-height: 265px;
  padding: 24px 32px;
  position: relative;
  border: 1.5px solid #72b9e8;
  border-radius: 30px;
  background:
    linear-gradient(135deg, rgba(255,255,255,.98), rgba(238,248,255,.96));
  box-shadow: 0 12px 28px rgba(39,105,150,.08);
}

.date-panel::before {
  content: "";
  position: absolute;
  top: 18px;
  right: 24px;
  left: 24px;
  height: 3px;
  border-radius: 10px;
  background: linear-gradient(90deg, #1689cf, #8bd5ed);
  opacity: .55;
}

.date-weekday {
  margin-top: 22px;
  color: #547183;
  font-size: 25px;
  font-weight: 700;
  text-align: right;
}

.date-main {
  margin-top: 4px;
  color: #0d4a78;
  font-size: 51px;
  line-height: 1.25;
  font-weight: 700;
  text-align: right;
}

.date-grid {
  display: flex;
  flex-direction: row-reverse;
  gap: 14px;
  margin-top: 18px;
}

.date-chip {
  flex: 1;
  padding: 13px 16px;
  border-radius: 18px;
  background: rgba(255,255,255,.72);
  border: 1px solid #d8eaf5;
  text-align: right;
}

.date-chip-label {
  color: #7c8e9a;
  font-size: 17px;
  margin-bottom: 3px;
}

.date-chip-value {
  color: #29485d;
  font-size: 22px;
  font-weight: 700;
}

.clock {
  position: absolute;
  top: 24px;
  left: 28px;
  padding: 11px 18px;
  border-radius: 18px;
  color: #fff;
  background: linear-gradient(135deg, #0d4d76, #1d82b0);
  font-size: 22px;
  font-weight: 700;
  box-shadow: 0 8px 18px rgba(13,77,118,.2);
}

.progress-panel {
  margin-top: 16px;
  padding: 22px 28px;
  border: 1.5px solid #b6dfd8;
  border-radius: 28px;
  background: linear-gradient(135deg, #eefcf8, #f8ffff);
  box-shadow: 0 10px 25px rgba(42,137,119,.07);
}

.panel-heading {
  display: flex;
  flex-direction: row-reverse;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 13px;
}

.panel-title {
  color: #12685f;
  font-size: 28px;
  font-weight: 700;
}

.percent {
  color: #174a68;
  font-size: 25px;
  font-weight: 700;
}

.progress-track {
  width: 100%;
  height: 27px;
  padding: 4px;
  overflow: hidden;
  border-radius: 20px;
  background: #d9eef1;
}

.progress-fill {
  width: ${progressValue}%;
  height: 19px;
  border-radius: 18px;
  background: linear-gradient(90deg, #18a276, #39b993);
}

.progress-meta {
  display: flex;
  flex-direction: row-reverse;
  justify-content: space-between;
  margin-top: 9px;
  color: #5c7c7a;
  font-size: 19px;
}

.stats {
  display: flex;
  flex-direction: row-reverse;
  gap: 14px;
  margin-top: 16px;
}

.stat {
  flex: 1;
  min-height: 125px;
  padding: 15px 13px;
  border-radius: 25px;
  border: 1.5px solid #d4cef7;
  background: linear-gradient(135deg, #f9f7ff, #ffffff);
  text-align: center;
  box-shadow: 0 9px 22px rgba(76,64,145,.06);
}

.stat-icon {
  font-size: 34px;
  line-height: 1;
  margin-bottom: 8px;
}

.stat-label {
  color: #7a728e;
  font-size: 17px;
  margin-bottom: 4px;
}

.stat-value {
  color: #3c326d;
  font-size: 21px;
  font-weight: 700;
  line-height: 1.35;
}

.events-panel {
  margin-top: 16px;
  padding: 21px 28px;
  border-radius: 29px;
  border: 1.5px solid #f3c36b;
  background: linear-gradient(135deg, #fff8ea, #fffdf8);
  box-shadow: 0 10px 25px rgba(217,141,23,.07);
  direction: rtl;
  text-align: right;
}

.events-heading {
  display: block;
  margin-bottom: 13px;
  color: #d47700;
  font-size: 29px;
  font-weight: 700;
  text-align: right;
}

.event-row {
  display: flex;
  flex-direction: row-reverse;
  align-items: flex-start;
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px solid #f3e6cb;
  color: #3b4e5c;
  font-size: 21px;
  line-height: 1.55;
  text-align: right;
}

.event-row:last-child {
  border-bottom: none;
}

.event-icon {
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #f4a321;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
}

.event-text {
  flex: 1;
  text-align: right;
}

.quote-panel {
  margin-top: 16px;
  padding: 23px 30px;
  position: relative;
  overflow: hidden;
  border-radius: 29px;
  border: 1.5px solid #aaa0e9;
  background: linear-gradient(135deg, #f5f2ff, #fcfbff);
  box-shadow: 0 10px 25px rgba(91,77,160,.07);
  direction: rtl;
  text-align: right;
}

.quote-panel::before {
  content: "“";
  position: absolute;
  left: 22px;
  top: -24px;
  color: #8d82d4;
  font-family: Georgia, serif;
  font-size: 110px;
  opacity: .28;
}

.quote-heading {
  margin-bottom: 10px;
  color: #5b4ca0;
  font-size: 29px;
  font-weight: 700;
  text-align: right;
}

.quote {
  position: relative;
  z-index: 2;
  color: #273d56;
  font-size: 27px;
  line-height: 1.6;
  font-weight: 700;
  text-align: right;
}

.quote-author {
  margin-top: 8px;
  color: #716a84;
  font-size: 18px;
  text-align: right;
}

.thought-panel {
  margin-top: 16px;
  padding: 22px 30px;
  position: relative;
  overflow: hidden;
  border-radius: 29px;
  border: 1.5px solid #6bd0d0;
  background: linear-gradient(135deg, #eefcfc, #f9ffff);
  box-shadow: 0 10px 25px rgba(28,145,146,.07);
  direction: rtl;
  text-align: right;
}

.thought-heading {
  margin-bottom: 9px;
  color: #087d80;
  font-size: 29px;
  font-weight: 700;
  text-align: right;
}

.thought {
  color: #163f57;
  font-size: 27px;
  line-height: 1.6;
  font-weight: 700;
  text-align: right;
}

.thought::after {
  content: "✦";
  display: block;
  margin-top: 6px;
  color: #24a99d;
  font-size: 25px;
  text-align: center;
}

.footer {
  margin-top: auto;
  padding-top: 14px;
  color: #315f7b;
  font-size: 21px;
  font-weight: 700;
  text-align: center;
}

.footer-line {
  width: 150px;
  height: 3px;
  margin: 0 auto 10px;
  border-radius: 5px;
  background: linear-gradient(90deg, #e8a32b, #1b7197);
}
</style>
</head>

<body>
<div class="page">

  <section class="hero">
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

    <div class="date-grid">

      <div class="date-chip">
        <div class="date-chip-label">میلادی</div>
        <div class="date-chip-value">
          ${escapeHtml(data.gregorianDate)}
        </div>
      </div>

      <div class="date-chip">
        <div class="date-chip-label">قمری</div>
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
        ${escapeHtml(data.remaining)} روز باقی‌مانده
      </span>

      <span>
        حدود ${escapeHtml(data.weeksRemaining)} هفته
      </span>
    </div>

  </section>

  <section class="stats">

    <div class="stat">
      <div class="stat-icon">🌙</div>
      <div class="stat-label">وضعیت ماه</div>
      <div class="stat-value">
        ${escapeHtml(data.moon)}
      </div>
    </div>

    <div class="stat">
      <div class="stat-icon">♎</div>
      <div class="stat-label">برج</div>
      <div class="stat-value">
        ${escapeHtml(data.zodiac)}
      </div>
    </div>

    <div class="stat">
      <div class="stat-icon">🐎</div>
      <div class="stat-label">نماد سال</div>
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
      — ${escapeHtml(data.author)} · ${escapeHtml(data.source)}
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
  data: Parameters<typeof createInfographicHtml>[0]
) {
  if (!env.BROWSER) {
    throw new Error(
      "اتصال BROWSER در Cloudflare تنظیم نشده است."
    );
  }

  const html = createInfographicHtml(data);

  const response = await env.BROWSER.quickAction(
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
    const errorText = await response.text().catch(() => "");

    throw new Error(
      `خطا در تولید تصویر توسط Browser Run: ${response.status} ${errorText}`
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}

async function sendPhotoToBale(
  token: string,
  chatId: string,
  png: Uint8Array,
  caption: string
) {
  const form = new FormData();

  form.append("chat_id", chatId);
  form.append("caption", caption);

  form.append(
    "photo",
    new Blob([new Uint8Array(png)], {
      type: "image/png",
    }),
    "calendar.png"
  );

  const response = await fetch(
    `https://tapi.bale.ai/bot${token}/sendPhoto`,
    {
      method: "POST",
      body: form,
    }
  );

  const result = await response.json().catch(() => ({}));

  return {
    response,
    result,
  };
}

/*
 * وضعیت ارسال تقویم از تنظیمات Supabase خوانده می‌شود.
 * اگر تنظیمات در دسترس نباشد، رفتار پیش‌فرض فعال بودن است.
 */
async function isCalendarEnabled(env: CloudflareEnv) {
  try {
    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      return true;
    }

    const response = await fetch(
      `${url}/rest/v1/settings?select=key,value&key=eq.schedule_calendar&limit=1`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      }
    );

    if (!response.ok) {
      return true;
    }

    const rows = await response.json();

    if (!Array.isArray(rows) || rows.length === 0) {
      return true;
    }

    return rows[0]?.value !== "false";
  } catch {
    return true;
  }
}

export async function GET() {
  try {
    const { env } = await getCloudflareContext({
      async: true,
    });

    const enabled = await isCalendarEnabled(env);

    if (!enabled) {
      return NextResponse.json({
        ok: true,
        cancelled: true,
        sent: false,
        message: "ارسال تقویم لغو شده است.",
      });
    }

    const token = env?.BALE_SMART_TOKEN;
    const chatId = String(env?.BALE_GROUP_ID || "");

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

    const tehran = getTehranParts();
    const persian = getPersianDate(now);

    const gregorian =
      `${tehran.year}-` +
      `${String(tehran.month).padStart(2, "0")}-` +
      `${String(tehran.day).padStart(2, "0")}`;

    const weekday = getWeekday(now);

    const hijri = await getHijriDate(
      `${String(tehran.day).padStart(2, "0")}-` +
      `${String(tehran.month).padStart(2, "0")}-` +
      `${tehran.year}`
    );

    const allEvents = await getEvents(persian.year);

    const todayEvents = getEventsForDay(
      allEvents,
      persian.month,
      persian.day
    );

    const progress = getYearProgress(
      persian.month,
      persian.day,
      persian.year
    );

    const content = getDailyContent(progress.dayOfYear);

    const hijriText = hijri
      ? `${hijri.day} ${hijri.month} ${hijri.year}`
      : "نامشخص";

    const time =
      `${tehran.hour}:` +
      `${tehran.minute}:` +
      `${tehran.second}`;

    const infographic = await createInfographic(
      env,
      {
        weekday,

        persianDate:
          `${fa(persian.year)}/` +
          `${fa(String(persian.month).padStart(2, "0"))}/` +
          `${fa(String(persian.day).padStart(2, "0"))}`,

        hijriDate: hijriText,
        gregorianDate: gregorian,

        time,

        progress: progress.percent,

        remaining: fa(progress.remaining),

        weeksRemaining: fa(
          progress.weeksRemaining
        ),

        moon: getMoonPhase(now),

        zodiac: getPersianZodiac(
          persian.month
        ),

        animal: getAnimal(
          persian.year
        ),

        events: getEventText(
          todayEvents
        ),

        thought: content.thought,

        quote: content.quote,

        author: content.author,

        source: content.source,
      }
    );

    const sent = await sendPhotoToBale(
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

      sent: sent.response.ok,

      bale_status:
        sent.response.status,

      bale: sent.result,
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

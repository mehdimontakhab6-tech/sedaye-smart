import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const TEHRAN_TZ = "Asia/Tehran";
const WIDTH = 1024;
const HEIGHT = 1500;

type CalendarContent = {
  quote: string;
  thought: string;
};

const DAILY_CONTENT: CalendarContent[] = [
  {
    quote: "موفقیت نتیجه تلاش‌های کوچک و پیوسته است.",
    thought: "هر روز فرصت تازه‌ای برای بهتر شدن داریم.",
  },
  {
    quote: "آینده متعلق به کسانی است که امروز برای آن تلاش می‌کنند.",
    thought: "قدم‌های کوچک امروز، مسیر بزرگ فردا را می‌سازند.",
  },
  {
    quote: "هیچ موفقیتی بدون پشتکار به دست نمی‌آید.",
    thought: "اگر آرام اما پیوسته حرکت کنی، به مقصد می‌رسی.",
  },
  {
    quote: "دانایی آغاز توانایی است.",
    thought: "یادگیری را متوقف نکن؛ هر روز چیزی تازه بیاموز.",
  },
  {
    quote: "بهترین راه پیش‌بینی آینده، ساختن آن است.",
    thought: "آینده از تصمیم‌های امروز ما شکل می‌گیرد.",
  },
  {
    quote: "امید، نیرویی است که انسان را به حرکت وامی‌دارد.",
    thought: "حتی یک قدم کوچک هم می‌تواند آغاز یک تغییر بزرگ باشد.",
  },
  {
    quote: "کار نیک اگر با نیت درست انجام شود، اثر ماندگار دارد.",
    thought: "امروز برای بهتر شدن حال یک نفر کاری انجام بده.",
  },
  {
    quote: "صبر، همراه همیشگی موفقیت‌های بزرگ است.",
    thought: "برای رسیدن به نتیجه خوب، به مسیر فرصت بده.",
  },
  {
    quote: "انسان با انتخاب‌هایش آینده خود را می‌سازد.",
    thought: "هر انتخاب امروز، بخشی از داستان فردای توست.",
  },
  {
    quote: "تلاش مداوم، فاصله میان آرزو و واقعیت را کم می‌کند.",
    thought: "آرزوها زمانی زیبا می‌شوند که برایشان قدم برداریم.",
  },
];

function normalizePersian(value: string): string {
  return String(value ?? "")
    .replace(/ي/g, "ی")
    .replace(/ى/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toPersianDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getTehranDate(): Date {
  return new Date();
}

function getPersianDate(date: Date) {
  const formatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: TEHRAN_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  const parts = formatter.formatToParts(date);

  const year = Number(parts.find((p) => p.type === "year")?.value ?? 0);
  const month = Number(parts.find((p) => p.type === "month")?.value ?? 0);
  const day = Number(parts.find((p) => p.type === "day")?.value ?? 0);

  return {
    year,
    month,
    day,
  };
}

function getWeekday(date: Date): string {
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: TEHRAN_TZ,
    weekday: "long",
  }).format(date);
}

function getGregorianDate(date: Date): string {
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: TEHRAN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getTime(date: Date): string {
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: TEHRAN_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getMonthName(month: number): string {
  const names = [
    "",
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
    "اسفند",
  ];

  return names[month] ?? "";
}

function getPersianDateText(
  persianYear: number,
  persianMonth: number,
  persianDay: number,
): string {
  return `${toPersianDigits(persianDay)} ${getMonthName(
    persianMonth,
  )} ${toPersianDigits(persianYear)}`;
}

function getDayOfYear(
  persianMonth: number,
  persianDay: number,
): number {
  const monthLengths = [
    31,
    31,
    31,
    31,
    31,
    31,
    30,
    30,
    30,
    30,
    30,
    29,
  ];

  let total = 0;

  for (let i = 0; i < persianMonth - 1; i++) {
    total += monthLengths[i];
  }

  return total + persianDay;
}

function getYearDays(persianYear: number): number {
  // با مقایسه اول فروردین سال جاری و سال بعد،
  // تعداد روزهای سال مشخص می‌شود.
  try {
    const current = new Date(
      Date.UTC(persianYear + 621, 2, 20),
    );

    const next = new Date(
      Date.UTC(persianYear + 622, 2, 20),
    );

    const days = Math.round(
      (next.getTime() - current.getTime()) / 86400000,
    );

    return days === 366 ? 366 : 365;
  } catch {
    return 365;
  }
}

function getProgress(
  persianYear: number,
  dayOfYear: number,
) {
  const totalDays = getYearDays(persianYear);

  const percent = Math.min(
    100,
    Math.max(
      0,
      Math.round((dayOfYear / totalDays) * 100),
    ),
  );

  return {
    totalDays,
    dayOfYear,
    remainingDays: Math.max(0, totalDays - dayOfYear),
    percent,
  };
}

function getAnimalYear(year: number): string {
  const animals = [
    "موش",
    "گاو",
    "پلنگ",
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

  const index = ((year - 1399) % 12 + 12) % 12;
  return animals[index];
}

function getZodiac(month: number, day: number): string {
  if ((month === 1 && day >= 1) || (month === 2 && day <= 19)) {
    return "حمل ♈";
  }

  if ((month === 2 && day >= 20) || (month === 3 && day <= 20)) {
    return "ثور ♉";
  }

  if ((month === 3 && day >= 21) || (month === 4 && day <= 20)) {
    return "جوزا ♊";
  }

  if ((month === 4 && day >= 21) || (month === 5 && day <= 20)) {
    return "سرطان ♋";
  }

  if ((month === 5 && day >= 21) || (month === 6 && day <= 21)) {
    return "اسد ♌";
  }

  if ((month === 6 && day >= 22) || (month === 7 && day <= 22)) {
    return "سنبله ♍";
  }

  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) {
    return "میزان ♎";
  }

  if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) {
    return "عقرب ♏";
  }

  if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) {
    return "قوس ♐";
  }

  if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) {
    return "جدی ♑";
  }

  if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) {
    return "دلو ♒";
  }

  return "حوت ♓";
}

async function getHijriDate(date: Date) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: TEHRAN_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const parts = formatter.formatToParts(date);

    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;

    if (!year || !month || !day) {
      return null;
    }

    const url =
      `https://api.aladhan.com/v1/gToH?date=${day}-${month}-${year}`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

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
      month: hijri.month?.ar ?? hijri.month?.en ?? "",
      year: hijri.year,
    };
  } catch {
    return null;
  }
}

async function getEvents(
  persianYear: number,
  persianMonth: number,
  persianDay: number,
): Promise<string[]> {
  try {
    const url =
      `https://hmarzban.github.io/pipe2time.ir/api/${persianYear}/events.json`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();

    const candidates: any[] = [];

    if (Array.isArray(data)) {
      candidates.push(...data);
    } else if (data && typeof data === "object") {
      const yearData = data[String(persianYear)];

      if (Array.isArray(yearData)) {
        candidates.push(...yearData);
      } else if (yearData && typeof yearData === "object") {
        for (const value of Object.values(yearData)) {
          if (Array.isArray(value)) {
            candidates.push(...value);
          }
        }
      }

      for (const value of Object.values(data)) {
        if (Array.isArray(value)) {
          candidates.push(...value);
        }
      }
    }

    const targetMonth = String(persianMonth);
    const targetDay = String(persianDay);

    const result: string[] = [];

    for (const item of candidates) {
      if (!item) continue;

      const rawDate = String(
        item.date ??
          item.shamsi ??
          item.persianDate ??
          item.day ??
          "",
      );

      const normalized = normalizePersian(rawDate)
        .replace(/[۰-۹]/g, (d) =>
          String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)),
        );

      const match = normalized.match(
        /(\d{1,4})\D+(\d{1,2})\D+(\d{1,2})/,
      );

      let matched = false;

      if (match) {
        const m = Number(match[2]);
        const d = Number(match[3]);

        matched = m === persianMonth && d === persianDay;
      } else {
        const shortMatch = normalized.match(
          /(\d{1,2})\D+(\d{1,2})/,
        );

        if (shortMatch) {
          const m = Number(shortMatch[1]);
          const d = Number(shortMatch[2]);

          matched = m === persianMonth && d === persianDay;
        }
      }

      if (!matched) continue;

      const title =
        item.title ??
        item.name ??
        item.event ??
        item.description;

      if (title) {
        const clean = normalizePersian(String(title));

        if (
          clean &&
          !result.includes(clean)
        ) {
          result.push(clean);
        }
      }
    }

    return result.slice(0, 6);
  } catch {
    return [];
  }
}

function getMoonPhase(dayOfMonth: number): string {
  const cycle = 29.530588;

  const knownNewMoon = Date.UTC(2024, 0, 11);
  const today = Date.now();

  const days =
    (today - knownNewMoon) / 86400000;

  const phase =
    ((days % cycle) + cycle) % cycle;

  if (phase < 1.8) {
    return "ماه نو 🌑";
  }

  if (phase < 7.4) {
    return "هلال افزاینده 🌒";
  }

  if (phase < 8.8) {
    return "تربیع اول 🌓";
  }

  if (phase < 14.8) {
    return "ماه افزاینده 🌔";
  }

  if (phase < 16.8) {
    return "ماه کامل 🌕";
  }

  if (phase < 22.1) {
    return "ماه کاهنده 🌖";
  }

  if (phase < 23.7) {
    return "تربیع آخر 🌗";
  }

  return "هلال کاهنده 🌘";
}

function getDailyContent(dayOfYear: number): CalendarContent {
  const index =
    ((dayOfYear - 1) % DAILY_CONTENT.length +
      DAILY_CONTENT.length) %
    DAILY_CONTENT.length;

  return DAILY_CONTENT[index];
}

function buildHtml(params: {
  date: Date;
  persianYear: number;
  persianMonth: number;
  persianDay: number;
  hijri: any;
  events: string[];
  content: CalendarContent;
  progress: ReturnType<typeof getProgress>;
}) {
  const {
    date,
    persianYear,
    persianMonth,
    persianDay,
    hijri,
    events,
    content,
    progress,
  } = params;

  const persianDate = getPersianDateText(
    persianYear,
    persianMonth,
    persianDay,
  );

  const weekday = getWeekday(date);
  const gregorianDate = getGregorianDate(date);
  const time = getTime(date);

  const animal = getAnimalYear(persianYear);
  const zodiac = getZodiac(
    persianMonth,
    persianDay,
  );

  const moon = getMoonPhase(persianDay);

  const hijriText = hijri
    ? `${toPersianDigits(hijri.day)} ${hijri.month} ${toPersianDigits(hijri.year)}`
    : "—";

  const eventHtml =
    events.length > 0
      ? events
          .map(
            (event) =>
              `<div class="event-item">
                 <span class="event-dot">●</span>
                 <span>${escapeHtml(event)}</span>
               </div>`,
          )
          .join("")
      : `<div class="event-item">
           <span class="event-dot">●</span>
           <span>مناسبت ویژه‌ای برای امروز ثبت نشده است.</span>
         </div>`;

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1024">
<title>تقویم روزانه گروه صدای کارکنان ثبت احوال</title>

<style>

@font-face {
  font-family: "Vazirmatn";
  src: url("https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/Vazirmatn-font-face.css");
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
  direction: rtl;
  font-family: Vazirmatn, Arial, sans-serif;
  background: #f3f5f7;
}

body {
  overflow: hidden;
}

.canvas {
  width: ${WIDTH}px;
  min-height: ${HEIGHT}px;
  padding: 34px 42px 36px;
  background:
    linear-gradient(
      180deg,
      #edf5fb 0%,
      #ffffff 36%,
      #f7f8fa 100%
    );
  color: #17212b;
}

/* =========================
   عنوان اصلی
   ========================= */

.hero {
  position: relative;
  width: 100%;
  height: 235px;
  border-radius: 30px;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 32px;
  margin-bottom: 22px;

  background:
    radial-gradient(
      circle at 20% 20%,
      rgba(255,255,255,.35),
      transparent 28%
    ),
    linear-gradient(
      135deg,
      #274c77 0%,
      #4f86a8 48%,
      #8ab6c9 100%
    );

  box-shadow:
    0 12px 30px rgba(31, 55, 73, .16);
}

.hero::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      180deg,
      rgba(255,255,255,.10),
      rgba(0,0,0,.18)
    );
}

.hero-title {
  position: relative;
  z-index: 2;
  width: 100%;
  text-align: center;
  color: #fff;
  font-size: 34px;
  line-height: 1.5;
  font-weight: 900;
  text-shadow:
    0 3px 12px rgba(0,0,0,.28);
}

/* =========================
   تاریخ
   ========================= */

.date-panel {
  background: #ffffff;
  border-radius: 26px;
  padding: 25px 30px;
  margin-bottom: 20px;
  box-shadow: 0 7px 22px rgba(31, 55, 73, .08);
}

.date-main {
  font-size: 38px;
  font-weight: 900;
  text-align: center;
  color: #1f4562;
  margin-bottom: 7px;
}

.weekday {
  text-align: center;
  font-size: 22px;
  font-weight: 700;
  color: #61707c;
  margin-bottom: 18px;
}

.meta-row {
  display: flex;
  gap: 14px;
  justify-content: center;
}

.meta-chip {
  flex: 1;
  background: #f3f7fa;
  border-radius: 17px;
  padding: 13px 16px;
  text-align: center;
  color: #334b5d;
  font-size: 18px;
  font-weight: 700;
}

/* =========================
   پیشرفت سال
   ========================= */

.progress-panel {
  background: #ffffff;
  border-radius: 26px;
  padding: 23px 28px;
  margin-bottom: 20px;
  box-shadow: 0 7px 22px rgba(31, 55, 73, .08);
}

.panel-title {
  font-size: 23px;
  font-weight: 900;
  color: #23445b;
  margin-bottom: 15px;
  text-align: right;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 17px;
  color: #61707c;
  margin-bottom: 9px;
}

.progress-bar {
  width: 100%;
  height: 18px;
  border-radius: 20px;
  background: #e8edf1;
  overflow: hidden;
}

.progress-fill {
  width: ${progress.percent}%;
  height: 100%;
  border-radius: 20px;
  background: linear-gradient(
    90deg,
    #3c7fa6,
    #68a9bf
  );
}

/* =========================
   سه کارت آماری
   ========================= */

.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.stat-card {
  background: #ffffff;
  border-radius: 24px;
  padding: 20px 14px;
  min-height: 115px;
  box-shadow: 0 7px 22px rgba(31, 55, 73, .08);
  text-align: center;
}

.stat-icon {
  font-size: 28px;
  margin-bottom: 5px;
}

.stat-label {
  font-size: 16px;
  color: #77838d;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 19px;
  font-weight: 900;
  color: #274d67;
}

/* =========================
   بخش‌های راست‌چین
   ========================= */

.content-panel {
  background: #ffffff;
  border-radius: 26px;
  padding: 24px 28px;
  margin-bottom: 20px;
  box-shadow: 0 7px 22px rgba(31, 55, 73, .08);

  direction: rtl;
  text-align: right;
}

.content-title {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 9px;

  direction: rtl;
  text-align: right;

  font-size: 24px;
  font-weight: 900;
  color: #23445b;

  margin-bottom: 15px;
}

.event-item {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 10px;

  direction: rtl;
  text-align: right;

  font-size: 18px;
  line-height: 1.8;
  color: #43525e;

  margin-bottom: 8px;
}

.event-dot {
  color: #4b91ae;
  font-size: 13px;
  margin-top: 6px;
}

.quote-text,
.thought-text {
  direction: rtl;
  text-align: right;
  font-size: 20px;
  line-height: 2;
  color: #344854;
  font-weight: 600;
}

.quote-text::before {
  content: "«";
  font-size: 32px;
  font-weight: 900;
  color: #72a8bc;
  margin-left: 5px;
}

.quote-text::after {
  content: "»";
  font-size: 32px;
  font-weight: 900;
  color: #72a8bc;
  margin-right: 5px;
}

/* =========================
   پایین تصویر
   هیچ عنوان یا نوشته تکراری ندارد
   ========================= */

.bottom-space {
  height: 12px;
}

</style>
</head>

<body>

<div class="canvas">

  <!-- عنوان اصلی فقط یک بار و فقط در بالا -->
  <section class="hero">
    <div class="hero-title">
      تقویم روزانه گروه صدای کارکنان ثبت احوال
    </div>
  </section>

  <!-- تاریخ -->
  <section class="date-panel">

    <div class="date-main">
      ${escapeHtml(persianDate)}
    </div>

    <div class="weekday">
      ${escapeHtml(weekday)}
    </div>

    <div class="meta-row">

      <div class="meta-chip">
        📅 میلادی
        <br>
        ${escapeHtml(gregorianDate)}
      </div>

      <div class="meta-chip">
        🌙 قمری
        <br>
        ${escapeHtml(hijriText)}
      </div>

      <div class="meta-chip">
        🕐 ساعت
        <br>
        ${escapeHtml(time)}
      </div>

    </div>

  </section>

  <!-- پیشرفت سال -->
  <section class="progress-panel">

    <div class="panel-title">
      📊 چشم‌انداز سال
    </div>

    <div class="progress-info">
      <span>
        روز ${toPersianDigits(progress.dayOfYear)}
        از ${toPersianDigits(progress.totalDays)}
      </span>

      <span>
        ${toPersianDigits(progress.percent)}٪
      </span>
    </div>

    <div class="progress-bar">
      <div class="progress-fill"></div>
    </div>

    <div
      style="
        margin-top:10px;
        text-align:right;
        direction:rtl;
        color:#75818b;
        font-size:16px;
      "
    >
      ${toPersianDigits(progress.remainingDays)}
      روز تا پایان سال باقی مانده است.
    </div>

  </section>

  <!-- مشخصات روز -->
  <section class="stats">

    <div class="stat-card">
      <div class="stat-icon">🌙</div>
      <div class="stat-label">وضعیت ماه</div>
      <div class="stat-value">
        ${escapeHtml(moon)}
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-icon">♈</div>
      <div class="stat-label">برج</div>
      <div class="stat-value">
        ${escapeHtml(zodiac)}
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-icon">🐾</div>
      <div class="stat-label">سال حیوانی</div>
      <div class="stat-value">
        ${escapeHtml(animal)}
      </div>
    </div>

  </section>

  <!-- رویدادها و مناسبت‌ها -->
  <section class="content-panel">

    <div class="content-title">
      📌 رویدادها و مناسبت‌ها
    </div>

    ${eventHtml}

  </section>

  <!-- سخن بزرگان -->
  <section class="content-panel">

    <div class="content-title">
      💬 سخن بزرگان
    </div>

    <div class="quote-text">
      ${escapeHtml(content.quote)}
    </div>

  </section>

  <!-- جرعه‌ای تفکر -->
  <section class="content-panel">

    <div class="content-title">
      💭 جرعه‌ای تفکر
    </div>

    <div class="thought-text">
      ${escapeHtml(content.thought)}
    </div>

  </section>

  <!--
    عمداً هیچ عنوان، کپشن یا عبارت تکراری
    در پایین تصویر قرار داده نشده است.
  -->

  <div class="bottom-space"></div>

</div>

</body>
</html>`;
}

export async function GET() {
  try {
    const date = getTehranDate();

    const {
      year: persianYear,
      month: persianMonth,
      day: persianDay,
    } = getPersianDate(date);

    const dayOfYear = getDayOfYear(
      persianMonth,
      persianDay,
    );

    const progress = getProgress(
      persianYear,
      dayOfYear,
    );

    const content = getDailyContent(dayOfYear);

    const [hijri, events] = await Promise.all([
      getHijriDate(date),
      getEvents(
        persianYear,
        persianMonth,
        persianDay,
      ),
    ]);

    const html = buildHtml({
      date,
      persianYear,
      persianMonth,
      persianDay,
      hijri,
      events,
      content,
      progress,
    });

    const { env } =
      await getCloudflareContext({
        async: true,
      });

    if (!env?.BROWSER) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Cloudflare Browser binding (BROWSER) is not configured.",
        },
        { status: 500 },
      );
    }

    const result = await env.BROWSER.quickAction(
      "screenshot",
      {
        html,
        options: {
          type: "png",
          fullPage: true,
          omitBackground: false,
        },
      },
    );

    if (!result) {
      return NextResponse.json(
        {
          ok: false,
          error: "Screenshot generation failed.",
        },
        { status: 500 },
      );
    }

    const imageBuffer =
      result instanceof ArrayBuffer
        ? result
        : result?.body instanceof ArrayBuffer
          ? result.body
          : await new Response(result).arrayBuffer();

    const token =
      env.BALE_SMART_TOKEN;

    const groupId =
      env.BALE_GROUP_ID;

    if (!token || !groupId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "BALE_SMART_TOKEN or BALE_GROUP_ID is missing.",
        },
        { status: 500 },
      );
    }

    const form = new FormData();

    form.append(
      "chat_id",
      String(groupId),
    );

    form.append(
      "caption",
      "تقویم روزانه گروه صدای کارکنان ثبت احوال",
    );

    const blob = new Blob(
      [imageBuffer],
      {
        type: "image/png",
      },
    );

    form.append(
      "photo",
      blob,
      "calendar-daily.png",
    );

    const baleResponse = await fetch(
      `https://tapi.bale.ai/bot${token}/sendPhoto`,
      {
        method: "POST",
        body: form,
      },
    );

    const baleText =
      await baleResponse.text();

    let baleData: any;

    try {
      baleData =
        JSON.parse(baleText);
    } catch {
      baleData = {
        raw: baleText,
      };
    }

    return NextResponse.json({
      ok: true,
      sent: baleResponse.ok && baleData?.ok !== false,
      bale_status: baleResponse.status,
      bale: baleData,
      date: {
        solar: `${persianYear}/${persianMonth}/${persianDay}`,
        weekday,
      },
      design: {
        title_position: "top-only",
        duplicate_bottom_title: false,
        right_aligned_sections: true,
      },
    });
  } catch (error: any) {
    console.error(
      "Daily calendar error:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ??
          String(error),
      },
      { status: 500 },
    );
  }
}

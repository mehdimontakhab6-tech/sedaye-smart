import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { DAILY_CONTENT } from "./daily-content";

const TIME_ZONE = "Asia/Tehran";
const WIDTH = 1024;
const HEIGHT = 1500;

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

  const index =
    ((year - 1399) % 12 + 12) % 12;

  return animals[index];
}

function getAnimalEmoji(animal: string) {
  const emojis: Record<string, string> = {
    موش: "🐀",
    گاو: "🐂",
    ببر: "🐅",
    خرگوش: "🐇",
    اژدها: "🐉",
    مار: "🐍",
    اسب: "🐎",
    بز: "🐐",
    میمون: "🐒",
    خروس: "🐓",
    سگ: "🐕",
    خوک: "🐖",
  };

  return emojis[animal] || "✨";
}

function getSeason(month: number) {
  if (month <= 3) return "spring";
  if (month <= 6) return "summer";
  if (month <= 9) return "autumn";
  return "winter";
}

function getSeasonData(month: number) {
  const season = getSeason(month);

  if (season === "spring") {
    return {
      sky1: "#79ccef",
      sky2: "#e5f8ff",
      sun: "#ffd95a",
      mountain: "#789d78",
      mountainDark: "#4b7557",
      forest: "#347652",
      ground: "#86bd73",
    };
  }

  if (season === "summer") {
    return {
      sky1: "#39abe8",
      sky2: "#ddf7ff",
      sun: "#ffd747",
      mountain: "#648d70",
      mountainDark: "#3d684e",
      forest: "#266a47",
      ground: "#5c9a55",
    };
  }

  if (season === "autumn") {
    return {
      sky1: "#82bdd4",
      sky2: "#fae7c6",
      sun: "#f6bd45",
      mountain: "#84725a",
      mountainDark: "#5e594b",
      forest: "#a76535",
      ground: "#a77943",
    };
  }

  return {
    sky1: "#7bb7d9",
    sky2: "#edf7fc",
    sun: "#f8d66e",
    mountain: "#8499a6",
    mountainDark: "#607581",
    forest: "#45695f",
    ground: "#e7f1f5",
  };
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
    const [day, month, year] =
      gregorian.split("-").map(Number);

    const previousDate = new Date(
      Date.UTC(year, month - 1, day)
    );

    previousDate.setUTCDate(
      previousDate.getUTCDate() - 1
    );

    const previousDay =
      String(
        previousDate.getUTCDate()
      ).padStart(2, "0");

    const previousMonth =
      String(
        previousDate.getUTCMonth() + 1
      ).padStart(2, "0");

    const previousYear =
      previousDate.getUTCFullYear();

    const previousGregorian =
      `${previousDay}-${previousMonth}-${previousYear}`;

    const response = await fetch(
      `https://api.aladhan.com/v1/gToH?date=${previousGregorian}`,
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

/* =====================================
   حذف تاریخ ابتدای متن مناسبت
   مثال:
   ۱۴ مهر روز دامپزشکی
   →
   روز دامپزشکی
   ===================================== */

function cleanEventText(value: string) {
  return String(value)
    .replace(
      /^\s*[۰-۹0-9]{1,2}\s+(?:فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند)\s*/,
      ""
    )
    .replace(
      /^\s*[۰-۹0-9]{1,2}\s*[\/\-]\s*[۰-۹0-9]{1,2}\s*/,
      ""
    )
    .trim();
}

function getInternationalEvents(
  month: number,
  day: number
) {
  const fixed: Record<string, string[]> = {
    "1-1": [
      "روز جهانی صلح",
      "روز جهانی خانواده",
    ],
    "2-4": [
      "روز جهانی سرطان",
    ],
    "2-6": [
      "روز جهانی مبارزه با ناقص‌سازی زنان",
    ],
    "2-11": [
      "روز جهانی زنان و دختران در علم",
    ],
    "2-13": [
      "روز جهانی رادیو",
    ],
    "2-20": [
      "روز جهانی عدالت اجتماعی",
    ],
    "3-3": [
      "روز جهانی حیات وحش",
    ],
    "3-8": [
      "روز جهانی زن",
    ],
    "3-20": [
      "روز جهانی شادی",
    ],
    "3-21": [
      "روز جهانی شعر",
      "روز جهانی جنگل‌ها",
    ],
    "3-22": [
      "روز جهانی آب",
    ],
    "3-23": [
      "روز جهانی هواشناسی",
    ],
    "3-24": [
      "روز جهانی مبارزه با سل",
    ],
    "4-2": [
      "روز جهانی آگاهی از اوتیسم",
    ],
    "4-7": [
      "روز جهانی بهداشت",
    ],
    "4-22": [
      "روز زمین",
    ],
    "5-3": [
      "روز جهانی آزادی مطبوعات",
    ],
    "5-15": [
      "روز جهانی خانواده",
    ],
    "5-17": [
      "روز جهانی ارتباطات و جامعه اطلاعاتی",
    ],
    "6-5": [
      "روز جهانی محیط زیست",
    ],
    "6-8": [
      "روز جهانی اقیانوس‌ها",
    ],
    "6-12": [
      "روز جهانی مبارزه با کار کودکان",
    ],
    "6-14": [
      "روز جهانی اهدای خون",
    ],
    "7-30": [
      "روز جهانی مبارزه با قاچاق انسان",
    ],
    "8-9": [
      "روز جهانی مردمان بومی",
    ],
    "8-12": [
      "روز جهانی جوانان",
    ],
    "9-8": [
      "روز جهانی سوادآموزی",
    ],
    "9-16": [
      "روز جهانی حفاظت از لایه اوزون",
    ],
    "9-21": [
      "روز جهانی صلح",
    ],
    "9-27": [
      "روز جهانی گردشگری",
    ],
    "10-1": [
      "روز جهانی سالمندان",
      "روز جهانی قهوه",
    ],
    "10-4": [
      "روز جهانی حیوانات",
    ],
    "10-5": [
      "روز جهانی معلم",
    ],
    "10-6": [
      "روز جهانی فلج مغزی",
    ],
    "10-10": [
      "روز جهانی بهداشت روان",
    ],
    "10-16": [
      "روز جهانی غذا",
    ],
    "10-24": [
      "روز سازمان ملل متحد",
    ],
    "11-10": [
      "روز جهانی علم در خدمت صلح و توسعه",
    ],
    "11-14": [
      "روز جهانی دیابت",
    ],
    "11-19": [
      "روز جهانی مردان",
    ],
    "12-1": [
      "روز جهانی ایدز",
    ],
    "12-3": [
      "روز جهانی افراد دارای معلولیت",
    ],
    "12-5": [
      "روز جهانی داوطلب",
    ],
    "12-10": [
      "روز جهانی حقوق بشر",
    ],
    "12-18": [
      "روز جهانی مهاجران",
    ],
  };

  return fixed[`${month}-${day}`] || [];
}

function getDailyContent(dayOfYear: number) {
  const item =
    DAILY_CONTENT[
      (dayOfYear - 1) % DAILY_CONTENT.length
    ] as any;

  if (Array.isArray(item)) {
    return {
      author: item[0],
      quote: item[1],
      source: item[2],
      thought: item[3],
    };
  }

  return item;
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
  animalEmoji: string;
  events: string[];
  internationalEvents: string[];
  thought: string;
  quote: string;
  author: string;
  source: string;
  season: {
    sky1: string;
    sky2: string;
    sun: string;
    mountain: string;
    mountainDark: string;
    forest: string;
    ground: string;
  };
}) {
  const progressValue = Math.min(
    100,
    Math.max(0, Number(data.progress))
  );

  const season = data.season;

  const internalEvents = data.events
    .map((x) => cleanEventText(x))
    .filter(Boolean);

  const internationalEvents =
    data.internationalEvents.filter(Boolean);

  const internalEventsHtml = internalEvents.length
    ? internalEvents
        .slice(0, 4)
        .map(
          (event) => `
            <div class="event-item">
              <span class="event-dot">
                ✦
              </span>

              <span class="event-text">
                ${escapeHtml(event)}
              </span>
            </div>
          `
        )
        .join("")
    : `
      <div class="event-item">
        <span class="event-dot">✦</span>
        <span class="event-text">
          مناسبتی برای امروز ثبت نشده است.
        </span>
      </div>
    `;

  const internationalEventsHtml =
    internationalEvents.length
      ? internationalEvents
          .slice(0, 4)
          .map(
            (event) => `
              <div class="event-item">
                <span class="event-dot">
                  🌍
                </span>

                <span class="event-text">
                  ${escapeHtml(event)}
                </span>
              </div>
            `
          )
          .join("")
      : `
        <div class="event-item">
          <span class="event-dot">🌍</span>
          <span class="event-text">
            مناسبت بین‌المللی برای امروز ثبت نشده است.
          </span>
        </div>
      `;

  return `
<!doctype html>

<html lang="fa" dir="rtl">

<head>

<meta charset="utf-8">

<style>

@font-face {
  font-family: "B Nazanin";
  src:
    url("https://raw.githubusercontent.com/artbijan/Web-Font/master/BNazaninBold.woff2")
    format("woff2");
  font-weight: 900;
  font-style: normal;
  font-display: block;
}

@font-face {
  font-family: "B Titr Bold";
  src:
    url("https://raw.githubusercontent.com/artbijan/Web-Font/master/BTitrBold.woff2")
    format("woff2");
  font-weight: 900;
  font-style: normal;
  font-display: block;
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
    "B Nazanin",
    Tahoma,
    Arial,
    sans-serif;

  color: #10252d;

  background: #315c45;
}

.page {
  position: relative;

  width: ${WIDTH}px;
  height: ${HEIGHT}px;

  overflow: hidden;

  padding: 22px 28px 20px;
}

/* =====================================
   تصویر اصلی جنگل سبز
   ===================================== */

.nature {
  position: absolute;

  inset: 0;

  z-index: 0;

  background-image:
    linear-gradient(
      180deg,
      rgba(7, 42, 30, .20) 0%,
      rgba(7, 42, 30, .08) 35%,
      rgba(7, 42, 30, .18) 70%,
      rgba(4, 32, 22, .34) 100%
    ),
    url("https://images.unsplash.com/photo-1629140476741-04d07ddeff60?auto=format&fit=crop&fm=jpg&q=95&w=1800&h=2700");

  background-size: cover, cover;

  background-position: center, center;

  background-repeat: no-repeat, no-repeat;

  filter:
    saturate(1.15)
    brightness(.98)
    contrast(1.04);
}

.nature::after {
  content: "";

  position: absolute;

  inset: 0;

  background:
    linear-gradient(
      180deg,
      rgba(255,255,255,.08),
      rgba(255,255,255,0) 30%,
      rgba(0,30,20,.08) 75%,
      rgba(0,25,17,.18)
    );
}

/* =====================================
   عناصر قدیمی طبیعت عمداً نامرئی هستند
   چون عکس واقعی پس‌زمینه استفاده می‌شود
   ===================================== */

.sun,
.cloud,
.mountains-back,
.mountains-front,
.forest {
  display: none;
}

/* =====================================
   لایه محتوا
   ===================================== */

.content {
  position: relative;

  z-index: 5;

  width: 100%;
  height: 100%;

  display: flex;

  flex-direction: column;

  gap: 9px;
}

/* =====================================
   کادرهای شیشه‌ای
   ===================================== */

.glass {
  background:
    linear-gradient(
      135deg,
      rgba(255,255,255,.91),
      rgba(245,252,248,.79)
    );

  border:
    1px solid
    rgba(255,255,255,.98);

  border-radius: 25px;

  box-shadow:
    0 8px 24px
    rgba(7,35,28,.20),

    inset 0 1px 0
    rgba(255,255,255,1);

  backdrop-filter:
    blur(13px);

  -webkit-backdrop-filter:
    blur(13px);
}

/* =====================================
   رنگ‌بندی کادرها
   ===================================== */

.header {
  background:
    linear-gradient(
      135deg,
      rgba(232,248,239,.96),
      rgba(210,238,222,.88)
    );
}

.date-area {
  background:
    linear-gradient(
      135deg,
      rgba(235,248,255,.96),
      rgba(214,238,247,.88)
    );
}

.year-area {
  background:
    linear-gradient(
      135deg,
      rgba(255,247,222,.96),
      rgba(250,234,191,.88)
    );
}

.stat:nth-child(1) {
  background:
    linear-gradient(
      145deg,
      rgba(237,250,239,.96),
      rgba(211,239,219,.88)
    );
}

.stat:nth-child(2) {
  background:
    linear-gradient(
      145deg,
      rgba(239,244,255,.96),
      rgba(216,228,249,.88)
    );
}

.stat:nth-child(3) {
  background:
    linear-gradient(
      145deg,
      rgba(250,241,255,.96),
      rgba(235,219,247,.88)
    );
}

.events {
  background:
    linear-gradient(
      135deg,
      rgba(255,248,229,.96),
      rgba(249,232,195,.88)
    );
}

.quote {
  background:
    linear-gradient(
      135deg,
      rgba(244,239,255,.96),
      rgba(226,218,247,.88)
    );
}

.thought {
  background:
    linear-gradient(
      135deg,
      rgba(231,249,246,.96),
      rgba(205,237,231,.88)
    );
}

/* =====================================
   عنوان اصلی
   ===================================== */

.header {
  flex: 0 0 155px;

  padding: 12px 18px 10px;

  display: flex;

  flex-direction: column;

  justify-content: center;

  align-items: center;

  text-align: center;

  overflow: hidden;
}

.title {
  width: 100%;

  white-space: nowrap;

  color: #071f17;

  font-size: 54px;

  line-height: 1.15;

  font-weight: 900;

  letter-spacing: -2.5px;

  font-family:
    "vazirmatn",
    Tahoma,
    Arial,
    sans-serif;

  text-shadow:
    0 2px 0 rgba(255,255,255,.95),
    0 3px 5px rgba(0,0,0,.18),
    0 0 1px rgba(7,31,23,.55);
}

.greeting {
  margin-top: 6px;

  color: #275543;

  font-size: 33px;

  line-height: 1.15;

  font-weight: 900;
}

/* =====================================
   تاریخ
   ===================================== */

.date-area {
  flex: 0 0 216px;

  position: relative;

  padding: 14px 24px 15px;

  overflow: hidden;
}

.clock {
  position: absolute;

  left: 24px;
  top: 15px;

  color: #183c30;

  font-size: 33px;

  font-weight: 900;

  direction: rtl;
}

.weekday {
  color: #315b49;

  font-size: 35px;

  line-height: 1.15;

  font-weight: 900;
}

.persian-date {
  margin-top: 3px;

  color: #071e17;

  font-size: 82px;

  line-height: 1.03;

  font-weight: 900;

  letter-spacing: -1px;
}

.date-lines {
  margin-top: 10px;

  display: flex;

  flex-direction: row;

  justify-content: flex-start;

  align-items: center;

  gap: 35px;

  color: #38594e;

  font-size: 28px;

  line-height: 1.3;

  font-weight: 900;
}

/* =====================================
   پیشرفت سال
   ===================================== */

.year-area {
  flex: 0 0 108px;

  padding: 11px 20px 10px;

  overflow: hidden;
}

.year-head {
  display: flex;

  flex-direction: row;

  justify-content: space-between;

  align-items: center;
}

.year-title,
.year-percent {
  color: #183e31;

  font-size: 31px;

  font-weight: 900;
}

.track {
  width: 100%;

  height: 17px;

  margin-top: 6px;

  padding: 2px;

  border-radius: 20px;

  background:
    rgba(255,255,255,.85);

  border:
    1px solid
    rgba(26,71,56,.20);
}

.fill {
  width: ${progressValue}%;

  height: 11px;

  border-radius: 20px;

  background:
    linear-gradient(
      90deg,
      #245b46,
      #4e8b68
    );
}

.year-meta {
  margin-top: 4px;

  display: flex;

  flex-direction: row;

  justify-content: space-between;

  color: #46655a;

  font-size: 25px;

  font-weight: 900;
}

/* =====================================
   سه کارت
   ===================================== */

.stats {
  flex: 0 0 118px;

  display: grid;

  grid-template-columns:
    repeat(3, 1fr);

  gap: 10px;
}

.stat {
  min-width: 0;

  height: 118px;

  padding: 8px 7px;

  display: flex;

  flex-direction: column;

  justify-content: center;

  align-items: center;

  text-align: center;

  border:
    1px solid
    rgba(255,255,255,.98);

  border-radius: 23px;

  box-shadow:
    0 7px 18px
    rgba(20,60,48,.15),

    inset 0 1px 0
    rgba(255,255,255,.95);
}

.stat-icon {
  font-size: 41px;

  line-height: 1;
}

.stat-label {
  margin-top: 3px;

  color: #527064;

  font-size: 24px;

  line-height: 1.15;

  font-weight: 900;
}

.stat-value {
  margin-top: 2px;

  color: #0c2b20;

  font-size: 28px;

  line-height: 1.2;

  font-weight: 900;

  white-space: nowrap;
}

/* =====================================
   مناسبت‌ها
   ===================================== */

.events {
  flex: 0 0 222px;

  height: 222px;

  padding: 13px 17px 11px;

  overflow: hidden;
}

.section-title {
  color: #071f17;

  font-size: 37px;

  line-height: 1.2;

  font-weight: 900;

  text-align: right;

  margin-bottom: 6px;

  font-family:
    "B Titr Bold",
    Tahoma,
    Arial,
    sans-serif;
}

.events-grid {
  width: 100%;

  height: calc(100% - 51px);

  display: grid;

  grid-template-columns:
    1fr 1fr;

  gap: 12px;
}

.event-group {
  min-width: 0;

  height: 100%;

  padding: 8px 10px;

  border-radius: 18px;

  border:
    1px solid
    rgba(255,255,255,.90);

  background:
    rgba(255,255,255,.48);

  overflow: hidden;
}

.event-group-title {
  color: #163d30;

  font-size: 27px;

  line-height: 1.2;

  font-weight: 900;

  text-align: center;

  padding-bottom: 5px;

  margin-bottom: 3px;

  border-bottom:
    2px solid
    rgba(37,92,69,.22);

  font-family:
    "B Titr Bold",
    Tahoma,
    Arial,
    sans-serif;
}

.event-item {
  display: flex;

  flex-direction: row;

  direction: rtl;

  align-items: flex-start;

  gap: 7px;

  padding: 2px 0;

  color: #23463a;

  font-size: 29px;

  line-height: 1.28;

  font-weight: 900;

  text-align: right;
}

.event-dot {
  flex: 0 0 auto;

  font-size: 32px;

  line-height: 1.2;
}

.event-text {
  flex: 1 1 auto;

  min-width: 0;

  text-align: right;
}

.international {
  flex: 0 0 auto;

  margin-right: 4px;

  color: #668077;

  font-size: 20px;

  font-weight: 900;

  white-space: nowrap;
}

/* =====================================
   سخن بزرگان
   ===================================== */

.quote {
  flex: 0 0 222px;

  height: 222px;

  padding: 15px 19px 12px;

  overflow: hidden;
}

.quote-title {
  color: #071f17;

  font-size: 37px;

  line-height: 1.2;

  font-weight: 900;

  margin-bottom: 9px;

  font-family:
    "B Titr Bold",
    Tahoma,
    Arial,
    sans-serif;
}

.quote-text {
  color: #23483b;

  font-size: 33px;

  line-height: 1.45;

  font-weight: 900;
}

.quote-author {
  margin-top: 9px;

  color: #5a736a;

  font-size: 26px;

  line-height: 1.35;

  font-weight: 900;
}

/* =====================================
   جرعه‌ای تفکر
   ===================================== */

.thought {
  flex: 0 0 222px;

  height: 222px;

  padding: 15px 19px 12px;

  overflow: hidden;
}

.thought-title {
  color: #071f17;

  font-size: 37px;

  line-height: 1.2;

  font-weight: 900;

  margin-bottom: 9px;

  font-family:
    "B Titr Bold",
    Tahoma,
    Arial,
    sans-serif;
}

.thought-text {
  color: #23483b;

  font-size: 33px;

  line-height: 1.45;

  font-weight: 900;
}

/* =====================================
   شعار پایین
   ===================================== */

.footer-slogan {
  flex: 1 1 auto;

  min-height: 58px;

  display: flex;

  align-items: center;

  justify-content: center;

  padding: 3px 8px 0;

  color: #ffffff;

  font-size: 45px;

  line-height: 1.2;

  font-weight: 900;

  text-align: center;

  text-shadow:
    0 2px 5px rgba(0,0,0,.65),
    0 0 12px rgba(0,0,0,.35);
}

</style>

</head>

<body>

<div class="page">

  <div class="nature">

    <div class="sun"></div>

    <div class="cloud one"></div>

    <div class="cloud two"></div>

    <div class="mountains-back"></div>

    <div class="mountains-front"></div>

    <div class="forest"></div>

  </div>

  <div class="content">

    <header class="header glass">

      <div class="title">
        تقویم روزانه گروه صدای کارکنان ثبت احوال
      </div>

      <div class="greeting">
        روزت پر از اتفاقات خوب ☀️
      </div>

    </header>

    <section class="date-area glass">

      <div class="clock">
        ⏰ ${escapeHtml(data.time)}
      </div>

      <div class="weekday">
        ${escapeHtml(data.weekday)}
      </div>

      <div class="persian-date">
        ${escapeHtml(data.persianDate)}
      </div>

      <div class="date-lines">

        <span>
          📅 میلادی:
          ${escapeHtml(data.gregorianDate)}
        </span>

        <span>
          🌙 قمری:
          ${escapeHtml(data.hijriDate)}
        </span>

      </div>

    </section>

    <section class="year-area glass">

      <div class="year-head">

        <div class="year-title">
          📊 پیشرفت سال
        </div>

        <div class="year-percent">
          ${escapeHtml(data.progress)}٪
        </div>

      </div>

      <div class="track">

        <div class="fill"></div>

      </div>

      <div class="year-meta">

        <span>
          ${escapeHtml(data.remaining)}
          روز باقی‌مانده
        </span>

        <span>
          ${escapeHtml(data.weeksRemaining)}
          هفته
        </span>

      </div>

    </section>

    <section class="stats">

      <div class="stat">

        <div class="stat-icon">
          ${escapeHtml(data.animalEmoji)}
        </div>

        <div class="stat-label">
          نماد سال
        </div>

        <div class="stat-value">
          ${escapeHtml(data.animal)}
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
          🌙
        </div>

        <div class="stat-label">
          وضعیت ماه
        </div>

        <div class="stat-value">
          ${escapeHtml(data.moon)}
        </div>

      </div>

    </section>

    <section class="events glass">

      <div class="section-title">
        📌 رویدادها و مناسبت‌ها
      </div>

      <div class="events-grid">

        <div class="event-group">

          <div class="event-group-title">
            🇮🇷 مناسبت‌های داخلی
          </div>

          ${internalEventsHtml}

        </div>

        <div class="event-group">

          <div class="event-group-title">
            🌍 مناسبت‌های بین‌المللی
          </div>

          ${internationalEventsHtml}

        </div>

      </div>

    </section>

    <section class="quote glass">

      <div class="quote-title">
        🌟 سخن بزرگان
      </div>

      <div class="quote-text">
        «${escapeHtml(data.quote)}»
      </div>

      <div class="quote-author">
        — ${escapeHtml(data.author)}
      </div>

    </section>

    <section class="thought glass">

      <div class="thought-title">
        🧠 جرعه‌ای تفکر
      </div>

      <div class="thought-text">
        «${escapeHtml(data.thought)}»
      </div>

    </section>

    <div class="footer-slogan">
      هم صدایی برای تحول و بهبود
    </div>

  </div>

</div>

</body>

</html>
`;
}

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

async function sendPhotoToBale(
  token: string,
  chatId: string,
  png: Uint8Array
) {
  const form = new FormData();

  form.append(
    "chat_id",
    chatId
  );

  form.append(
    "photo",
    new Blob(
      [
        new Uint8Array(png),
      ],
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

    const internationalEvents =
      getInternationalEvents(
        tehran.month,
        tehran.day
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

    const animal =
      getAnimal(
        persian.year
      );

    const hijriText =
      hijri
        ? `${fa(hijri.day)} ${hijri.month} ${fa(hijri.year)}`
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
            `${fa(tehran.year)}/` +
            `${fa(
              String(
                tehran.month
              ).padStart(2, "0")
            )}/` +
            `${fa(
              String(
                tehran.day
              ).padStart(2, "0")
            )}`,

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

          animal,

          animalEmoji:
            getAnimalEmoji(
              animal
            ),

          events:
            todayEvents
              .map((event: any) =>
                String(
                  event?.text ||
                  event?.event ||
                  event?.title ||
                  event?.name ||
                  event?.description ||
                  ""
                ).trim()
              )
              .filter(Boolean),

          internationalEvents,

          thought:
            content.thought,

          quote:
            content.quote,

          author:
            content.author,

          source:
            content.source,

          season:
            getSeasonData(
              persian.month
            ),
        }
      );

    const sent =
      await sendPhotoToBale(
        token,
        chatId,
        infographic
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

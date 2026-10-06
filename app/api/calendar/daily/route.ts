import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

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

/*
 * سال حیوانی ایرانی
 *
 * ۱۴۰۰ = گاو
 * ۱۴۰۱ = ببر
 * ۱۴۰۲ = خرگوش
 * ۱۴۰۳ = اژدها
 * ۱۴۰۴ = مار
 * ۱۴۰۵ = اسب
 */
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

/*
 * فقط مناسبت‌های دقیق همان روز شمسی
 */
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

/*
 * مناسبت‌های بین‌المللی
 *
 * این موارد نیز فقط در صورتی نمایش داده می‌شوند
 * که تاریخ میلادی امروز دقیقاً با آن مناسبت برابر باشد.
 */
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

/*
 * سخن بزرگان
 *
 * منبع/گوینده همراه سخن نمایش داده می‌شود.
 */
const DAILY_CONTENT = [
  {
    quote: "بهترین راه پیش‌بینی آینده، ساختن آن است.",
    author: "پیتر دراکر",
    source: "نقل مشهور",
    thought:
      "امروز چه کاری می‌توانم برای ساختن آینده بهتر انجام دهم؟",
  },
  {
    quote: "هرگز تسلیم نشو.",
    author: "وینستون چرچیل",
    source: "نقل مشهور",
    thought:
      "در برابر سختی امروز، کجا می‌توانم یک قدم دیگر ادامه بدهم؟",
  },
  {
    quote:
      "آینده به کسانی تعلق دارد که به آن باور دارند.",
    author: "النور روزولت",
    source: "نقل مشهور",
    thought:
      "برای آینده‌ای که می‌خواهم، امروز چه کاری باید انجام دهم؟",
  },
  {
    quote:
      "آنچه مهم است، این است که هرگز از پرسیدن دست نکشیم.",
    author: "آلبرت اینشتین",
    source: "نقل مشهور",
    thought:
      "امروز چه پرسشی می‌تواند نگاه من را تغییر دهد؟",
  },
  {
    quote: "ساده بودن، نهایت پیچیدگی است.",
    author: "لئوناردو داوینچی",
    source: "نقل مشهور",
    thought:
      "چه چیزی را می‌توانم در کار امروز ساده‌تر و بهتر کنم؟",
  },
  {
    quote: "دانستن کافی نیست؛ باید به کار بست.",
    author: "یوهان ولفگانگ گوته",
    source: "نقل مشهور",
    thought:
      "کدام دانسته من امروز باید به عمل تبدیل شود؟",
  },
  {
    quote:
      "راه هزار کیلومتری با یک قدم آغاز می‌شود.",
    author: "لائوتسه",
    source: "دائو ده جینگ",
    thought:
      "اولین قدم واقعی من برای هدف امروز چیست؟",
  },
  {
    quote:
      "باور کن که می‌توانی، نیمی از راه را رفته‌ای.",
    author: "تئودور روزولت",
    source: "نقل مشهور",
    thought:
      "کدام تردید را امروز باید کنار بگذارم؟",
  },
  {
    quote:
      "اگر می‌خواهی جهان را تغییر دهی، از خودت شروع کن.",
    author: "مهاتما گاندی",
    source: "نقل مشهور",
    thought:
      "امروز کدام تغییر کوچک را از خودم شروع می‌کنم؟",
  },
  {
    quote:
      "رقابت اصلی با دیروزِ خودت است.",
    author: "مایکل جردن",
    source: "نقل مشهور",
    thought:
      "امروز در چه چیزی می‌توانم کمی بهتر از دیروز باشم؟",
  },
  {
    quote:
      "رویا بزرگ داشته باش و کوچک شروع کن.",
    author: "ریچارد برانسون",
    source: "نقل مشهور",
    thought:
      "برای یک هدف بزرگ، قدم کوچک امروز من چیست؟",
  },
  {
    quote:
      "تغییر تنها ثابت زندگی است.",
    author: "هراکلیتوس",
    source: "حکمت یونان باستان",
    thought:
      "آیا از تغییر برای رشد خود استفاده می‌کنم؟",
  },
  {
    quote:
      "آنچه اندازه می‌گیری، می‌توانی بهتر کنی.",
    author: "پیتر دراکر",
    source: "نقل مدیریتی",
    thought:
      "کدام نتیجه را باید دقیق‌تر بررسی کنم؟",
  },
  {
    quote:
      "هر روز فرصتی تازه برای بهتر شدن است.",
    author: "حکمت معاصر",
    source: "نقل انگیزشی",
    thought:
      "امروز چه یک درصدی می‌توانم بهتر شوم؟",
  },
  {
    quote:
      "بزرگی در خدمت به دیگران است.",
    author: "آلبرت شوایتزر",
    source: "نقل مشهور",
    thought:
      "امروز چه کمکی می‌توانم بدون انتظار جبران انجام دهم؟",
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

  const allEvents = [
    ...data.events.map((x) => ({
      text: x,
      international: false,
    })),
    ...data.internationalEvents.map((x) => ({
      text: x,
      international: true,
    })),
  ];

  const eventsHtml = allEvents.length
    ? allEvents
        .slice(0, 8)
        .map(
          (event) => `
            <div class="event-item">
              <span class="event-dot">
                ${event.international ? "🌍" : "✦"}
              </span>

              <span class="event-text">
                ${escapeHtml(event.text)}
              </span>

              ${
                event.international
                  ? `<span class="international">
                       بین‌المللی
                     </span>`
                  : ""
              }
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

  return `
<!doctype html>

<html lang="fa" dir="rtl">

<head>

<meta charset="utf-8">

<style>

/*
 * فونت جدید:
 * خواناتر، ضخیم‌تر و مناسب‌تر برای متن فارسی
 * در تصویر ۱۰۲۴×۱۵۰۰
 */
@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700;800;900&display=swap");

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
    "Noto Sans Arabic",
    Tahoma,
    Arial,
    sans-serif;

  background:
    linear-gradient(
      180deg,
      #dff6ff 0%,
      #f5fcff 32%,
      #ffffff 67%,
      #f3faef 100%
    );

  color: #000000;
}

.page {
  width: ${WIDTH}px;
  height: ${HEIGHT}px;

  position: relative;

  overflow: hidden;

  padding:
    18px
    28px
    18px;
}

.nature {
  position: absolute;

  inset: 0;

  overflow: hidden;

  pointer-events: none;

  background-image:
    linear-gradient(
      180deg,
      rgba(255,255,255,.08) 0%,
      rgba(255,255,255,.04) 38%,
      rgba(255,255,255,.12) 72%,
      rgba(255,255,255,.20) 100%
    ),
    url("https://images.unsplash.com/photo-1629140476741-04d07ddeff60?auto=format&fit=crop&fm=jpg&q=92&w=1800&h=2700");

  background-size:
    cover,
    cover;

  background-position:
    center,
    center;

  background-repeat:
    no-repeat,
    no-repeat;

  filter:
    saturate(1.08)
    brightness(1.10)
    contrast(1.02);
}

.sun {
  position: absolute;

  top: 45px;
  left: 70px;

  width: 145px;
  height: 145px;

  border-radius: 50%;

  background:
    radial-gradient(
      circle,
      #fffbd2 0 18%,
      ${season.sun} 40%,
      rgba(255,211,82,.28) 68%,
      transparent 73%
    );

  opacity: 0;
}

.cloud {
  position: absolute;

  width: 240px;
  height: 55px;

  border-radius: 60px;

  background:
    rgba(255,255,255,.58);

  opacity: 0;
}

.cloud::before,
.cloud::after {
  content: "";

  position: absolute;

  bottom: 0;

  border-radius: 50%;

  background:
    rgba(255,255,255,.60);
}

.cloud::before {
  width: 90px;
  height: 90px;

  right: 35px;
}

.cloud::after {
  width: 70px;
  height: 70px;

  right: 105px;
}

.cloud.one {
  top: 95px;
  right: 55px;
}

.cloud.two {
  top: 180px;
  left: 230px;

  transform: scale(.75);
}

.mountains-back {
  position: absolute;

  left: -5%;
  right: -5%;

  top: 245px;

  height: 330px;

  background:
    linear-gradient(
      145deg,
      transparent 0 20%,
      ${season.mountain} 21% 49%,
      transparent 50%
    ),
    linear-gradient(
      215deg,
      transparent 0 18%,
      ${season.mountain} 19% 47%,
      transparent 48%
    );

  opacity: 0;
}

.mountains-front {
  position: absolute;

  left: -8%;
  right: -8%;

  top: 325px;

  height: 360px;

  background:
    linear-gradient(
      145deg,
      transparent 0 28%,
      ${season.mountainDark} 29% 58%,
      transparent 59%
    ),
    linear-gradient(
      215deg,
      transparent 0 30%,
      ${season.mountain} 31% 62%,
      transparent 63%
    );

  opacity: 0;
}

.forest {
  position: absolute;

  left: 0;
  right: 0;

  bottom: -20px;

  height: 500px;

  background:
    radial-gradient(
      ellipse at 10% 100%,
      ${season.forest} 0 21%,
      transparent 22%
    ),
    radial-gradient(
      ellipse at 25% 100%,
      ${season.forest} 0 25%,
      transparent 26%
    ),
    radial-gradient(
      ellipse at 45% 100%,
      ${season.forest} 0 23%,
      transparent 24%
    ),
    radial-gradient(
      ellipse at 67% 100%,
      ${season.forest} 0 28%,
      transparent 29%
    ),
    radial-gradient(
      ellipse at 87% 100%,
      ${season.forest} 0 24%,
      transparent 25%
    );

  opacity: 0;
}

.content {
  position: relative;

  z-index: 5;

  display: flex;

  flex-direction: column;

  height: 100%;
}

/* عنوان */

.header {
  min-height: 165px;

  display: flex;

  flex-direction: column;

  align-items: center;

  justify-content: center;

  text-align: center;

  padding:
    8px
    10px
    10px;
}

.title {
  color: #000000;

  font-size: 56px;

  line-height: 1.25;

  font-weight: 900;

  letter-spacing: -.6px;

  text-shadow:
    0 2px 3px rgba(255,255,255,.99),
    0 0 12px rgba(255,255,255,.96);
}

.greeting {
  margin-top: 10px;

  color: #000000;

  font-size: 42px;

  line-height: 1.32;

  font-weight: 800;

  text-shadow:
    0 2px 3px rgba(255,255,255,.99),
    0 0 11px rgba(255,255,255,.94);
}

/* تاریخ */

.date-area {
  min-height: 220px;

  padding:
    10px
    18px;

  position: relative;

  text-align: right;

  background: transparent;
}

.clock {
  position: absolute;

  left: 18px;
  top: 12px;

  padding: 0;

  border-radius: 0;

  background: transparent !important;

  color: #000000;

  font-size: 34px;

  font-weight: 900;

  text-shadow:
    0 2px 3px rgba(255,255,255,.99),
    0 0 10px rgba(255,255,255,.94);
}

.weekday {
  color: #000000;

  font-size: 42px;

  line-height: 1.3;

  font-weight: 900;

  text-shadow:
    0 2px 3px rgba(255,255,255,.99),
    0 0 11px rgba(255,255,255,.94);
}

.persian-date {
  margin-top: 0;

  color: #000000;

  font-size: 78px;

  line-height: 1.10;

  font-weight: 900;

  text-shadow:
    0 2px 3px rgba(255,255,255,.99),
    0 0 13px rgba(255,255,255,.96);
}

.date-lines {
  margin-top: 10px;

  display: flex;

  flex-direction: row-reverse;

  gap: 32px;

  color: #000000;

  font-size: 29px;

  line-height: 1.35;

  font-weight: 800;

  text-shadow:
    0 2px 3px rgba(255,255,255,.99),
    0 0 9px rgba(255,255,255,.92);
}

/* پیشرفت سال */

.year-area {
  margin-top: 4px;

  padding:
    8px
    18px;

  background: transparent;
}

.year-head {
  display: flex;

  flex-direction: row-reverse;

  justify-content: space-between;

  align-items: center;
}

.year-title,
.year-percent {
  color: #000000;

  font-size: 32px;

  font-weight: 900;

  text-shadow:
    0 2px 3px rgba(255,255,255,.99),
    0 0 9px rgba(255,255,255,.92);
}

.track {
  width: 100%;

  height: 21px;

  margin-top: 7px;

  padding: 3px;

  border-radius: 20px;

  background:
    rgba(255,255,255,.52);

  border:
    1px solid
    rgba(0,0,0,.28);
}

.fill {
  width: ${progressValue}%;

  height: 15px;

  border-radius: 20px;

  background:
    #000000;
}

.year-meta {
  margin-top: 5px;

  display: flex;

  flex-direction: row-reverse;

  justify-content: space-between;

  color: #000000;

  font-size: 24px;

  font-weight: 800;

  text-shadow:
    0 2px 3px rgba(255,255,255,.99),
    0 0 8px rgba(255,255,255,.92);
}

/* اطلاعات */

.stats {
  margin-top: 4px;

  display: flex;

  flex-direction: row-reverse;

  background: transparent;
}

.stat {
  flex: 1;

  text-align: center;

  padding:
    5px
    7px;

  border: none;
}

.stat-icon {
  font-size: 38px;

  text-shadow:
    0 2px 4px
    rgba(255,255,255,.98);
}

.stat-label {
  margin-top: 2px;

  color: #000000;

  font-size: 23px;

  font-weight: 800;

  text-shadow:
    0 2px 3px rgba(255,255,255,.99),
    0 0 8px rgba(255,255,255,.92);
}

.stat-value {
  margin-top: 1px;

  color: #000000;

  font-size: 25px;

  line-height: 1.25;

  font-weight: 800;

  text-shadow:
    0 2px 3px rgba(255,255,255,.99),
    0 0 8px rgba(255,255,255,.92);
}

/* مناسبت‌ها */

.events {
  margin-top: 4px;

  padding:
    7px
    18px;

  background: transparent;

  text-align: right;

  direction: rtl;
}

.section-title {
  color: #000000;

  font-size: 35px;

  line-height: 1.25;

  font-weight: 900;

  text-align: right;

  margin-bottom: 4px;

  text-shadow:
    0 2px 3px rgba(255,255,255,.99),
    0 0 11px rgba(255,255,255,.94);
}

.event-item {
  display: flex;

  flex-direction: row;

  direction: rtl;

  align-items: flex-start;

  justify-content: flex-start;

  gap: 8px;

  padding: 2px 0;

  color: #000000;

  font-size: 27px;

  line-height: 1.34;

  font-weight: 800;

  text-shadow:
    0 2px 3px rgba(255,255,255,.99),
    0 0 10px rgba(255,255,255,.92);

  text-align: right;
}

.event-dot {
  flex:
    0 0 auto;

  font-size: 25px;

  text-shadow:
    0 2px 3px rgba(255,255,255,.99);
}

.event-text {
  flex:
    0 1 auto;

  text-align: right;
}

.international {
  flex:
    0 0 auto;

  margin-right: 7px;

  padding: 0;

  border: none;

  border-radius: 0;

  color: #000000;

  font-size: 16px;

  font-weight: 800;

  white-space: nowrap;
}

/* سخن بزرگان */

.quote {
  margin-top: 4px;

  padding:
    7px
    18px;

  background: transparent;

  text-align: right;

  direction: rtl;
}

.quote-title {
  color: #000000;

  font-size: 35px;

  line-height: 1.25;

  font-weight: 900;

  margin-bottom: 3px;

  text-shadow:
    0 2px 3px rgba(255,255,255,.99),
    0 0 11px rgba(255,255,255,.94);
}

.quote-text {
  color: #000000;

  font-size: 31px;

  line-height: 1.32;

  font-weight: 800;

  text-shadow:
    0 2px 3px rgba(255,255,255,.99),
    0 0 11px rgba(255,255,255,.94);
}

.quote-author {
  margin-top: 4px;

  color: #000000;

  font-size: 25px;

  line-height: 1.32;

  font-weight: 800;

  text-shadow:
    0 2px 3px rgba(255,255,255,.99),
    0 0 9px rgba(255,255,255,.92);
}

/* جرعه تفکر */

.thought {
  margin-top: 4px;

  padding:
    7px
    18px;

  background: transparent;

  text-align: right;

  direction: rtl;
}

.thought-title {
  color: #000000;

  font-size: 34px;

  line-height: 1.25;

  font-weight: 900;

  margin-bottom: 3px;

  text-shadow:
    0 2px 3px rgba(255,255,255,.99),
    0 0 11px rgba(255,255,255,.94);
}

.thought-text {
  color: #000000;

  font-size: 27px;

  line-height: 1.32;

  font-weight: 800;

  text-shadow:
    0 2px 3px rgba(255,255,255,.99),
    0 0 10px rgba(255,255,255,.92);
}

/* شعار پایین تصویر */

.footer-slogan {
  margin-top: 0;

  padding-top: 8px;

  padding-bottom: 8px;

  color: #000000;

  font-size: 52px;

  line-height: 1.22;

  font-weight: 900;

  text-align: center;

  text-shadow:
    0 2px 3px rgba(255,255,255,.99),
    0 0 13px rgba(255,255,255,.96);
}

.content {
  height: 100%;
  min-height: 100%;

  justify-content: space-between;
}

.header,
.date-area,
.year-area,
.stats,
.events,
.quote,
.thought {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
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

    <header class="header">

      <div class="title">
        تقویم روزانه گروه صدای کارکنان ثبت احوال
      </div>

      <div class="greeting">
        روزت پر از اتفاقات خوب ☀️
      </div>

    </header>

    <section class="date-area">

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

    <section class="year-area">

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

    <section class="events">

      <div class="section-title">
        📌 رویدادها و مناسبت‌ها
      </div>

      ${eventsHtml}

    </section>

    <section class="quote">

      <div class="quote-title">
        🌟 سخن بزرگان
      </div>

      <div class="quote-text">
        «${escapeHtml(data.quote)}»
      </div>

      <div class="quote-author">
        گوینده: ${escapeHtml(data.author)}
        ·
        منبع: ${escapeHtml(data.source)}
      </div>

    </section>

    <section class="thought">

      <div class="thought-title">
        💡 جرعه‌ای تفکر
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

/*
 * منطق لغو ارسال حفظ شده است.
 */
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

    /*
     * دریافت مناسبت‌های سال و فیلتر دقیق
     * فقط بر اساس ماه و روز شمسی امروز.
     */
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

    /*
     * مناسبت‌های بین‌المللی فقط بر اساس
     * ماه و روز میلادی امروز.
     */
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
        persian.day
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

          /*
           * مهم:
           * منبع رویدادهای داخلی از event.text
           * استفاده می‌کند.
           *
           * فیلتر getEventsForDay همچنان قبل از
           * رسیدن به این قسمت فقط مناسبت همان روز
           * را عبور می‌دهد.
           */
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

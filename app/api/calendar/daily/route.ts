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
 * تقویم حیوانی سال‌های ایرانی
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
  if (month >= 1 && month <= 3) return "spring";
  if (month >= 4 && month <= 6) return "summer";
  if (month >= 7 && month <= 9) return "autumn";
  return "winter";
}

function getSeasonData(month: number) {
  const season = getSeason(month);

  if (season === "spring") {
    return {
      title: "بهار",
      sky1: "#73c9ef",
      sky2: "#dff6ff",
      sun: "#ffd45a",
      mountain: "#789f76",
      mountainDark: "#4c7858",
      forest: "#327653",
      ground: "#8bbf72",
      flower: "#f5a6b8",
    };
  }

  if (season === "summer") {
    return {
      title: "تابستان",
      sky1: "#35a9e8",
      sky2: "#d7f3ff",
      sun: "#ffd447",
      mountain: "#648f72",
      mountainDark: "#3d694f",
      forest: "#246947",
      ground: "#5c9a55",
      flower: "#f3d65c",
    };
  }

  if (season === "autumn") {
    return {
      title: "پاییز",
      sky1: "#79b9d1",
      sky2: "#f8e4bd",
      sun: "#f6bd45",
      mountain: "#85735b",
      mountainDark: "#5e594b",
      forest: "#a76535",
      ground: "#a87943",
      flower: "#d98639",
    };
  }

  return {
    title: "زمستان",
    sky1: "#79b5d8",
    sky2: "#e9f5fc",
    sun: "#f8d56d",
    mountain: "#8297a4",
    mountainDark: "#607481",
    forest: "#45695f",
    ground: "#e7f1f5",
    flower: "#ffffff",
  };
}

function getMoonPhase(date: Date) {
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
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

/*
 * محتوای روزانه
 *
 * عمداً از حوزه‌های مختلف استفاده شده:
 * دانش، ادبیات، علم، مدیریت، ورزش، فناوری،
 * کارآفرینی، فرهنگ و اندیشه.
 *
 * نقل‌قول‌های خیلی کوتاه نگه داشته شده‌اند.
 */
const DAILY_CONTENT = [
  {
    quote: "دانش، آغاز خرد است.",
    author: "سقراط",
    source: "حکمت منسوب",
    thought: "امروز چه چیزی می‌توانم یاد بگیرم که فردای من را بهتر کند؟",
  },
  {
    quote: "موفقیت، مجموع تلاش‌های کوچک روزانه است.",
    author: "رابرت کولیر",
    source: "نقل مشهور",
    thought: "کدام کار کوچک امروز می‌تواند در آینده نتیجه بزرگی بسازد؟",
  },
  {
    quote: "هرگز تسلیم نشو.",
    author: "وینستون چرچیل",
    source: "نقل مشهور",
    thought: "در برابر سختی امروز، کجا می‌توانم یک قدم دیگر ادامه بدهم؟",
  },
  {
    quote: "آینده به کسانی تعلق دارد که به آن باور دارند.",
    author: "النور روزولت",
    source: "نقل مشهور",
    thought: "برای آینده‌ای که می‌خواهم، امروز چه کاری باید انجام دهم؟",
  },
  {
    quote: "زندگی آن چیزی است که برای ما اتفاق می‌افتد.",
    author: "جان لنون",
    source: "نقل مشهور",
    thought: "چقدر از امروز را آگاهانه زندگی می‌کنم؟",
  },
  {
    quote: "آنچه مهم است، این است که هرگز از پرسیدن دست نکشیم.",
    author: "آلبرت اینشتین",
    source: "نقل مشهور",
    thought: "امروز چه پرسشی می‌تواند نگاه من را تغییر دهد؟",
  },
  {
    quote: "ساده بودن، نهایت پیچیدگی است.",
    author: "لئوناردو داوینچی",
    source: "نقل مشهور",
    thought: "چه چیزی را می‌توانم در کار امروز ساده‌تر و بهتر کنم؟",
  },
  {
    quote: "اگر می‌توانی چیزی را تصور کنی، می‌توانی برای آن تلاش کنی.",
    author: "والت دیزنی",
    source: "نقل مشهور",
    thought: "کدام ایده را باید از ذهنم به یک اقدام واقعی تبدیل کنم؟",
  },
  {
    quote: "موفقیت، رفتن از شکستی به شکست دیگر بدون از دست دادن اشتیاق است.",
    author: "وینستون چرچیل",
    source: "نقل مشهور",
    thought: "از آخرین اشتباه خود چه درسی گرفته‌ام؟",
  },
  {
    quote: "دانستن کافی نیست؛ باید به کار بست.",
    author: "یوهان ولفگانگ گوته",
    source: "نقل مشهور",
    thought: "کدام دانسته من امروز باید به عمل تبدیل شود؟",
  },
  {
    quote: "خلاقیت، هوشِ در حال خوشگذرانی است.",
    author: "آلبرت اینشتین",
    source: "نقل مشهور",
    thought: "آیا برای پیدا کردن راه تازه، به خودم فرصت فکر کردن می‌دهم؟",
  },
  {
    quote: "کیفیت یعنی درست انجام دادن کار، وقتی کسی نگاه نمی‌کند.",
    author: "هنری فورد",
    source: "نقل مشهور",
    thought: "آیا کیفیت کار من به حضور یا نظارت دیگران وابسته است؟",
  },
  {
    quote: "بهترین راه پیش‌بینی آینده، ساختن آن است.",
    author: "پیتر دراکر",
    source: "نقل مشهور",
    thought: "من امروز کدام بخش از آینده خودم را می‌سازم؟",
  },
  {
    quote: "اگر چیزی را نمی‌توانی توضیح دهی، به اندازه کافی آن را نفهمیده‌ای.",
    author: "آلبرت اینشتین",
    source: "نقل منسوب",
    thought: "کدام موضوع را باید عمیق‌تر و ساده‌تر بفهمم؟",
  },
  {
    quote: "راه هزار کیلومتری با یک قدم آغاز می‌شود.",
    author: "لائوتسه",
    source: "دائو ده جینگ",
    thought: "اولین قدم واقعی من برای هدف امروز چیست؟",
  },
  {
    quote: "آنچه انجام می‌دهی، تو را می‌سازد.",
    author: "ارسطو",
    source: "حکمت منسوب",
    thought: "عادت‌های امروز من چه شخصیتی برای فردایم می‌سازند؟",
  },
  {
    quote: "باور کن که می‌توانی، نیمی از راه را رفته‌ای.",
    author: "تئودور روزولت",
    source: "نقل مشهور",
    thought: "کدام تردید را امروز باید کنار بگذارم؟",
  },
  {
    quote: "هیچ‌کس با استعداد به دنیا نمی‌آید؛ مهارت ساخته می‌شود.",
    author: "نقل آموزشی",
    source: "حکمت معاصر",
    thought: "کدام مهارت را باید با تمرین مداوم بهتر کنم؟",
  },
  {
    quote: "اگر می‌خواهی جهان را تغییر دهی، از خودت شروع کن.",
    author: "مهاتما گاندی",
    source: "نقل مشهور",
    thought: "امروز کدام تغییر کوچک را از خودم شروع می‌کنم؟",
  },
  {
    quote: "ورزش، جشن توانایی‌های بدن است.",
    author: "نقل معاصر",
    source: "حکمت ورزشی",
    thought: "چگونه می‌توانم امروز بیشتر مراقب انرژی و توان خود باشم؟",
  },
  {
    quote: "رقابت اصلی با دیروزِ خودت است.",
    author: "مایکل جردن",
    source: "نقل مشهور",
    thought: "امروز در چه چیزی می‌توانم کمی بهتر از دیروز باشم؟",
  },
  {
    quote: "رویا بزرگ داشته باش و کوچک شروع کن.",
    author: "ریچارد برانسون",
    source: "نقل مشهور",
    thought: "برای یک هدف بزرگ، قدم کوچک امروز من چیست؟",
  },
  {
    quote: "اشتباه کردن پایان راه نیست؛ بخشی از یادگیری است.",
    author: "نقل آموزشی",
    source: "حکمت معاصر",
    thought: "از یک اشتباه گذشته چگونه می‌توانم فرصت بسازم؟",
  },
  {
    quote: "آینده را نمی‌توان با عادت‌های گذشته ساخت.",
    author: "پیتر دراکر",
    source: "نقل مشهور",
    thought: "کدام عادت قدیمی دیگر برای آینده من مناسب نیست؟",
  },
  {
    quote: "اگر کاری ارزش انجام دادن دارد، ارزش خوب انجام دادن دارد.",
    author: "نقل مشهور",
    source: "حکمت کاری",
    thought: "امروز کدام کار را باید با دقت بیشتری انجام دهم؟",
  },
  {
    quote: "صبوری، هنر امید داشتن است.",
    author: "لوس دو کلاپیه",
    source: "حکمت منسوب",
    thought: "کجا باید به جای عجله، صبر و استمرار داشته باشم؟",
  },
  {
    quote: "یک تیم قوی از افراد متفاوت ساخته می‌شود.",
    author: "نقل مدیریتی",
    source: "حکمت معاصر",
    thought: "امروز چگونه می‌توانم به موفقیت یک همکار کمک کنم؟",
  },
  {
    quote: "تغییر تنها ثابت زندگی است.",
    author: "هراکلیتوس",
    source: "حکمت یونان باستان",
    thought: "آیا به جای مقاومت بیهوده، از تغییر برای رشد استفاده می‌کنم؟",
  },
  {
    quote: "آنچه اندازه می‌گیری، می‌توانی بهتر کنی.",
    author: "پیتر دراکر",
    source: "نقل مدیریتی",
    thought: "کدام نتیجه را باید دقیق‌تر بررسی و اندازه‌گیری کنم؟",
  },
  {
    quote: "هر روز فرصتی تازه برای بهتر شدن است.",
    author: "حکمت معاصر",
    source: "نقل انگیزشی",
    thought: "امروز چه یک درصدی می‌توانم بهتر شوم؟",
  },
  {
    quote: "بزرگی در خدمت به دیگران است.",
    author: "آلبرت شوایتزر",
    source: "نقل مشهور",
    thought: "امروز چه کمکی می‌توانم بدون انتظار جبران انجام دهم؟",
  },
  {
    quote: "هیچ موفقیتی بدون پشتکار پایدار نمی‌ماند.",
    author: "حکمت معاصر",
    source: "نقل انگیزشی",
    thought: "کدام هدف به استمرار بیشتری از من نیاز دارد؟",
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
  thought: string;
  quote: string;
  author: string;
  source: string;
  season: {
    title: string;
    sky1: string;
    sky2: string;
    sun: string;
    mountain: string;
    mountainDark: string;
    forest: string;
    ground: string;
    flower: string;
  };
}) {
  const progressValue = Math.min(
    100,
    Math.max(0, Number(data.progress))
  );

  const season = data.season;

  const eventsHtml = data.events.length
    ? data.events
        .map(
          (event) => `
            <div class="event-item">
              <span class="event-dot">✦</span>
              <span>${escapeHtml(event)}</span>
            </div>
          `
        )
        .join("")
    : `
      <div class="event-item">
        <span class="event-dot">✦</span>
        <span>مناسبتی برای امروز ثبت نشده است.</span>
      </div>
    `;

  return `
<!doctype html>
<html lang="fa" dir="rtl">
<head>

<meta charset="utf-8">

<style>

@font-face {
  font-family: Vazirmatn;

  src:
    url("https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/fonts/ttf/Vazirmatn-Regular.ttf")
    format("truetype");

  font-weight: 400;
}

@font-face {
  font-family: Vazirmatn;

  src:
    url("https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/fonts/ttf/Vazirmatn-Bold.ttf")
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
    linear-gradient(
      180deg,
      ${season.sky1} 0%,
      ${season.sky2} 43%,
      #fdfcf5 72%,
      ${season.ground} 100%
    );

  color: #18384c;
}

.page {
  width: ${WIDTH}px;
  height: ${HEIGHT}px;

  position: relative;

  overflow: hidden;

  padding:
    28px
    38px
    30px;

  display: flex;
  flex-direction: column;
}

/* ==========================
   NATURE BACKGROUND
========================== */

.nature {
  position: absolute;

  inset: 0;

  overflow: hidden;

  pointer-events: none;
}

.sun {
  position: absolute;

  top: 68px;
  left: 95px;

  width: 118px;
  height: 118px;

  border-radius: 50%;

  background:
    radial-gradient(
      circle,
      #fffbd0 0 15%,
      ${season.sun} 38%,
      rgba(255,211,82,.32) 67%,
      transparent 72%
    );

  filter:
    drop-shadow(
      0 0 26px
      rgba(255,209,75,.7)
    );
}

.cloud {
  position: absolute;

  width: 220px;
  height: 52px;

  border-radius: 60px;

  background: rgba(255,255,255,.45);

  filter: blur(2px);
}

.cloud::before,
.cloud::after {
  content: "";

  position: absolute;

  bottom: 0;

  border-radius: 50%;

  background: rgba(255,255,255,.48);
}

.cloud::before {
  width: 85px;
  height: 85px;

  right: 35px;
}

.cloud::after {
  width: 65px;
  height: 65px;

  right: 100px;
}

.cloud.one {
  top: 100px;
  right: 75px;
}

.cloud.two {
  top: 190px;
  left: 240px;

  transform: scale(.72);

  opacity: .55;
}

.mountains-back {
  position: absolute;

  left: -5%;
  right: -5%;

  top: 250px;

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

  opacity: .65;
}

.mountains-front {
  position: absolute;

  left: -8%;
  right: -8%;

  top: 330px;

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
}

.forest {
  position: absolute;

  left: 0;
  right: 0;

  bottom: -20px;

  height: 480px;

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

  opacity: .34;
}

.forest::after {
  content: "";

  position: absolute;

  left: 0;
  right: 0;
  bottom: 0;

  height: 145px;

  background:
    linear-gradient(
      180deg,
      transparent,
      rgba(26,86,58,.55)
    );
}

/* ==========================
   MAIN CONTENT
========================== */

.content {
  position: relative;

  z-index: 5;

  height: 100%;

  display: flex;
  flex-direction: column;
}

/* ==========================
   HEADER
========================== */

.header {
  min-height: 190px;

  display: flex;
  flex-direction: column;

  align-items: center;
  justify-content: center;

  text-align: center;

  padding:
    10px
    20px
    20px;
}

.title {
  color: #063e62;

  font-size: 43px;

  line-height: 1.35;

  font-weight: 700;

  text-shadow:
    0 3px 12px
    rgba(255,255,255,.95);
}

.greeting {
  margin-top: 8px;

  color: #a95700;

  font-size: 31px;

  font-weight: 700;

  text-shadow:
    0 2px 9px
    rgba(255,255,255,.9);
}

.season {
  margin-top: 6px;

  color: #316a58;

  font-size: 20px;

  font-weight: 700;

  opacity: .92;
}

/* ==========================
   DATE AREA
========================== */

.date-area {
  position: relative;

  min-height: 245px;

  padding:
    18px
    30px
    20px;

  background:
    linear-gradient(
      90deg,
      rgba(255,255,255,.16),
      rgba(255,255,255,.72),
      rgba(255,255,255,.16)
    );

  border-top:
    2px solid
    rgba(255,255,255,.78);

  border-bottom:
    2px solid
    rgba(255,255,255,.75);

  text-align: right;
}

.clock {
  position: absolute;

  left: 24px;
  top: 20px;

  padding:
    9px
    16px;

  border-radius: 18px;

  color: #ffffff;

  background:
    rgba(9,71,105,.84);

  font-size: 24px;

  font-weight: 700;

  box-shadow:
    0 7px 18px
    rgba(9,71,105,.16);
}

.weekday {
  color: #5e7583;

  font-size: 27px;

  font-weight: 700;
}

.persian-date {
  margin-top: 1px;

  color: #0c4b76;

  font-size: 61px;

  line-height: 1.2;

  font-weight: 700;
}

.date-lines {
  margin-top: 14px;

  display: flex;

  flex-direction: row-reverse;

  gap: 34px;

  color: #486a79;

  font-size: 21px;

  font-weight: 700;
}

.date-lines span {
  display: inline-flex;

  align-items: center;

  gap: 8px;
}

/* ==========================
   YEAR PROGRESS
========================== */

.year-area {
  margin-top: 12px;

  padding:
    13px
    26px
    15px;

  background:
    rgba(255,255,255,.46);

  border-top:
    2px solid
    rgba(47,151,130,.38);

  border-bottom:
    2px solid
    rgba(47,151,130,.25);
}

.year-head {
  display: flex;

  flex-direction: row-reverse;

  justify-content: space-between;

  align-items: center;
}

.year-title {
  color: #126b61;

  font-size: 25px;

  font-weight: 700;
}

.year-percent {
  color: #14536d;

  font-size: 24px;

  font-weight: 700;
}

.track {
  width: 100%;

  height: 20px;

  margin-top: 10px;

  padding: 3px;

  border-radius: 20px;

  background:
    rgba(255,255,255,.76);
}

.fill {
  width: ${progressValue}%;

  height: 14px;

  border-radius: 20px;

  background:
    linear-gradient(
      90deg,
      #1b9874,
      #65c77e
    );
}

.year-meta {
  margin-top: 6px;

  display: flex;

  flex-direction: row-reverse;

  justify-content: space-between;

  color: #587772;

  font-size: 18px;
}

/* ==========================
   STATS - INLINE
========================== */

.stats {
  margin-top: 12px;

  display: flex;

  flex-direction: row-reverse;

  align-items: stretch;

  justify-content: space-between;

  gap: 0;

  padding:
    10px
    0;

  background:
    rgba(255,255,255,.32);

  border-top:
    1px solid
    rgba(255,255,255,.8);

  border-bottom:
    1px solid
    rgba(255,255,255,.8);
}

.stat {
  flex: 1;

  text-align: center;

  padding:
    5px
    12px;

  border-left:
    1px solid
    rgba(60,111,126,.18);
}

.stat:last-child {
  border-left: none;
}

.stat-icon {
  font-size: 32px;

  line-height: 1;
}

.stat-label {
  margin-top: 5px;

  color: #667e87;

  font-size: 17px;
}

.stat-value {
  margin-top: 2px;

  color: #31566c;

  font-size: 20px;

  line-height: 1.3;

  font-weight: 700;
}

/* ==========================
   EVENTS
========================== */

.events {
  margin-top: 11px;

  padding:
    12px
    24px
    14px;

  background:
    linear-gradient(
      90deg,
      rgba(255,255,255,.22),
      rgba(255,250,230,.68),
      rgba(255,255,255,.22)
    );

  border-top:
    3px solid
    rgba(224,148,31,.7);

  border-bottom:
    1px solid
    rgba(224,148,31,.25);
}

.section-title {
  color: #c5740b;

  font-size: 27px;

  font-weight: 700;

  margin-bottom: 7px;
}

.event-item {
  display: flex;

  flex-direction: row-reverse;

  align-items: flex-start;

  gap: 10px;

  padding: 4px 0;

  color: #394f5d;

  font-size: 21px;

  line-height: 1.42;
}

.event-dot {
  flex: 0 0 auto;

  color: #e39a20;

  font-size: 20px;
}

/* ==========================
   QUOTE
========================== */

.quote {
  margin-top: 11px;

  padding:
    13px
    25px
    14px;

  background:
    linear-gradient(
      90deg,
      rgba(255,255,255,.2),
      rgba(246,243,255,.72),
      rgba(255,255,255,.2)
    );

  border-top:
    3px solid
    rgba(102,89,190,.6);

  border-bottom:
    1px solid
    rgba(102,89,190,.24);

  text-align: right;
}

.quote-title {
  color: #5b4e9e;

  font-size: 27px;

  font-weight: 700;

  margin-bottom: 7px;
}

.quote-text {
  color: #263f52;

  font-size: 24px;

  line-height: 1.48;

  font-weight: 700;
}

.quote-author {
  margin-top: 5px;

  color: #766e84;

  font-size: 17px;
}

/* ==========================
   THOUGHT
========================== */

.thought {
  margin-top: 11px;

  padding:
    13px
    25px
    15px;

  background:
    linear-gradient(
      90deg,
      rgba(255,255,255,.2),
      rgba(237,255,254,.72),
      rgba(255,255,255,.2)
    );

  border-top:
    3px solid
    rgba(16,151,151,.65);

  border-bottom:
    1px solid
    rgba(16,151,151,.25);

  text-align: right;
}

.thought-title {
  color: #087e80;

  font-size: 27px;

  font-weight: 700;

  margin-bottom: 7px;
}

.thought-text {
  color: #21495c;

  font-size: 23px;

  line-height: 1.48;

  font-weight: 700;
}

/* ==========================
   BOTTOM NATURE STRIP
========================== */

.bottom-nature {
  position: absolute;

  z-index: 2;

  left: 0;
  right: 0;

  bottom: 0;

  height: 190px;

  background:
    linear-gradient(
      180deg,
      transparent,
      rgba(255,255,255,.15)
    );
}

.bottom-nature::before,
.bottom-nature::after {
  content: "";

  position: absolute;

  bottom: -75px;

  border-radius: 50% 50% 0 0;
}

.bottom-nature::before {
  left: -8%;

  width: 70%;

  height: 180px;

  background:
    ${season.forest};

  opacity: .45;
}

.bottom-nature::after {
  right: -10%;

  width: 72%;

  height: 160px;

  background:
    ${season.mountainDark};

  opacity: .27;
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

      <div class="season">
        طبیعت ${escapeHtml(season.title)}
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
        — ${escapeHtml(data.author)}
        ·
        ${escapeHtml(data.source)}
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

  </div>

  <div class="bottom-nature"></div>

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
 * منطق لغو ارسال را دست نمی‌زنیم.
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

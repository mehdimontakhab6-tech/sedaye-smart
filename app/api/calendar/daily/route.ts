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
    .slice(0, 5);
}

/*
 * برای هر روز ماه یک محتوای متفاوت.
 * روزهای 1 تا 31 هر کدام متن مخصوص خودشان را دارند.
 */
const DAILY_CONTENT = [
  {
    quote:
      "تو نیکی می‌کن و در دجله انداز، که ایزد در بیابانت دهد باز",
    author: "سعدی",
    source: "گلستان",
    thought:
      "امروز کدام کار خیر را می‌توانم بدون انتظار جبران انجام دهم؟",
  },
  {
    quote:
      "بنی آدم اعضای یکدیگرند",
    author: "سعدی",
    source: "گلستان",
    thought:
      "در رفتار امروز من، سهم همدلی با دیگران چقدر است؟",
  },
  {
    quote:
      "نابرده رنج گنج میسر نمی‌شود",
    author: "سعدی",
    source: "گلستان",
    thought:
      "برای رسیدن به هدفم، امروز چه گام کوچکی باید بردارم؟",
  },
  {
    quote:
      "هر که ناموخت از گذشت روزگار، نیز ناموزد ز هیچ آموزگار",
    author: "مولانا",
    source: "مثنوی معنوی",
    thought:
      "از تجربه دیروز چه درسی می‌توانم برای امروز بگیرم؟",
  },
  {
    quote:
      "این قافله عمر عجب می‌گذرد",
    author: "خیام",
    source: "رباعیات",
    thought:
      "اگر امروز تکرارشدنی نباشد، چگونه آن را بهتر زندگی می‌کنم؟",
  },
  {
    quote:
      "توانا بود هر که دانا بود",
    author: "فردوسی",
    source: "شاهنامه",
    thought:
      "کدام دانشی می‌تواند امروز توانایی من را بیشتر کند؟",
  },
  {
    quote:
      "ز گهواره تا گور دانش بجوی",
    author: "حدیث مشهور",
    source: "نقل مشهور",
    thought:
      "امروز چه چیز تازه‌ای می‌توانم یاد بگیرم؟",
  },
  {
    quote:
      "کار نیکو کردن از پر کردن است",
    author: "ضرب‌المثل فارسی",
    source: "ضرب‌المثل",
    thought:
      "کدام مهارت با تمرین بیشتر در من بهتر می‌شود؟",
  },
  {
    quote:
      "رهرو آن نیست که گه تند و گهی خسته رود",
    author: "سعدی",
    source: "غزل سعدی",
    thought:
      "آیا در مسیر هدفم پیوستگی دارم یا فقط گاهی تلاش می‌کنم؟",
  },
  {
    quote:
      "مشک آن است که خود ببوید، نه آنکه عطار بگوید",
    author: "ضرب‌المثل فارسی",
    source: "ضرب‌المثل",
    thought:
      "آیا کیفیت کارم بدون تعریف دیگران هم دیده می‌شود؟",
  },
  {
    quote:
      "قطره قطره جمع گردد وانگهی دریا شود",
    author: "ضرب‌المثل فارسی",
    source: "ضرب‌المثل",
    thought:
      "کدام قدم کوچک امروز در آینده نتیجه بزرگی می‌سازد؟",
  },
  {
    quote:
      "توانا بود هر که دانا بود",
    author: "فردوسی",
    source: "شاهنامه",
    thought:
      "چه دانشی را باید از حالت اطلاعات به مهارت تبدیل کنم؟",
  },
  {
    quote:
      "خوشا آنان که دائم در نمازند",
    author: "حافظ",
    source: "غزل حافظ",
    thought:
      "چگونه می‌توانم حضور ذهن و آرامش بیشتری در کار امروز داشته باشم؟",
  },
  {
    quote:
      "دوش دیدم که ملائک در میخانه زدند",
    author: "حافظ",
    source: "غزل حافظ",
    thought:
      "آیا برای دیدن فرصت‌های تازه، ذهنم را از پیش‌داوری‌ها آزاد کرده‌ام؟",
  },
  {
    quote:
      "هر که دلارام دید از دلش آرام رفت",
    author: "حافظ",
    source: "غزل حافظ",
    thought:
      "چه چیزی واقعاً به زندگی من معنا و آرامش می‌دهد؟",
  },
  {
    quote:
      "بنی آدم اعضای یک پیکرند",
    author: "سعدی",
    source: "گلستان",
    thought:
      "امروز چگونه می‌توانم به موفقیت یک همکار کمک کنم؟",
  },
  {
    quote:
      "به جهان خرم از آنم که جهان خرم از اوست",
    author: "سعدی",
    source: "غزل سعدی",
    thought:
      "نگاه من به محیط اطرافم چگونه بر حال خودم اثر می‌گذارد؟",
  },
  {
    quote:
      "هر که در این بزم مقرب‌تر است، جام بلا بیشترش می‌دهند",
    author: "حافظ",
    source: "غزل حافظ",
    thought:
      "در برابر مسئولیت‌های دشوار، چقدر تاب‌آوری دارم؟",
  },
  {
    quote:
      "تو پای به راه در نه و هیچ مپرس",
    author: "عطار نیشابوری",
    source: "منطق‌الطیر",
    thought:
      "برای شروع کاری که به تعویق انداخته‌ام، اولین قدم چیست؟",
  },
  {
    quote:
      "این نیز بگذرد",
    author: "ضرب‌المثل فارسی",
    source: "ضرب‌المثل",
    thought:
      "آیا در روزهای سخت، موقتی بودن شرایط را به یاد دارم؟",
  },
  {
    quote:
      "از محبت خارها گل می‌شود",
    author: "مولانا",
    source: "مثنوی معنوی",
    thought:
      "امروز کجا می‌توانم با مهربانی، نتیجه بهتری بسازم؟",
  },
  {
    quote:
      "هر کسی از ظن خود شد یار من",
    author: "مولانا",
    source: "مثنوی معنوی",
    thought:
      "آیا پیش از قضاوت درباره دیگران، دیدگاه آنان را می‌شنوم؟",
  },
  {
    quote:
      "آب کم جو، تشنگی آور به دست",
    author: "مولانا",
    source: "مثنوی معنوی",
    thought:
      "میزان اشتیاق من برای یادگیری و رشد چقدر است؟",
  },
  {
    quote:
      "دشمن دانا که غم جان بود بهتر از آن دوست که نادان بود",
    author: "نظامی گنجوی",
    source: "مخزن‌الاسرار",
    thought:
      "آیا از بازخورد صادقانه، حتی اگر سخت باشد، استفاده می‌کنم؟",
  },
  {
    quote:
      "جهان یادگار است و ما رفتنی",
    author: "فردوسی",
    source: "شاهنامه",
    thought:
      "دوست دارم چه اثری از کار امروز من باقی بماند؟",
  },
  {
    quote:
      "چو دخلت نیست، خرج آهسته‌تر کن",
    author: "سعدی",
    source: "گلستان",
    thought:
      "امروز کدام منبع یا زمان را می‌توانم هوشمندانه‌تر مدیریت کنم؟",
  },
  {
    quote:
      "هر که را اسرار حق آموختند، مهر کردند و دهانش دوختند",
    author: "مولانا",
    source: "مثنوی معنوی",
    thought:
      "آیا در گفتار و نگهداری اطلاعات، به اندازه کافی مسئولیت‌پذیرم؟",
  },
  {
    quote:
      "جهد کن تا پیرهن از عیب پاک",
    author: "مولانا",
    source: "مثنوی معنوی",
    thought:
      "کدام عادت کوچک را امروز باید اصلاح کنم؟",
  },
  {
    quote:
      "هنر چشمه زاینده است و دولت پاینده",
    author: "فردوسی",
    source: "شاهنامه",
    thought:
      "کدام توانایی خود را باید بیشتر پرورش دهم؟",
  },
  {
    quote:
      "هر که را خوابگه آخر مشتی خاک است",
    author: "حافظ",
    source: "غزل حافظ",
    thought:
      "چه چیزی در زندگی من ارزش واقعی و ماندگار دارد؟",
  },
  {
    quote:
      "بزرگی سراسر به گفتار نیست",
    author: "فردوسی",
    source: "شاهنامه",
    thought:
      "آیا رفتار امروز من با ارزش‌هایی که می‌گویم هماهنگ است؟",
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

  color: #102f45;

  background:
    linear-gradient(
      180deg,
      #fffdf5 0%,
      #f6fbff 45%,
      #ffffff 100%
    );
}

.page {

  width: ${WIDTH}px;
  height: ${HEIGHT}px;

  padding:
    0
    24px
    18px;

  display: flex;
  flex-direction: column;

  overflow: hidden;
}

/* =========================
   TOP
========================= */

.hero {

  height: 218px;

  margin:
    0
    -24px
    14px;

  position: relative;

  overflow: hidden;

  display: flex;

  align-items: center;
  justify-content: center;

  padding:
    28px
    38px
    30px;

  background:

    radial-gradient(
      circle at 18% 22%,
      rgba(255,255,255,.96) 0 7%,
      transparent 20%
    ),

    radial-gradient(
      circle at 50% 55%,
      rgba(255,226,119,.98) 0 6%,
      rgba(255,194,67,.48) 15%,
      transparent 34%
    ),

    linear-gradient(
      180deg,
      #8fd4ff 0%,
      #d9f2ff 48%,
      #fff2c8 72%,
      #d6efd8 100%
    );
}

.hero::before {

  content: "";

  position: absolute;

  inset:
    80px
    -60px
    0;

  background:

    linear-gradient(
      155deg,
      transparent 0 48%,
      #5b9274 49% 61%,
      transparent 62%
    ),

    linear-gradient(
      25deg,
      transparent 0 52%,
      #7db08a 53% 66%,
      transparent 67%
    );

  opacity: .9;
}

.hero::after {

  content: "";

  position: absolute;

  left: 0;
  right: 0;
  bottom: 0;

  height: 66px;

  background:

    radial-gradient(
      ellipse at 20% 100%,
      #3e765d 0 23%,
      transparent 24%
    ),

    radial-gradient(
      ellipse at 65% 100%,
      #56866b 0 28%,
      transparent 29%
    ),

    linear-gradient(
      180deg,
      transparent,
      rgba(255,255,255,.7)
    );
}

.hero-title {

  position: relative;

  z-index: 3;

  text-align: center;

  direction: rtl;

  color: #063f6e;

  text-shadow:
    0 3px 12px
    rgba(255,255,255,.95);
}

.hero-title-main {

  font-size: 44px;

  line-height: 1.35;

  font-weight: 700;
}

.hero-title-sub {

  margin-top: 8px;

  color: #b45b00;

  font-size: 34px;

  line-height: 1.35;

  font-weight: 700;
}

/* =========================
   DATE
========================= */

.date-panel {

  min-height: 238px;

  padding:
    20px
    28px;

  position: relative;

  border: none;

  border-top:
    5px solid
    #28a9d6;

  border-bottom:
    4px solid
    #b8df73;

  border-radius: 0;

  background:
    rgba(255,255,255,.35);

  box-shadow: none;
}

.date-panel::before {

  content: "";

  position: absolute;

  top: 18px;

  right: 24px;
  left: 24px;

  height: 3px;

  border-radius: 10px;

  background:
    linear-gradient(
      90deg,
      #1689cf,
      #8bd5ed
    );

  opacity: .55;
}

.date-weekday {

  margin-top: 22px;

  color: #547183;

  font-size: 30px;

  font-weight: 700;

  text-align: right;
}

.date-main {

  margin-top: 4px;

  color: #0d4a78;

  font-size: 64px;

  line-height: 1.2;

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

  padding:
    13px
    16px;

  border-radius: 18px;

  background:
    rgba(255,255,255,.72);

  border:
    1px solid
    #d8eaf5;

  text-align: right;
}

.date-chip-label {

  color: #7c8e9a;

  font-size: 18px;

  margin-bottom: 3px;
}

.date-chip-value {

  color: #29485d;

  font-size: 24px;

  font-weight: 700;
}

.clock {

  position: absolute;

  top: 24px;
  left: 28px;

  padding:
    11px
    18px;

  border-radius: 18px;

  color: #fff;

  background:
    linear-gradient(
      135deg,
      #0d4d76,
      #1d82b0
    );

  font-size: 27px;

  font-weight: 700;

  box-shadow:
    0 8px 18px
    rgba(13,77,118,.2);
}

/* =========================
   YEAR
========================= */

.progress-panel {

  margin-top: 11px;

  padding:
    17px
    26px;

  border:
    1.5px solid
    #b6dfd8;

  border-radius: 0;

  background:
    rgba(255,255,255,.32);

  box-shadow: none;
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

  font-size: 27px;

  font-weight: 700;
}

.percent {

  color: #174a68;

  font-size: 25px;

  font-weight: 700;
}

.progress-track {

  width: 100%;

  height: 24px;

  padding: 4px;

  overflow: hidden;

  border-radius: 20px;

  background: #d9eef1;
}

.progress-fill {

  width: ${progressValue}%;

  height: 16px;

  border-radius: 18px;

  background:
    linear-gradient(
      90deg,
      #18a276,
      #39b993
    );
}

.progress-meta {

  display: flex;

  flex-direction: row-reverse;

  justify-content: space-between;

  margin-top: 9px;

  color: #5c7c7a;

  font-size: 20px;
}

/* =========================
   STATS
========================= */

.stats {

  display: flex;

  flex-direction: row-reverse;

  gap: 10px;

  margin-top: 11px;
}

.stat {

  flex: 1;

  min-height: 108px;

  padding:
    10px
    9px;

  border-radius: 0;

  border: none;

  border-top:
    2px solid
    #d9e9f2;

  border-bottom:
    2px solid
    #d9e9f2;

  background:
    rgba(255,255,255,.28);

  text-align: center;

  box-shadow: none;
}

.stat-icon {

  font-size: 37px;

  line-height: 1;

  margin-bottom: 8px;
}

.stat-label {

  color: #7a728e;

  font-size: 18px;

  margin-bottom: 4px;
}

.stat-value {

  color: #3c326d;

  font-size: 23px;

  font-weight: 700;

  line-height: 1.35;
}

/* =========================
   EVENTS
========================= */

.events-panel {

  margin-top: 11px;

  padding:
    16px
    24px;

  border-radius: 0;

  border: none;

  border-top:
    3px solid
    #f3a51c;

  border-bottom:
    2px solid
    #f3d48e;

  background:
    rgba(255,250,237,.34);

  box-shadow: none;

  direction: rtl;

  text-align: right;
}

.events-heading {

  display: block;

  margin-bottom: 13px;

  color: #d47700;

  font-size: 30px;

  font-weight: 700;

  text-align: right;
}

.event-row {

  display: flex;

  flex-direction: row-reverse;

  align-items: flex-start;

  gap: 12px;

  padding: 6px 0;

  border-bottom:
    1px solid
    #f3e6cb;

  color: #3b4e5c;

  font-size: 26px;

  line-height: 1.45;

  text-align: right;
}

.event-row:last-child {

  border-bottom: none;
}

.event-icon {

  flex:
    0 0 30px;

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

/* =========================
   QUOTE
========================= */

.quote-panel {

  margin-top: 10px;

  padding:
    15px
    24px;

  position: relative;

  overflow: hidden;

  border-radius: 0;

  border: none;

  border-top:
    3px solid
    #7666d8;

  border-bottom:
    2px solid
    #c9c1f1;

  background:
    rgba(247,244,255,.34);

  box-shadow: none;

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

  font-size: 30px;

  font-weight: 700;

  text-align: right;
}

.quote {

  position: relative;

  z-index: 2;

  color: #273d56;

  font-size: 28px;

  line-height: 1.45;

  font-weight: 700;

  text-align: right;
}

.quote-author {

  margin-top: 8px;

  color: #716a84;

  font-size: 18px;

  text-align: right;
}

/* =========================
   THOUGHT
========================= */

.thought-panel {

  margin-top: 10px;

  padding:
    15px
    24px;

  position: relative;

  overflow: hidden;

  border-radius: 0;

  border: none;

  border-top:
    3px solid
    #10a6a6;

  border-bottom:
    2px solid
    #9be0e0;

  background:
    rgba(239,255,255,.34);

  box-shadow: none;

  direction: rtl;

  text-align: right;
}

.thought-heading {

  margin-bottom: 9px;

  color: #087d80;

  font-size: 30px;

  font-weight: 700;

  text-align: right;
}

.thought {

  color: #163f57;

  font-size: 28px;

  line-height: 1.45;

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

/* =========================
   FOOTER
========================= */

.footer {

  margin-top: auto;

  height: 6px;

  padding: 0;

  margin-top: 4px;
}

.footer-line {

  width: 150px;

  height: 3px;

  margin:
    0
    auto
    10px;

  border-radius: 5px;

  background:
    linear-gradient(
      90deg,
      #e8a32b,
      #1b7197
    );
}

</style>
</head>

<body>

<div class="page">

  <section class="hero">

    <div class="hero-title">

      <div class="hero-title-main">
        تقویم روزانه گروه صدای کارکنان ثبت احوال
      </div>

      <div class="hero-title-sub">
        روزت پر از اتفاقات خوب ☀️
      </div>

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

  <footer class="footer"></footer>

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
        new Uint8Array(png)
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
 * وضعیت ارسال تقویم از تنظیمات Supabase خوانده می‌شود.
 * اگر تنظیمات در دسترس نباشد،
 * رفتار پیش‌فرض فعال بودن است.
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

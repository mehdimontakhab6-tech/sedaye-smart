import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

const TEHRAN_TZ = "Asia/Tehran";

const WIDTH = 1024;
const HEIGHT = 1700;

const DAILY_QUOTES: string[] = [
  "موفقیت نتیجه تلاش‌های کوچک و پیوسته است.",
  "آینده متعلق به کسانی است که امروز برای آن تلاش می‌کنند.",
  "هیچ موفقیتی بدون پشتکار به دست نمی‌آید.",
  "دانایی آغاز توانایی است.",
  "بهترین راه پیش‌بینی آینده، ساختن آن است.",
  "امید، نیرویی است که انسان را به حرکت وامی‌دارد.",
  "کار نیک اگر با نیت درست انجام شود، اثر ماندگار دارد.",
  "صبر، همراه همیشگی موفقیت‌های بزرگ است.",
  "انسان با انتخاب‌هایش آینده خود را می‌سازد.",
  "تلاش مداوم، فاصله میان آرزو و واقعیت را کم می‌کند.",
  "هر روز فرصتی تازه برای آغاز دوباره است.",
  "بزرگ‌ترین پیروزی، غلبه بر ناامیدی است.",
  "راه هزار کیلومتری با یک قدم آغاز می‌شود.",
  "کسی که یاد می‌گیرد، هرگز شکست‌خورده واقعی نیست.",
  "ارزش انسان به اندازه آرزوهای بزرگ اوست.",
  "آرامش نتیجه پذیرش، تلاش و توکل است.",
  "آنچه امروز انجام می‌دهی، فردای تو را می‌سازد.",
  "هیچ درختی یک‌شبه به بار نمی‌نشیند.",
  "دانش زمانی ارزشمند است که به عمل تبدیل شود.",
  "برای تغییر زندگی، ابتدا باید نگرش خود را تغییر داد.",
  "انسان بزرگ از اشتباه خود درس می‌گیرد.",
  "پشتکار، فاصله میان توانستن و نتوانستن را از بین می‌برد.",
  "هر شکست می‌تواند مقدمه یک پیروزی بزرگ باشد.",
  "خوبی کردن، همیشه ارزشمندتر از خوب به نظر رسیدن است.",
  "اگر هدف روشن باشد، مسیر نیز پیدا می‌شود.",
  "موفقیت واقعی زمانی است که از مسیر خود نیز لذت ببری.",
  "هیچ تلاشی که با نیت درست انجام شود، بی‌ثمر نمی‌ماند.",
  "امروز همان فردایی است که دیروز برایش تصمیم گرفتی.",
  "به جای ترس از تغییر، از درجا زدن بترس.",
  "زندگی با امید زیباتر و با تلاش پربارتر می‌شود.",
  "آدمی با استمرار، کارهای دشوار را ممکن می‌کند.",
];

const DAILY_THOUGHTS: string[] = [
  "امروز چه کار کوچکی می‌توانم انجام دهم که فردایم را بهتر کند؟",
  "گاهی یک تصمیم ساده می‌تواند مسیر یک زندگی را تغییر دهد.",
  "اگر امروز را دوباره زندگی می‌کردی، چه چیزی را متفاوت انجام می‌دادی؟",
  "آرامش زمانی آغاز می‌شود که آنچه را نمی‌توانی تغییر دهی، بپذیری.",
  "هر انسانی بیش از آنچه فکر می‌کند توانایی تغییر دارد.",
  "شاید بهترین اتفاق امروز، همان فرصتی باشد که ابتدا یک مشکل به نظر می‌رسد.",
  "گاهی باید آهسته‌تر رفت تا زیبایی مسیر را دید.",
  "ارزش یک روز به تعداد ساعت‌های آن نیست؛ به کیفیت لحظه‌های آن است.",
  "امروز به یک نفر کمک کن بدون اینکه انتظار جبران داشته باشی.",
  "گاهی سکوت، بهترین پاسخ به شلوغی‌های ذهن است.",
  "از خودت بپرس: چه چیزی واقعاً ارزش نگرانی دارد؟",
  "گذشته برای درس گرفتن است، نه برای زندگی کردن دوباره.",
  "آینده از همین لحظه‌هایی ساخته می‌شود که اکنون در اختیار ما هستند.",
  "اگر امروز فقط یک قدم برداری، باز هم از دیروز جلوتر هستی.",
  "گاهی باید از نو شروع کرد؛ شروع دوباره نشانه شکست نیست.",
  "آنچه به دیگران می‌بخشی، بخشی از شخصیت خودت را نشان می‌دهد.",
  "هر روز می‌تواند آغاز یک عادت خوب باشد.",
  "آیا برای چیزهایی که داری به اندازه چیزهایی که می‌خواهی شکرگزار هستی؟",
  "گاهی یک لبخند ساده می‌تواند روز یک انسان را تغییر دهد.",
  "موفقیت فقط رسیدن نیست؛ بهتر شدن در مسیر رسیدن است.",
  "به جای مقایسه خودت با دیگران، خود امروزت را با دیروزت مقایسه کن.",
  "زمانی که برای خودت ارزش قائل شوی، انتخاب‌هایت نیز تغییر می‌کنند.",
  "چه چیزی را باید رها کنی تا برای اتفاق‌های بهتر جا باز شود؟",
  "زندگی همیشه طبق برنامه پیش نمی‌رود؛ اما همیشه چیزی برای آموختن دارد.",
  "امروز فرصت داری نسخه بهتری از خودت باشی.",
  "گاهی بزرگ‌ترین شجاعت، ادامه دادن در روزهای سخت است.",
  "اگر آرامش می‌خواهی، از چیزهایی که کنترلشان در اختیار تو نیست فاصله بگیر.",
  "هر لحظه می‌تواند نقطه شروع یک تغییر مثبت باشد.",
  "آیا کاری که امروز انجام می‌دهی با ارزش‌هایی که به آن‌ها باور داری هماهنگ است؟",
  "گاهی کمتر داشتن، اما آرام‌تر زندگی کردن، یک موفقیت بزرگ است.",
  "زندگی کوتاه‌تر از آن است که تمام آن را صرف نگرانی از قضاوت دیگران کنیم.",
];

function normalizePersian(value: unknown): string {
  return String(value ?? "")
    .replace(/ي/g, "ی")
    .replace(/ى/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toPersianDigits(value: string | number): string {
  return String(value).replace(
    /\d/g,
    (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)],
  );
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * مهم:
 * از en-US-u-ca-persian استفاده می‌کنیم تا سال/ماه/روز
 * به شکل عدد لاتین برگردد و Number() مقدار NaN ندهد.
 */
function getPersianDate(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    timeZone: TEHRAN_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  const parts = formatter.formatToParts(date);

  const yearText =
    parts.find((part) => part.type === "year")?.value ?? "0";

  const monthText =
    parts.find((part) => part.type === "month")?.value ?? "0";

  const dayText =
    parts.find((part) => part.type === "day")?.value ?? "0";

  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    year <= 0 ||
    month <= 0 ||
    day <= 0
  ) {
    throw new Error(
      `Invalid Persian date: year=${yearText}, month=${monthText}, day=${dayText}`,
    );
  }

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

function getTime(date: Date): string {
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: TEHRAN_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
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

function getMonthName(month: number): string {
  const months = [
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

  return months[month] ?? "";
}

function getPersianDateText(
  year: number,
  month: number,
  day: number,
): string {
  return `${toPersianDigits(day)} ${getMonthName(month)} ${toPersianDigits(year)}`;
}

function getDayOfYear(month: number, day: number): number {
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

  let result = day;

  for (let i = 0; i < month - 1; i++) {
    result += monthLengths[i];
  }

  return result;
}

function getYearDays(year: number): number {
  try {
    const start = new Date(Date.UTC(year + 621, 2, 20));
    const next = new Date(Date.UTC(year + 622, 2, 20));

    const days = Math.round(
      (next.getTime() - start.getTime()) / 86400000,
    );

    return days === 366 ? 366 : 365;
  } catch {
    return 365;
  }
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

function getMoonPhase(): string {
  const cycle = 29.530588;
  const knownNewMoon = Date.UTC(2024, 0, 11);
  const now = Date.now();

  const days = (now - knownNewMoon) / 86400000;
  const phase = ((days % cycle) + cycle) % cycle;

  if (phase < 1.8) return "ماه نو 🌑";
  if (phase < 7.4) return "هلال افزاینده 🌒";
  if (phase < 8.8) return "تربیع اول 🌓";
  if (phase < 14.8) return "ماه افزاینده 🌔";
  if (phase < 16.8) return "ماه کامل 🌕";
  if (phase < 22.1) return "ماه کاهنده 🌖";
  if (phase < 23.7) return "تربیع آخر 🌗";

  return "هلال کاهنده 🌘";
}

function getDailyContent(dayOfMonth: number) {
  const index =
    ((dayOfMonth - 1) % 31 + 31) % 31;

  return {
    quote: DAILY_QUOTES[index],
    thought: DAILY_THOUGHTS[index],
  };
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

    const year =
      parts.find((part) => part.type === "year")?.value;

    const month =
      parts.find((part) => part.type === "month")?.value;

    const day =
      parts.find((part) => part.type === "day")?.value;

    if (!year || !month || !day) {
      return null;
    }

    const response = await fetch(
      `https://api.aladhan.com/v1/gToH?date=${day}-${month}-${year}`,
      {
        headers: {
          Accept: "application/json",
        },
      },
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
      for (const value of Object.values(data)) {
        if (Array.isArray(value)) {
          candidates.push(...value);
        } else if (
          value &&
          typeof value === "object"
        ) {
          for (const nested of Object.values(value)) {
            if (Array.isArray(nested)) {
              candidates.push(...nested);
            }
          }
        }
      }
    }

    const result: string[] = [];

    for (const item of candidates) {
      if (!item) continue;

      const rawDate = String(
        item.date ??
          item.shamsi ??
          item.persianDate ??
          "",
      );

      const normalized = normalizePersian(rawDate)
        .replace(
          /[۰-۹]/g,
          (digit) =>
            String(
              "۰۱۲۳۴۵۶۷۸۹".indexOf(digit),
            ),
        );

      const match = normalized.match(
        /(\d{1,4})\D+(\d{1,2})\D+(\d{1,2})/,
      );

      let matched = false;

      if (match) {
        const month = Number(match[2]);
        const day = Number(match[3]);

        matched =
          month === persianMonth &&
          day === persianDay;
      } else {
        const shortMatch = normalized.match(
          /(\d{1,2})\D+(\d{1,2})/,
        );

        if (shortMatch) {
          const month = Number(shortMatch[1]);
          const day = Number(shortMatch[2]);

          matched =
            month === persianMonth &&
            day === persianDay;
        }
      }

      if (!matched) continue;

      const title =
        item.title ??
        item.name ??
        item.event ??
        item.description;

      if (title) {
        const clean = normalizePersian(title);

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

function buildHtml({
  date,
  persianYear,
  persianMonth,
  persianDay,
  hijri,
  events,
  content,
  progressPercent,
  dayOfYear,
  totalDays,
  remainingDays,
}: {
  date: Date;
  persianYear: number;
  persianMonth: number;
  persianDay: number;
  hijri: any;
  events: string[];
  content: {
    quote: string;
    thought: string;
  };
  progressPercent: number;
  dayOfYear: number;
  totalDays: number;
  remainingDays: number;
}) {
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

  const moon = getMoonPhase();

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
      : `
        <div class="event-item">
          <span class="event-dot">●</span>
          <span>مناسبت ویژه‌ای برای امروز ثبت نشده است.</span>
        </div>
      `;

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1024">
<title>تقویم روزانه گروه صدای کارکنان ثبت احوال</title>

<style>

*{
  box-sizing:border-box;
}

html,
body{
  margin:0;
  padding:0;
  width:${WIDTH}px;
  min-height:${HEIGHT}px;
  direction:rtl;
  font-family:Arial,"Tahoma",sans-serif;
  background:#eef3f6;
}

body{
  overflow:hidden;
}

.canvas{
  width:${WIDTH}px;
  min-height:${HEIGHT}px;
  padding:38px 42px 40px;
  direction:rtl;

  background:
    linear-gradient(
      180deg,
      #edf6fb 0%,
      #ffffff 38%,
      #f5f7f9 100%
    );

  color:#17212b;
}

.hero{
  position:relative;
  width:100%;
  height:225px;
  margin-bottom:24px;

  border-radius:30px;
  overflow:hidden;

  display:flex;
  align-items:center;
  justify-content:center;

  padding:35px;

  background:
    radial-gradient(
      circle at 18% 20%,
      rgba(255,255,255,.32),
      transparent 30%
    ),
    linear-gradient(
      135deg,
      #274d73 0%,
      #4f87a7 52%,
      #8ebccc 100%
    );

  box-shadow:
    0 12px 30px rgba(30,55,75,.16);
}

.hero::after{
  content:"";
  position:absolute;
  inset:0;

  background:
    linear-gradient(
      180deg,
      rgba(255,255,255,.08),
      rgba(0,0,0,.16)
    );
}

.hero-title{
  position:relative;
  z-index:2;

  width:100%;

  text-align:center;

  color:#fff;

  font-size:42px;
  line-height:1.55;

  font-weight:900;

  text-shadow:
    0 3px 12px rgba(0,0,0,.28);
}

.date-panel{
  background:#fff;

  border-radius:26px;

  padding:26px 30px;

  margin-bottom:20px;

  box-shadow:
    0 7px 22px rgba(31,55,73,.08);

  direction:rtl;
}

.date-main{
  text-align:center;

  color:#1f4562;

  font-size:45px;
  line-height:1.5;

  font-weight:900;

  margin-bottom:5px;
}

.weekday{
  text-align:center;

  color:#65737e;

  font-size:27px;

  font-weight:700;

  margin-bottom:19px;
}

.meta-row{
  display:flex;
  gap:15px;

  direction:rtl;
}

.meta-chip{
  flex:1;

  background:#f2f7fa;

  border-radius:18px;

  padding:15px 14px;

  text-align:center;

  color:#334d60;

  font-size:21px;

  font-weight:700;

  line-height:1.8;
}

.progress-panel{
  background:#fff;

  border-radius:26px;

  padding:24px 29px;

  margin-bottom:20px;

  box-shadow:
    0 7px 22px rgba(31,55,73,.08);

  direction:rtl;
}

.panel-title{
  text-align:right;
  direction:rtl;

  color:#23445b;

  font-size:29px;

  font-weight:900;

  margin-bottom:15px;
}

.progress-info{
  display:flex;

  justify-content:space-between;

  align-items:center;

  direction:rtl;

  color:#687680;

  font-size:20px;

  margin-bottom:10px;
}

.progress-bar{
  width:100%;

  height:22px;

  border-radius:20px;

  background:#e7edf1;

  overflow:hidden;

  direction:ltr;
}

.progress-fill{
  height:100%;

  width:${progressPercent}%;

  border-radius:20px;

  background:
    linear-gradient(
      90deg,
      #3d80a6,
      #70afc4
    );
}

.remaining{
  margin-top:11px;

  text-align:right;

  direction:rtl;

  color:#78858e;

  font-size:19px;
}

.stats{
  display:grid;

  grid-template-columns:
    repeat(3,1fr);

  gap:16px;

  margin-bottom:20px;

  direction:rtl;
}

.stat-card{
  background:#fff;

  border-radius:23px;

  padding:19px 12px;

  min-height:125px;

  text-align:center;

  box-shadow:
    0 7px 22px rgba(31,55,73,.08);
}

.stat-icon{
  font-size:32px;

  margin-bottom:4px;
}

.stat-label{
  color:#7a8790;

  font-size:19px;

  margin-bottom:5px;
}

.stat-value{
  color:#274d67;

  font-size:22px;

  font-weight:900;
}

.content-panel{
  background:#fff;

  border-radius:26px;

  padding:24px 29px;

  margin-bottom:19px;

  box-shadow:
    0 7px 22px rgba(31,55,73,.08);

  direction:rtl;

  text-align:right;
}

.content-title{
  display:flex;

  align-items:center;

  justify-content:flex-start;

  gap:10px;

  width:100%;

  direction:rtl;

  text-align:right;

  color:#23445b;

  font-size:29px;

  font-weight:900;

  margin-bottom:14px;
}

.event-item{
  display:flex;

  align-items:flex-start;

  justify-content:flex-start;

  gap:11px;

  direction:rtl;

  text-align:right;

  color:#43525e;

  font-size:22px;

  line-height:1.85;

  margin-bottom:8px;
}

.event-dot{
  color:#4a91ad;

  font-size:14px;

  margin-top:7px;

  flex-shrink:0;
}

.quote-text,
.thought-text{
  width:100%;

  direction:rtl;

  text-align:right;

  color:#354a57;

  font-size:24px;

  line-height:2;

  font-weight:600;
}

.quote-text::before{
  content:"«";

  color:#70a8bb;

  font-size:36px;

  font-weight:900;

  margin-left:5px;
}

.quote-text::after{
  content:"»";

  color:#70a8bb;

  font-size:36px;

  font-weight:900;

  margin-right:5px;
}

.bottom-space{
  height:10px;
}

</style>
</head>

<body>

<div class="canvas">

<section class="hero">
  <div class="hero-title">
    تقویم روزانه گروه صدای کارکنان ثبت احوال
  </div>
</section>

<section class="date-panel">

  <div class="date-main">
    ${escapeHtml(persianDate)}
  </div>

  <div class="weekday">
    ${escapeHtml(weekday)}
  </div>

  <div class="meta-row">

    <div class="meta-chip">
      📅 میلادی<br>
      ${escapeHtml(gregorianDate)}
    </div>

    <div class="meta-chip">
      🌙 قمری<br>
      ${escapeHtml(hijriText)}
    </div>

    <div class="meta-chip">
      🕐 ساعت<br>
      ${escapeHtml(time)}
    </div>

  </div>

</section>

<section class="progress-panel">

  <div class="panel-title">
    📊 پیشرفت سال
  </div>

  <div class="progress-info">

    <span>
      روز ${toPersianDigits(dayOfYear)}
      از ${toPersianDigits(totalDays)}
    </span>

    <span>
      ${toPersianDigits(progressPercent)}٪
    </span>

  </div>

  <div class="progress-bar">
    <div class="progress-fill"></div>
  </div>

  <div class="remaining">
    ${toPersianDigits(remainingDays)}
    روز تا پایان سال باقی مانده است.
  </div>

</section>

<section class="stats">

  <div class="stat-card">

    <div class="stat-icon">
      🌙
    </div>

    <div class="stat-label">
      وضعیت ماه
    </div>

    <div class="stat-value">
      ${escapeHtml(moon)}
    </div>

  </div>

  <div class="stat-card">

    <div class="stat-icon">
      ♈
    </div>

    <div class="stat-label">
      برج
    </div>

    <div class="stat-value">
      ${escapeHtml(zodiac)}
    </div>

  </div>

  <div class="stat-card">

    <div class="stat-icon">
      🐾
    </div>

    <div class="stat-label">
      سال حیوانی
    </div>

    <div class="stat-value">
      ${escapeHtml(animal)}
    </div>

  </div>

</section>

<section class="content-panel">

  <div class="content-title">
    📌
    <span>رویدادها و مناسبت‌ها</span>
  </div>

  ${eventHtml}

</section>

<section class="content-panel">

  <div class="content-title">
    💬
    <span>سخن بزرگان</span>
  </div>

  <div class="quote-text">
    ${escapeHtml(content.quote)}
  </div>

</section>

<section class="content-panel">

  <div class="content-title">
    💭
    <span>جرعه‌ای تفکر</span>
  </div>

  <div class="thought-text">
    ${escapeHtml(content.thought)}
  </div>

</section>

<div class="bottom-space"></div>

</div>

</body>
</html>`;
}

export async function GET() {
  try {
    const date = new Date();

    const {
      year: persianYear,
      month: persianMonth,
      day: persianDay,
    } = getPersianDate(date);

    const dayOfYear =
      getDayOfYear(
        persianMonth,
        persianDay,
      );

    const totalDays =
      getYearDays(persianYear);

    const remainingDays =
      Math.max(
        0,
        totalDays - dayOfYear,
      );

    const progressPercent =
      Math.min(
        100,
        Math.max(
          0,
          Math.round(
            (dayOfYear / totalDays) * 100,
          ),
        ),
      );

    const content =
      getDailyContent(persianDay);

    const [hijri, events] =
      await Promise.all([
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

      progressPercent,
      dayOfYear,
      totalDays,
      remainingDays,
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
            "Cloudflare Browser binding BROWSER is not configured.",
        },
        { status: 500 },
      );
    }

    /*
     * Cloudflare Browser Run
     *
     * خروجی Screenshot یک Response است.
     * بنابراین مستقیماً arrayBuffer می‌گیریم.
     */
    const screenshot =
      await env.BROWSER.quickAction(
        "screenshot",
        {
          html,

          screenshotOptions: {
            type: "png",
            fullPage: true,
            omitBackground: false,
          },

          viewport: {
            width: WIDTH,
            height: 900,
            deviceScaleFactor: 1,
          },
        },
      );

    if (!screenshot) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Screenshot generation failed.",
        },
        { status: 500 },
      );
    }

    let imageBuffer: ArrayBuffer;

    if (screenshot instanceof Response) {
      imageBuffer =
        await screenshot.arrayBuffer();
    } else if (
      screenshot instanceof ArrayBuffer
    ) {
      imageBuffer = screenshot;
    } else {
      imageBuffer =
        await new Response(
          screenshot as any,
        ).arrayBuffer();
    }

    if (
      !imageBuffer ||
      imageBuffer.byteLength === 0
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Screenshot returned an empty file.",
        },
        { status: 500 },
      );
    }

    const token =
      env.BALE_SMART_TOKEN;

    const groupId =
      env.BALE_GROUP_ID;

    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "BALE_SMART_TOKEN is missing.",
        },
        { status: 500 },
      );
    }

    if (!groupId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "BALE_GROUP_ID is missing.",
        },
        { status: 500 },
      );
    }

    /*
     * فایل PNG را به‌صورت واقعی به FormData
     * اضافه می‌کنیم.
     */
    const form =
      new FormData();

    form.append(
      "chat_id",
      String(groupId),
    );

    form.append(
      "caption",
      "تقویم روزانه گروه صدای کارکنان ثبت احوال",
    );

    const blob =
      new Blob(
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

    const baleResponse =
      await fetch(
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

    const sent =
      baleResponse.ok &&
      baleData?.ok === true;

    return NextResponse.json({
      ok: true,

      cancelled: false,

      sent,

      bale_status:
        baleResponse.status,

      bale: baleData,

      date: {
        solar:
          `${persianYear}/${persianMonth}/${persianDay}`,

        solar_persian:
          `${toPersianDigits(persianYear)}/${toPersianDigits(persianMonth)}/${toPersianDigits(persianDay)}`,

        weekday:
          getWeekday(date),

        time:
          getTime(date),
      },

      content: {
        quote:
          content.quote,

        thought:
          content.thought,

        day:
          persianDay,

        day_persian:
          toPersianDigits(
            persianDay,
          ),
      },

      image: {
        format: "png",

        bytes:
          imageBuffer.byteLength,

        width:
          WIDTH,

        height:
          HEIGHT,
      },

      design: {
        title:
          "تقویم روزانه گروه صدای کارکنان ثبت احوال",

        title_only_at_top:
          true,

        top_left_duplicate:
          false,

        bottom_duplicate:
          false,

        right_aligned_sections:
          true,

        larger_text:
          true,

        unique_daily_content:
          true,

        unique_content_days:
          31,
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

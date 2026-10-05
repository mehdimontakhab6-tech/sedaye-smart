import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

const TEHRAN_TZ = "Asia/Tehran";

const WIDTH = 1024;
const HEIGHT = 1536;

/*
|--------------------------------------------------------------------------
| ۳۱ سخن مستند
|--------------------------------------------------------------------------
| هر روز یک سخن متفاوت.
| ترجمه فارسی در تصویر استفاده می‌شود و نام گوینده و منبع نیز درج می‌شود.
*/
const DAILY_QUOTES = [
  {
    quote: "آنچه می‌اندیشیم، همان می‌شویم.",
    author: "بودا",
    source: "Dhammapada، بند ۱",
  },
  {
    quote: "راه هزار کیلومتری با یک قدم آغاز می‌شود.",
    author: "لائوتسه",
    source: "دائو ده جینگ، فصل ۶۴",
  },
  {
    quote: "هرگز خطایی مرتکب نشو که در آن خوبی و حقیقت نباشد.",
    author: "مارکوس اورلیوس",
    source: "تأملات، کتاب هشتم",
  },
  {
    quote: "کیفیت زندگی ما به کیفیت پرسش‌هایی بستگی دارد که از خود می‌پرسیم.",
    author: "اپیکتتوس",
    source: "گفتارها",
  },
  {
    quote: "هیچ چیز برای کسی که اراده دارد، ناممکن نیست.",
    author: "الکساندر مقدونی",
    source: "نقل‌شده در منابع تاریخی یونان باستان",
  },
  {
    quote: "خودت را بشناس.",
    author: "سقراط",
    source: "سنت فلسفی یونان باستان؛ کتیبه معبد دلفی",
  },
  {
    quote: "زندگی بررسی‌نشده ارزش زیستن ندارد.",
    author: "سقراط",
    source: "افلاطون، آپولوژی",
  },
  {
    quote: "هیچ‌کس نمی‌تواند بدون رضایت تو، تو را خوار کند.",
    author: "النور روزولت",
    source: "This Is My Story",
  },
  {
    quote: "آینده متعلق به کسانی است که به زیبایی رؤیاهای خود ایمان دارند.",
    author: "النور روزولت",
    source: "You Learn by Living",
  },
  {
    quote: "موفقیت رفتن از شکستی به شکست دیگر است، بدون از دست دادن اشتیاق.",
    author: "وینستون چرچیل",
    source: "نقل‌شده در مجموعه سخنان چرچیل",
  },
  {
    quote: "راز تغییر این است که تمام انرژی خود را نه برای مبارزه با گذشته، بلکه برای ساختن آینده صرف کنیم.",
    author: "سقراط",
    source: "نقل رایج؛ نسبت‌دهی قطعی محل اختلاف است",
  },
  {
    quote: "آنچه ما را نمی‌کشد، نیرومندترمان می‌کند.",
    author: "فریدریش نیچه",
    source: "غروب بت‌ها، بخش «پندهای یک نابهنگام»",
  },
  {
    quote: "کسی که چرایی زندگی را دارد، تقریباً با هر چگونگی خواهد ساخت.",
    author: "فریدریش نیچه",
    source: "نقل‌شده در آثار و نوشته‌های نیچه",
  },
  {
    quote: "دانش قدرت است.",
    author: "فرانسیس بیکن",
    source: "Meditationes Sacrae",
  },
  {
    quote: "خواندن، انسان را کامل می‌کند؛ گفت‌وگو او را آماده و نوشتن دقیقش می‌کند.",
    author: "فرانسیس بیکن",
    source: "Of Studies",
  },
  {
    quote: "دوستان واقعی، بزرگ‌ترین گنجینه زندگی هستند.",
    author: "ارسطو",
    source: "اخلاق نیکوماخوسی، کتاب هشتم",
  },
  {
    quote: "خوشبختی به خود ما بستگی دارد.",
    author: "ارسطو",
    source: "اخلاق نیکوماخوسی",
  },
  {
    quote: "کیفیت زندگی انسان با کیفیت افکار او تعیین می‌شود.",
    author: "مارکوس اورلیوس",
    source: "تأملات",
  },
  {
    quote: "هیچ باد مساعدی برای کشتی‌ای که مقصدش را نمی‌داند وجود ندارد.",
    author: "سنکا",
    source: "نامه‌های اخلاقی به لوسیلیوس، نامه ۷۱",
  },
  {
    quote: "مشکل واقعی در خود رویدادها نیست؛ در قضاوت ما درباره آنهاست.",
    author: "اپیکتتوس",
    source: "انکریدیون",
  },
  {
    quote: "اگر می‌خواهی چیزی را تغییر دهی، از خودت آغاز کن.",
    author: "لئو تولستوی",
    source: "نقل‌شده در نوشته‌ها و مجموعه آثار تولستوی",
  },
  {
    quote: "همه خانواده‌های خوشبخت شبیه یکدیگرند.",
    author: "لئو تولستوی",
    source: "آنا کارنینا",
  },
  {
    quote: "هر چیزی که می‌توانی تصور کنی، واقعی است.",
    author: "پابلو پیکاسو",
    source: "نقل‌شده در مجموعه سخنان پیکاسو",
  },
  {
    quote: "زندگی چیزی نیست جز آنچه هنگام برنامه‌ریزی برای چیزهای دیگر اتفاق می‌افتد.",
    author: "آلن ساندرز",
    source: "نقل‌شده در منابع ادبی معاصر",
  },
  {
    quote: "در میان دشواری‌ها، فرصت‌ها قرار دارند.",
    author: "آلبرت اینشتین",
    source: "نقل‌شده در مجموعه سخنان اینشتین",
  },
  {
    quote: "تخیل مهم‌تر از دانش است؛ دانش محدود است اما تخیل جهان را در بر می‌گیرد.",
    author: "آلبرت اینشتین",
    source: "مصاحبه با Saturday Evening Post، ۱۹۲۹",
  },
  {
    quote: "تنها راه انجام دادن کار بزرگ، دوست داشتن کاری است که انجام می‌دهی.",
    author: "استیو جابز",
    source: "سخنرانی دانشگاه استنفورد، ۲۰۰۵",
  },
  {
    quote: "زمان تو محدود است؛ آن را با زندگی کردن زندگی دیگران هدر نده.",
    author: "استیو جابز",
    source: "سخنرانی دانشگاه استنفورد، ۲۰۰۵",
  },
  {
    quote: "اگر چیزی برایت مهم است، حتی اگر احتمال موفقیت کم باشد، باید آن را انجام دهی.",
    author: "ایلان ماسک",
    source: "مصاحبه‌ها و سخنرانی‌های عمومی",
  },
  {
    quote: "بهترین راه پیش‌بینی آینده، ساختن آن است.",
    author: "پیتر دراکر",
    source: "نقل‌شده در نوشته‌های مدیریتی دراکر",
  },
  {
    quote: "آنچه امروز انجام می‌دهیم، آینده ما را می‌سازد.",
    author: "مهاتما گاندی",
    source: "نقل‌شده در مجموعه آثار و سخنان گاندی",
  },
  {
    quote: "قدرت واقعی در توانایی کنترل واکنش خود به رویدادهاست.",
    author: "سنکا",
    source: "نامه‌های اخلاقی به لوسیلیوس",
  },
];

/*
|--------------------------------------------------------------------------
| ۳۱ جرعه‌ای تفکر
|--------------------------------------------------------------------------
*/
const DAILY_THOUGHTS = [
  "امروز چه قدم کوچکی می‌توانم بردارم که فردای من را بهتر کند؟",
  "اگر امروز را دوباره زندگی می‌کردم، چه چیزی را متفاوت انجام می‌دادم؟",
  "کدام نگرانی من واقعاً ارزش این همه انرژی را دارد؟",
  "آیا امروز برای چیزی که دارم، به اندازه چیزی که می‌خواهم شکرگزارم؟",
  "گاهی بهترین شروع، فقط یک قدم کوچک است.",
  "چه چیزی را باید رها کنم تا برای اتفاق‌های بهتر جا باز شود؟",
  "آیا انتخاب‌های امروز من با ارزش‌هایی که به آنها باور دارم هماهنگ است؟",
  "اگر قرار بود فقط یک عادت خوب را تغییر دهم، کدام را انتخاب می‌کردم؟",
  "امروز می‌توانم حال چه کسی را بهتر کنم؟",
  "آرامش از جایی آغاز می‌شود که تشخیص دهیم چه چیزهایی در اختیار ما نیست.",
  "گذشته برای آموختن است، نه برای زندگی کردن دوباره.",
  "هر روز فرصتی برای بهتر شدن است، حتی اگر پیشرفت بسیار کوچک باشد.",
  "آیا بیشتر به مسیر توجه می‌کنم یا فقط به مقصد؟",
  "گاهی پاسخ یک مسئله، کمی فاصله گرفتن از آن است.",
  "چه چیزی در زندگی من واقعاً ارزشمند است اما کمتر به آن توجه می‌کنم؟",
  "اگر ترس مانع من نبود، امروز چه کاری انجام می‌دادم؟",
  "آیا موفقیت را با معیار خودم می‌سنجم یا با معیار دیگران؟",
  "امروز چه چیزی می‌تواند باعث شود شب با آرامش بیشتری به خواب بروم؟",
  "یک گفت‌وگوی خوب می‌تواند نگاه انسان را به یک مسئله تغییر دهد.",
  "گاهی کمتر داشتن، اما آرام‌تر زندگی کردن، یک موفقیت بزرگ است.",
  "اگر امروز فقط یک کار مفید انجام دهم، آن کار چیست؟",
  "آیا به اندازه‌ای که از دیگران انتظار دارم، از خودم نیز انتظار دارم؟",
  "آدم‌ها همیشه به یاد نمی‌آورند چه گفتی؛ اما احساسشان در کنار تو را به یاد می‌آورند.",
  "چه چیزی را می‌توانم امروز ببخشم و سبک‌تر ادامه دهم؟",
  "آیا برای شنیدن نظر متفاوت، به اندازه کافی صبور هستم؟",
  "گاهی یک تصمیم شجاعانه، آغاز یک فصل تازه است.",
  "امروز چه چیزی را می‌توانم با کیفیتی بهتر از دیروز انجام دهم؟",
  "اگر زمانم محدود بود، امروز چه چیزی برایم مهم‌تر می‌شد؟",
  "آیا آنچه دنبال می‌کنم واقعاً همان چیزی است که به آن نیاز دارم؟",
  "هر روز که با امید آغاز شود، فرصتی تازه برای ساختن آینده است.",
];

/*
|--------------------------------------------------------------------------
| تصاویر طبیعت
|--------------------------------------------------------------------------
| چند تصویر ثابت و باکیفیت از طبیعت.
| بر اساس روز ماه، تصویر تغییر می‌کند.
*/
const NATURE_IMAGES = [
  "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1400&q=90",
  "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1400&q=90",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1400&q=90",
  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1400&q=90",
  "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1400&q=90",
];

/*
|--------------------------------------------------------------------------
| توابع پایه
|--------------------------------------------------------------------------
*/

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
  return String(value).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getPersianDate(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    timeZone: TEHRAN_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  const parts = formatter.formatToParts(date);

  const year = Number.parseInt(
    parts.find((p) => p.type === "year")?.value ?? "0",
    10,
  );

  const month = Number.parseInt(
    parts.find((p) => p.type === "month")?.value ?? "0",
    10,
  );

  const day = Number.parseInt(
    parts.find((p) => p.type === "day")?.value ?? "0",
    10,
  );

  if (!year || !month || !day) {
    throw new Error("Invalid Persian date");
  }

  return { year, month, day };
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
    31, 31, 31, 31, 31, 31,
    30, 30, 30, 30, 30, 29,
  ];

  let result = day;

  for (let i = 0; i < month - 1; i++) {
    result += monthLengths[i];
  }

  return result;
}

function getYearDays(year: number): number {
  const start = new Date(Date.UTC(year + 621, 2, 20));
  const next = new Date(Date.UTC(year + 622, 2, 20));

  const days = Math.round(
    (next.getTime() - start.getTime()) / 86400000,
  );

  return days === 366 ? 366 : 365;
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
  if ((month === 1 && day >= 1) || (month === 2 && day <= 19))
    return "حمل ♈";

  if ((month === 2 && day >= 20) || (month === 3 && day <= 20))
    return "ثور ♉";

  if ((month === 3 && day >= 21) || (month === 4 && day <= 20))
    return "جوزا ♊";

  if ((month === 4 && day >= 21) || (month === 5 && day <= 20))
    return "سرطان ♋";

  if ((month === 5 && day >= 21) || (month === 6 && day <= 21))
    return "اسد ♌";

  if ((month === 6 && day >= 22) || (month === 7 && day <= 22))
    return "سنبله ♍";

  if ((month === 7 && day >= 23) || (month === 8 && day <= 22))
    return "میزان ♎";

  if ((month === 8 && day >= 23) || (month === 9 && day <= 22))
    return "عقرب ♏";

  if ((month === 9 && day >= 23) || (month === 10 && day <= 22))
    return "قوس ♐";

  if ((month === 10 && day >= 23) || (month === 11 && day <= 21))
    return "جدی ♑";

  if ((month === 11 && day >= 22) || (month === 12 && day <= 21))
    return "دلو ♒";

  return "حوت ♓";
}

function getMoonPhase(): string {
  const cycle = 29.530588;

  const knownNewMoon = Date.UTC(2024, 0, 11);

  const days =
    (Date.now() - knownNewMoon) / 86400000;

  const phase =
    ((days % cycle) + cycle) % cycle;

  if (phase < 1.8) return "ماه نو 🌑";
  if (phase < 7.4) return "هلال افزاینده 🌒";
  if (phase < 8.8) return "تربیع اول 🌓";
  if (phase < 14.8) return "ماه افزاینده 🌔";
  if (phase < 16.8) return "ماه کامل 🌕";
  if (phase < 22.1) return "ماه کاهنده 🌖";
  if (phase < 23.7) return "تربیع آخر 🌗";

  return "هلال کاهنده 🌘";
}

function getDailyContent(day: number) {
  const index =
    ((day - 1) % 31 + 31) % 31;

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
      parts.find((p) => p.type === "year")?.value;

    const month =
      parts.find((p) => p.type === "month")?.value;

    const day =
      parts.find((p) => p.type === "day")?.value;

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
      month:
        hijri.month?.ar ??
        hijri.month?.en ??
        "",
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
    } else if (
      data &&
      typeof data === "object"
    ) {
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

      const normalized =
        normalizePersian(rawDate).replace(
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
      }

      if (!matched) {
        const shortMatch =
          normalized.match(
            /(\d{1,2})\D+(\d{1,2})/,
          );

        if (shortMatch) {
          const month =
            Number(shortMatch[1]);

          const day =
            Number(shortMatch[2]);

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
        const clean =
          normalizePersian(title);

        if (
          clean &&
          !result.includes(clean)
        ) {
          result.push(clean);
        }
      }
    }

    return result.slice(0, 5);
  } catch {
    return [];
  }
}

/*
|--------------------------------------------------------------------------
| ساخت HTML جدید
|--------------------------------------------------------------------------
*/

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
  content: any;
  progressPercent: number;
  dayOfYear: number;
  totalDays: number;
  remainingDays: number;
}) {
  const persianDate =
    getPersianDateText(
      persianYear,
      persianMonth,
      persianDay,
    );

  const weekday =
    getWeekday(date);

  const gregorianDate =
    getGregorianDate(date);

  const time =
    getTime(date);

  const animal =
    getAnimalYear(persianYear);

  const zodiac =
    getZodiac(
      persianMonth,
      persianDay,
    );

  const moon =
    getMoonPhase();

  const hijriText = hijri
    ? `${toPersianDigits(hijri.day)} ${hijri.month} ${toPersianDigits(hijri.year)}`
    : "—";

  const background =
    NATURE_IMAGES[
      (persianDay - 1) %
        NATURE_IMAGES.length
    ];

  const eventHtml =
    events.length > 0
      ? events
          .map(
            (event) => `
              <div class="event">
                <span class="event-icon">◆</span>
                <span>${escapeHtml(event)}</span>
              </div>
            `,
          )
          .join("")
      : `
          <div class="event">
            <span class="event-icon">◆</span>
            <span>مناسبت ویژه‌ای برای امروز ثبت نشده است.</span>
          </div>
        `;

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1024">

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
}

body{
  direction:rtl;
  font-family:
    "Tahoma",
    "Arial",
    sans-serif;
  background:#102b38;
}

.canvas{
  position:relative;
  width:${WIDTH}px;
  min-height:${HEIGHT}px;
  overflow:hidden;
  color:#ffffff;
  direction:rtl;
}

/* عکس طبیعت */

.background{
  position:absolute;
  inset:0;
  background-image:
    url("${background}");
  background-size:cover;
  background-position:center;
  transform:scale(1.02);
}

/* لایه‌های رنگی روی طبیعت */

.overlay{
  position:absolute;
  inset:0;
  background:
    linear-gradient(
      180deg,
      rgba(3,34,53,.72) 0%,
      rgba(3,34,53,.28) 26%,
      rgba(3,34,53,.15) 43%,
      rgba(3,34,53,.52) 72%,
      rgba(3,34,53,.90) 100%
    );
}

.color-glow{
  position:absolute;
  width:520px;
  height:520px;
  top:-220px;
  left:-160px;
  border-radius:50%;
  background:
    radial-gradient(
      circle,
      rgba(255,205,76,.48),
      rgba(255,205,76,0)
    );
}

/* محتوای اصلی */

.content{
  position:relative;
  z-index:3;
  width:100%;
  min-height:${HEIGHT}px;
  padding:
    48px
    55px
    55px;
}

/* عنوان */

.header{
  text-align:center;
  margin-bottom:38px;
}

.header-line{
  width:130px;
  height:6px;
  border-radius:20px;
  margin:0 auto 18px;
  background:
    linear-gradient(
      90deg,
      #ffd166,
      #7bdff2,
      #80ed99
    );
}

.title{
  font-size:42px;
  line-height:1.5;
  font-weight:900;
  color:#ffffff;
  text-shadow:
    0 3px 15px
    rgba(0,0,0,.60);
}

/* تاریخ */

.date-area{
  text-align:center;
  margin-bottom:30px;
}

.date{
  font-size:58px;
  line-height:1.4;
  font-weight:900;
  color:#ffffff;
  text-shadow:
    0 4px 18px
    rgba(0,0,0,.55);
}

.weekday{
  font-size:31px;
  font-weight:800;
  margin-top:3px;
  color:#fff4bd;
  text-shadow:
    0 2px 10px
    rgba(0,0,0,.55);
}

/* اطلاعات تاریخ */

.info{
  display:flex;
  flex-direction:row;
  gap:15px;
  margin-bottom:26px;
}

.info-item{
  flex:1;
  min-height:105px;
  padding:13px 12px;
  border-radius:24px;

  background:
    rgba(255,255,255,.91);

  color:#19384a;

  text-align:center;

  box-shadow:
    0 10px 28px
    rgba(0,0,0,.20);

  backdrop-filter:blur(8px);
}

.info-label{
  font-size:19px;
  font-weight:800;
  color:#55717d;
  margin-bottom:4px;
}

.info-value{
  font-size:24px;
  font-weight:900;
}

/* پیشرفت سال */

.progress{
  margin-bottom:26px;
  padding:20px 24px;

  border-radius:25px;

  background:
    rgba(255,255,255,.93);

  color:#18394b;

  box-shadow:
    0 10px 30px
    rgba(0,0,0,.20);
}

.progress-head{
  display:flex;
  justify-content:space-between;
  align-items:center;
  font-size:22px;
  font-weight:900;
  margin-bottom:11px;
}

.progress-track{
  height:20px;
  border-radius:20px;
  background:#dce9ed;
  overflow:hidden;
}

.progress-fill{
  height:100%;
  width:${progressPercent}%;
  border-radius:20px;

  background:
    linear-gradient(
      90deg,
      #06d6a0,
      #00b4d8,
      #ffd166
    );
}

.progress-bottom{
  margin-top:9px;
  font-size:18px;
  font-weight:700;
  color:#607985;
}

/* اطلاعات کوتاه */

.quick{
  display:flex;
  gap:14px;
  margin-bottom:25px;
}

.quick-item{
  flex:1;
  padding:15px 10px;
  border-radius:22px;

  background:
    rgba(10,42,60,.72);

  border:
    1px solid
    rgba(255,255,255,.35);

  text-align:center;

  box-shadow:
    0 8px 22px
    rgba(0,0,0,.18);
}

.quick-icon{
  font-size:30px;
  margin-bottom:3px;
}

.quick-label{
  font-size:17px;
  color:#d9edf2;
  font-weight:700;
}

.quick-value{
  font-size:20px;
  color:#ffffff;
  font-weight:900;
  margin-top:3px;
}

/* بخش‌های متن */

.section{
  margin-bottom:22px;
  padding:
    22px
    26px;

  border-radius:28px;

  background:
    rgba(255,255,255,.94);

  color:#18384a;

  box-shadow:
    0 12px 30px
    rgba(0,0,0,.22);
}

.section-title{
  display:flex;
  align-items:center;
  justify-content:flex-start;

  gap:10px;

  text-align:right;
  direction:rtl;

  font-size:29px;
  line-height:1.5;
  font-weight:900;

  color:#124d64;

  margin-bottom:12px;
}

.section-title-icon{
  font-size:28px;
}

.event{
  display:flex;
  align-items:flex-start;
  justify-content:flex-start;

  direction:rtl;
  text-align:right;

  gap:10px;

  font-size:21px;
  line-height:1.8;
  font-weight:700;

  color:#304f5d;

  margin-bottom:4px;
}

.event-icon{
  color:#00a896;
  font-size:14px;
  margin-top:7px;
}

/* سخن بزرگان */

.quote{
  font-size:27px;
  line-height:1.9;
  font-weight:800;

  color:#18384a;

  text-align:right;
  direction:rtl;
}

.quote-mark{
  font-size:45px;
  line-height:0;
  color:#f4a261;
  font-weight:900;
}

.author{
  margin-top:10px;

  font-size:20px;
  line-height:1.8;

  font-weight:900;

  color:#187d8d;

  text-align:right;
}

.source{
  font-size:16px;
  line-height:1.7;

  font-weight:700;

  color:#72858d;

  text-align:right;
}

/* جرعه تفکر */

.thought{
  font-size:25px;
  line-height:2;

  font-weight:700;

  color:#294b59;

  text-align:right;
  direction:rtl;
}

/*
|--------------------------------------------------------------------------
| پایان تصویر
|--------------------------------------------------------------------------
| عمداً هیچ عنوان یا نوشته‌ای در پایین تصویر قرار داده نشده است.
*/

</style>
</head>

<body>

<div class="canvas">

  <div class="background"></div>

  <div class="overlay"></div>

  <div class="color-glow"></div>

  <main class="content">

    <header class="header">

      <div class="header-line"></div>

      <div class="title">
        تقویم روزانه گروه صدای کارکنان ثبت احوال
      </div>

    </header>

    <section class="date-area">

      <div class="date">
        ${escapeHtml(persianDate)}
      </div>

      <div class="weekday">
        ${escapeHtml(weekday)}
      </div>

    </section>

    <section class="info">

      <div class="info-item">
        <div class="info-label">
          📅 میلادی
        </div>
        <div class="info-value">
          ${escapeHtml(gregorianDate)}
        </div>
      </div>

      <div class="info-item">
        <div class="info-label">
          🌙 قمری
        </div>
        <div class="info-value">
          ${escapeHtml(hijriText)}
        </div>
      </div>

      <div class="info-item">
        <div class="info-label">
          🕐 ساعت
        </div>
        <div class="info-value">
          ${escapeHtml(time)}
        </div>
      </div>

    </section>

    <section class="progress">

      <div class="progress-head">

        <span>
          📊 پیشرفت سال
        </span>

        <span>
          ${toPersianDigits(progressPercent)}٪
        </span>

      </div>

      <div class="progress-track">

        <div class="progress-fill"></div>

      </div>

      <div class="progress-bottom">

        روز
        ${toPersianDigits(dayOfYear)}
        از
        ${toPersianDigits(totalDays)}
        ·
        ${toPersianDigits(remainingDays)}
        روز تا پایان سال

      </div>

    </section>

    <section class="quick">

      <div class="quick-item">

        <div class="quick-icon">
          🌙
        </div>

        <div class="quick-label">
          وضعیت ماه
        </div>

        <div class="quick-value">
          ${escapeHtml(moon)}
        </div>

      </div>

      <div class="quick-item">

        <div class="quick-icon">
          🐾
        </div>

        <div class="quick-label">
          سال حیوانی
        </div>

        <div class="quick-value">
          ${escapeHtml(animal)}
        </div>

      </div>

      <div class="quick-item">

        <div class="quick-icon">
          ⭐
        </div>

        <div class="quick-label">
          برج
        </div>

        <div class="quick-value">
          ${escapeHtml(zodiac)}
        </div>

      </div>

    </section>

    <section class="section">

      <div class="section-title">

        <span class="section-title-icon">
          📌
        </span>

        <span>
          رویدادها و مناسبت‌ها
        </span>

      </div>

      ${eventHtml}

    </section>

    <section class="section">

      <div class="section-title">

        <span class="section-title-icon">
          📖
        </span>

        <span>
          سخن بزرگان
        </span>

      </div>

      <div class="quote">

        <span class="quote-mark">
          «
        </span>

        ${escapeHtml(content.quote.quote)}

        <span class="quote-mark">
          »
        </span>

      </div>

      <div class="author">
        — ${escapeHtml(content.quote.author)}
      </div>

      <div class="source">
        منبع: ${escapeHtml(content.quote.source)}
      </div>

    </section>

    <section class="section">

      <div class="section-title">

        <span class="section-title-icon">
          💭
        </span>

        <span>
          جرعه‌ای تفکر
        </span>

      </div>

      <div class="thought">
        ${escapeHtml(content.thought)}
      </div>

    </section>

  </main>

</div>

</body>
</html>`;
}

/*
|--------------------------------------------------------------------------
| GET
|--------------------------------------------------------------------------
*/

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
      getYearDays(
        persianYear,
      );

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
            (dayOfYear / totalDays) *
              100,
          ),
        ),
      );

    const content =
      getDailyContent(
        persianDay,
      );

    const [
      hijri,
      events,
    ] = await Promise.all([
      getHijriDate(date),
      getEvents(
        persianYear,
        persianMonth,
        persianDay,
      ),
    ]);

    const html =
      buildHtml({
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
    |--------------------------------------------------------------------------
    | Screenshot
    |--------------------------------------------------------------------------
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

          gotoOptions: {
            waitUntil: "networkidle2",
            timeout: 30000,
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

    if (
      screenshot instanceof Response
    ) {

      imageBuffer =
        await screenshot.arrayBuffer();

    } else if (
      screenshot instanceof ArrayBuffer
    ) {

      imageBuffer =
        screenshot;

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
    |--------------------------------------------------------------------------
    | ارسال تصویر به Bale
    |--------------------------------------------------------------------------
    |
    | بسیار مهم:
    | caption عمداً حذف شده است.
    |
    | بنابراین زیر تصویر هیچ نوشته‌ای از طرف این کد ارسال نمی‌شود.
    |--------------------------------------------------------------------------
    */

    const form =
      new FormData();

    form.append(
      "chat_id",
      String(groupId),
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
        JSON.parse(
          baleText,
        );

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

      bale:
        baleData,

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
          content.quote.quote,

        author:
          content.quote.author,

        source:
          content.quote.source,

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

        version:
          "nature-modern-v2",

        title:
          "تقویم روزانه گروه صدای کارکنان ثبت احوال",

        title_only_at_top:
          true,

        top_left_duplicate:
          false,

        bottom_duplicate:
          false,

        bale_caption:
          false,

        nature_background:
          true,

        mountains:
          true,

        forest:
          true,

        sky:
          true,

        card_style:
          false,

        colorful:
          true,

        larger_text:
          true,

        high_readability:
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

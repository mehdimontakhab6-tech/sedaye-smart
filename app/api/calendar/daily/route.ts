import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

const TEHRAN_TZ = "Asia/Tehran";

const WIDTH = 1024;
const HEIGHT = 1700;

const BALE_API = "https://tapi.bale.ai";

const NATURE_IMAGES = [
  "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1600&q=92",
  "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1600&q=92",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1600&q=92",
  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1600&q=92",
  "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1600&q=92",
  "https://images.unsplash.com/photo-1473445361085-b9a07f55608b?auto=format&fit=crop&w=1600&q=92",
  "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1600&q=92",
  "https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=1600&q=92",
  "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1600&q=92",
  "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1600&q=92",
];

/* ---------------------------------------------------------
   ابزارهای عمومی
--------------------------------------------------------- */

function faDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

function normalizePersian(value: string): string {
  return value
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ---------------------------------------------------------
   تاریخ تهران
--------------------------------------------------------- */

function getTehranParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TEHRAN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

function getPersianDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    timeZone: TEHRAN_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
  };
}

function getPersianMonthName(month: number): string {
  const months = [
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

  return months[month - 1] || "";
}

function getPersianWeekday(date = new Date()): string {
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: TEHRAN_TZ,
    weekday: "long",
  }).format(date);
}

function getGregorianDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TEHRAN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getIslamicDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("fa-IR-u-ca-islamic", {
    timeZone: TEHRAN_TZ,
    year: "numeric",
    month: "long",
    day: "numeric",
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";

  return `${get("day")} ${get("month")} ${get("year")}`;
}

/* ---------------------------------------------------------
   پیشرفت سال
--------------------------------------------------------- */

function isLeapPersianYear(year: number): boolean {
  const formatter = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    timeZone: TEHRAN_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  const end = new Date(Date.UTC(year + 622, 2, 20));
  const p = formatter.formatToParts(end);

  const y = Number(
    p.find((x) => x.type === "year")?.value || "0"
  );

  return y === year;
}

function getDayOfYearPersian(month: number, day: number): number {
  const daysBefore = [
    0,
    31,
    62,
    93,
    124,
    155,
    186,
    216,
    246,
    276,
    306,
    336,
  ];

  return daysBefore[month - 1] + day;
}

function getYearProgress(year: number, month: number, day: number) {
  const totalDays = isLeapPersianYear(year) ? 366 : 365;
  const dayOfYear = getDayOfYearPersian(month, day);
  const remaining = Math.max(0, totalDays - dayOfYear);
  const percent = Math.round((dayOfYear / totalDays) * 100);

  return {
    totalDays,
    dayOfYear,
    remaining,
    percent,
  };
}

/* ---------------------------------------------------------
   حیوان سال
--------------------------------------------------------- */

function getIranianAnimal(year: number): string {
  const animals = [
    "اسب",
    "گوسفند",
    "میمون",
    "خروس",
    "سگ",
    "خوک",
    "موش",
    "گاو",
    "ببر",
    "خرگوش",
    "اژدها",
    "مار",
  ];

  const index = ((year - 1399) % 12 + 12) % 12;
  return animals[index];
}

/* ---------------------------------------------------------
   برج فلکی
--------------------------------------------------------- */

function getZodiac(month: number, day: number): string {
  const signs = [
    ["حمل ♈", 1, 31],
    ["ثور ♉", 2, 31],
    ["جوزا ♊", 3, 31],
    ["سرطان ♋", 4, 31],
    ["اسد ♌", 5, 31],
    ["سنبله ♍", 6, 31],
    ["میزان ♎", 7, 30],
    ["عقرب ♏", 8, 30],
    ["قوس ♐", 9, 30],
    ["جدی ♑", 10, 30],
    ["دلو ♒", 11, 30],
    ["حوت ♓", 12, 29],
  ];

  const item = signs[month - 1];
  if (!item) return "";

  return String(item[0]);
}

/* ---------------------------------------------------------
   فاز تقریبی ماه
--------------------------------------------------------- */

function getMoonPhase(date = new Date()): string {
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const current = date.getTime();

  const lunarCycle = 29.530588853;
  const days =
    (current - knownNewMoon) / (1000 * 60 * 60 * 24);

  const phase = ((days % lunarCycle) + lunarCycle) % lunarCycle;

  if (phase < 1.85) return "🌑 ماه نو";
  if (phase < 7.38) return "🌒 هلال افزاینده";
  if (phase < 9.23) return "🌓 تربیع اول";
  if (phase < 14.77) return "🌔 کوژ افزاینده";
  if (phase < 16.61) return "🌕 ماه کامل";
  if (phase < 22.15) return "🌖 کوژ کاهنده";
  if (phase < 24.00) return "🌗 تربیع آخر";
  return "🌘 هلال کاهنده";
}

/* ---------------------------------------------------------
   مناسبت‌های شمسی ایران - ۱۴۰۵
--------------------------------------------------------- */

const IRAN_EVENTS: Record<number, string[]> = {
  1: [
    "آغاز حمله مغول به ایران در سال ۵۹۸ هجری شمسی",
    "آغاز سال تحصیلی",
  ],

  2: [
    "بزرگداشت شهدای منا",
  ],

  3: [],

  4: [
    "روز گرامیداشت سربازان وطن",
  ],

  5: [
    "شکست حصر آبادان",
    "روز گردشگری",
  ],

  6: [],

  7: [
    "روز آتش‌نشانی و ایمنی",
    "بزرگداشت شمس تبریزی",
    "یادبود شهدای فرماندهان دفاع مقدس",
  ],

  8: [
    "روز بزرگداشت مولوی",
  ],

  9: [],

  10: [
    "روز نخبگان",
  ],

  11: [],

  12: [],

  13: [
    "روز نیروی انتظامی",
  ],

  14: [
    "روز دامپزشکی",
  ],

  15: [
    "روز روستا و عشایر",
  ],

  16: [
    "مهرگان؛ جشن مهر",
    "روز جهانی کودک",
  ],

  17: [
    "روز جهانی پست",
  ],

  18: [
    "روز جهانی بهداشت روان",
  ],

  19: [
    "روز جهانی دختر",
  ],

  20: [
    "روز بزرگداشت حافظ",
  ],

  21: [
    "روز پیروزی کاوه و فریدون بر ضحاک",
    "روز جهانی استاندارد",
  ],

  22: [
    "روز جهانی نابینایان و عصای سفید",
  ],

  23: [
    "زادروز ستارخان، سردار ملی",
  ],

  24: [
    "ولادت حضرت زینب سلام‌الله‌علیها",
    "روز پرستار و بهورز",
    "روز جهانی غذا",
    "روز تربیت بدنی و ورزش",
  ],

  25: [
    "روز جهانی ریشه‌کنی فقر",
  ],

  26: [
    "روز تربیت بدنی و ورزش",
  ],

  27: [],

  28: [
    "روز ملی کوهنورد",
  ],

  29: [
    "روز صادرات",
  ],

  30: [],
};

/* ---------------------------------------------------------
   مناسبت‌های بین‌المللی بر اساس تاریخ میلادی
--------------------------------------------------------- */

const INTERNATIONAL_EVENTS: Record<string, string[]> = {
  "1-1": ["روز جهانی صلح"],
  "2-2": ["روز جهانی تالاب‌ها"],
  "2-4": ["روز جهانی سرطان"],
  "2-6": ["روز جهانی مبارزه با ناقص‌سازی زنان"],
  "2-11": ["روز جهانی زنان و دختران در علم"],
  "2-13": ["روز جهانی رادیو"],
  "2-20": ["روز جهانی عدالت اجتماعی"],
  "2-21": ["روز جهانی زبان مادری"],
  "3-3": ["روز جهانی حیات وحش"],
  "3-8": ["روز جهانی زن"],
  "3-20": ["روز جهانی شادی"],
  "3-21": ["روز جهانی جنگل‌ها"],
  "3-22": ["روز جهانی آب"],
  "3-23": ["روز جهانی هواشناسی"],
  "3-24": ["روز جهانی سل"],
  "4-2": ["روز جهانی آگاهی از اوتیسم"],
  "4-7": ["روز جهانی بهداشت"],
  "4-22": ["روز جهانی زمین"],
  "4-23": ["روز جهانی کتاب و حق مؤلف"],
  "4-25": ["روز جهانی مالاریا"],
  "5-3": ["روز جهانی آزادی مطبوعات"],
  "5-15": ["روز جهانی خانواده"],
  "5-17": ["روز جهانی ارتباطات و جامعه اطلاعاتی"],
  "5-22": ["روز جهانی تنوع زیستی"],
  "5-31": ["روز جهانی بدون دخانیات"],
  "6-5": ["روز جهانی محیط زیست"],
  "6-8": ["روز جهانی اقیانوس‌ها"],
  "6-20": ["روز جهانی پناهندگان"],
  "6-26": ["روز جهانی مبارزه با سوءمصرف و قاچاق مواد مخدر"],
  "7-11": ["روز جهانی جمعیت"],
  "7-18": ["روز جهانی نلسون ماندلا"],
  "8-9": ["روز جهانی مردمان بومی"],
  "8-12": ["روز جهانی جوانان"],
  "8-19": ["روز جهانی بشردوستی"],
  "9-8": ["روز جهانی سوادآموزی"],
  "9-15": ["روز جهانی دموکراسی"],
  "9-21": ["روز جهانی صلح"],
  "9-27": ["روز جهانی گردشگری"],
  "9-30": ["روز جهانی ترجمه"],
  "10-1": ["روز جهانی سالمندان"],
  "10-4": ["روز جهانی حیات وحش"],
  "10-5": ["روز جهانی معلم"],
  "10-9": ["روز جهانی پست"],
  "10-10": ["روز جهانی بهداشت روان"],
  "10-11": ["روز جهانی دختر"],
  "10-14": ["روز جهانی استاندارد"],
  "10-15": ["روز جهانی نابینایان و عصای سفید"],
  "10-16": ["روز جهانی غذا"],
  "10-17": ["روز جهانی ریشه‌کنی فقر"],
  "10-24": ["روز ملل متحد"],
  "10-31": ["روز جهانی شهرها"],
  "11-10": ["روز جهانی علم در خدمت صلح و توسعه"],
  "11-14": ["روز جهانی دیابت"],
  "11-16": ["روز جهانی تساهل"],
  "11-19": ["روز جهانی فلسفه"],
  "11-20": ["روز جهانی کودک"],
  "12-1": ["روز جهانی ایدز"],
  "12-3": ["روز جهانی افراد دارای معلولیت"],
  "12-5": ["روز جهانی داوطلب"],
  "12-9": ["روز جهانی مبارزه با فساد"],
  "12-10": ["روز جهانی حقوق بشر"],
  "12-18": ["روز جهانی مهاجران"],
};

/* ---------------------------------------------------------
   تبدیل میلادی روز فعلی برای مناسبت‌های بین‌المللی
--------------------------------------------------------- */

function getInternationalEvents(date = new Date()): string[] {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TEHRAN_TZ,
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);

  const month = Number(
    parts.find((x) => x.type === "month")?.value || 0
  );

  const day = Number(
    parts.find((x) => x.type === "day")?.value || 0
  );

  return INTERNATIONAL_EVENTS[`${month}-${day}`] || [];
}

/* ---------------------------------------------------------
   مناسبت‌های نهایی
--------------------------------------------------------- */

function getEvents(
  solarMonth: number,
  solarDay: number,
  date = new Date()
) {
  const iran = IRAN_EVENTS[solarDay] || [];

  const international = getInternationalEvents(date);

  return {
    iran,
    international,
  };
}

/* ---------------------------------------------------------
   سخن بزرگان
--------------------------------------------------------- */

const DAILY_QUOTES = [
  {
    quote: "تو نیکی می‌کن و در دجله انداز، که ایزد در بیابانت دهد باز.",
    author: "سعدی",
    source: "گلستان سعدی",
  },
  {
    quote: "بنی آدم اعضای یکدیگرند که در آفرینش ز یک گوهرند.",
    author: "سعدی",
    source: "گلستان سعدی",
  },
  {
    quote: "توانا بود هر که دانا بود.",
    author: "فردوسی",
    source: "شاهنامه",
  },
  {
    quote: "خرد رهنمای و خرد دلگشای.",
    author: "فردوسی",
    source: "شاهنامه",
  },
  {
    quote: "هر که ناموخت از گذشت روزگار نیز ناموزد ز هیچ آموزگار.",
    author: "ناصرخسرو",
    source: "دیوان ناصرخسرو",
  },
  {
    quote: "این قافله عمر عجب می‌گذرد.",
    author: "حافظ",
    source: "دیوان حافظ",
  },
  {
    quote: "دوش دیدم که ملائک در میخانه زدند.",
    author: "حافظ",
    source: "دیوان حافظ",
  },
  {
    quote: "عشق آسان نمود اول ولی افتاد مشکل‌ها.",
    author: "حافظ",
    source: "دیوان حافظ",
  },
  {
    quote: "تو پای به راه در نه و هیچ مپرس.",
    author: "مولانا",
    source: "مثنوی معنوی",
  },
  {
    quote: "این جهان کوه است و فعل ما ندا.",
    author: "مولانا",
    source: "مثنوی معنوی",
  },
  {
    quote: "از محبت تلخ‌ها شیرین شود.",
    author: "مولانا",
    source: "مثنوی معنوی",
  },
  {
    quote: "چون که صد آمد نود هم پیش ماست.",
    author: "مولانا",
    source: "مثنوی معنوی",
  },
  {
    quote: "مشک آن است که خود ببوید، نه آنکه عطار بگوید.",
    author: "سعدی",
    source: "گلستان سعدی",
  },
  {
    quote: "به جهان خرم از آنم که جهان خرم از اوست.",
    author: "حافظ",
    source: "دیوان حافظ",
  },
  {
    quote: "ز گهواره تا گور دانش بجوی.",
    author: "حکمت مشهور",
    source: "نقل مشهور",
  },
  {
    quote: "رهرو آن نیست که گه تند و گهی خسته رود.",
    author: "حافظ",
    source: "دیوان حافظ",
  },
  {
    quote: "کارها به صبر برآید.",
    author: "سعدی",
    source: "گلستان سعدی",
  },
  {
    quote: "هر که دلارام دید از دلش آرام رفت.",
    author: "حافظ",
    source: "دیوان حافظ",
  },
  {
    quote: "از تو حرکت، از خدا برکت.",
    author: "ضرب‌المثل فارسی",
    source: "ضرب‌المثل",
  },
  {
    quote: "نابرده رنج گنج میسر نمی‌شود.",
    author: "ضرب‌المثل فارسی",
    source: "ضرب‌المثل",
  },
  {
    quote: "قطره قطره جمع گردد وانگهی دریا شود.",
    author: "ضرب‌المثل فارسی",
    source: "ضرب‌المثل",
  },
  {
    quote: "همت بلند دار که مردان روزگار از همت بلند به جایی رسیده‌اند.",
    author: "سعدی",
    source: "مضمون مشهور از آثار سعدی",
  },
  {
    quote: "به راه بادیه رفتن به از نشستن باطل.",
    author: "سعدی",
    source: "گلستان سعدی",
  },
  {
    quote: "تو خود حجاب خودی حافظ از میان برخیز.",
    author: "حافظ",
    source: "دیوان حافظ",
  },
  {
    quote: "وقت را غنیمت دان آن قدر که بتوانی.",
    author: "سعدی",
    source: "گلستان سعدی",
  },
  {
    quote: "هر که را خوابگه آخر مشتی خاک است.",
    author: "حافظ",
    source: "دیوان حافظ",
  },
  {
    quote: "چو دخلت نیست، خرج آهسته‌تر کن.",
    author: "سعدی",
    source: "گلستان سعدی",
  },
  {
    quote: "ز نیرو بود مرد را راستی.",
    author: "فردوسی",
    source: "شاهنامه",
  },
  {
    quote: "دل آدمی به امید زنده است.",
    author: "ضرب‌المثل فارسی",
    source: "ضرب‌المثل",
  },
  {
    quote: "دانش چراغ راه زندگی است.",
    author: "حکمت مشهور",
    source: "نقل مشهور",
  },
  {
    quote: "به عمل کار برآید، به سخندانی نیست.",
    author: "ضرب‌المثل فارسی",
    source: "ضرب‌المثل",
  },
];

/* ---------------------------------------------------------
   جرعه‌ای تفکر - ۳۱ روز
--------------------------------------------------------- */

const DAILY_THOUGHTS = [
  "امروز چه کاری می‌توانم انجام دهم که فردای بهتری بسازد؟",
  "آیا برای شنیدن نظر دیگران، به اندازه کافی فرصت می‌دهم؟",
  "کدام عادت کوچک می‌تواند زندگی من را بهتر کند؟",
  "آیا موفقیت را فقط در نتیجه می‌بینم یا در مسیر هم ارزش می‌گذارم؟",
  "امروز بابت چه چیزی می‌توانم شکرگزار باشم؟",
  "اگر ترس مانع من نبود، امروز چه قدمی برمی‌داشتم؟",
  "آیا زمانم را برای چیزهایی خرج می‌کنم که واقعاً مهم‌اند؟",
  "یک رفتار خوب کوچک امروز می‌تواند حال چه کسی را بهتر کند؟",
  "آیا بیشتر به گذشته فکر می‌کنم یا از امروز استفاده می‌کنم؟",
  "کدام حرف خوب را مدت‌هاست به کسی نگفته‌ام؟",
  "آیا در شلوغی روز، زمانی برای خودم باقی گذاشته‌ام؟",
  "امروز چه چیزی می‌تواند مرا یک قدم به هدفم نزدیک‌تر کند؟",
  "آیا اشتباهاتم را تجربه می‌بینم یا شکست؟",
  "کدام نعمت ساده زندگی را گاهی فراموش می‌کنم؟",
  "اگر امروز فقط یک کار مهم انجام دهم، آن کار چیست؟",
  "آیا مهربانی را فقط برای دیگران می‌خواهم یا با خودم هم مهربانم؟",
  "کدام نگرانی امروز ارزش این همه انرژی را ندارد؟",
  "آیا برای پیشرفت، به اندازه کافی صبور هستم؟",
  "چه چیزی در زندگی من ارزش حفظ کردن دارد؟",
  "آیا امروز کسی را با یک جمله خوب خوشحال کرده‌ام؟",
  "اگر امروز را دوباره زندگی کنم، چه چیزی را متفاوت انجام می‌دهم؟",
  "آیا بین خواسته‌هایم و ارزش‌هایم هماهنگی وجود دارد؟",
  "کدام فرصت را به دلیل ترس نادیده گرفته‌ام؟",
  "آیا بیشتر دنبال اثبات خودم هستم یا ساختن خودم؟",
  "امروز چه چیزی یاد گرفتم که دیروز نمی‌دانستم؟",
  "آیا سرعت زندگی‌ام اجازه دیدن زیبایی‌های کوچک را می‌دهد؟",
  "کدام تصمیم امروز می‌تواند ماه آینده به من کمک کند؟",
  "آیا به اندازه کافی برای کسانی که دوستشان دارم وقت می‌گذارم؟",
  "اگر آرام‌تر باشم، چه چیزی را بهتر می‌بینم؟",
  "آیا امروز نسخه بهتری از خود دیروزم هستم؟",
];

/* ---------------------------------------------------------
   محتوای روز
--------------------------------------------------------- */

function getDailyContent(day: number) {
  const index = Math.max(0, Math.min(30, day - 1));

  return {
    quote: DAILY_QUOTES[index],
    thought: DAILY_THOUGHTS[index],
  };
}

/* ---------------------------------------------------------
   قالب HTML
--------------------------------------------------------- */

function buildHtml(params: {
  title: string;
  solar: string;
  weekday: string;
  gregorian: string;
  islamic: string;
  time: string;
  progress: {
    percent: number;
    dayOfYear: number;
    remaining: number;
  };
  animal: string;
  zodiac: string;
  moon: string;
  iranEvents: string[];
  internationalEvents: string[];
  quote: {
    quote: string;
    author: string;
    source: string;
  };
  thought: string;
  background: string;
}) {
  const {
    title,
    solar,
    weekday,
    gregorian,
    islamic,
    time,
    progress,
    animal,
    zodiac,
    moon,
    iranEvents,
    internationalEvents,
    quote,
    thought,
    background,
  } = params;

  const allEvents = [...iranEvents, ...internationalEvents];

  const eventHtml =
    allEvents.length > 0
      ? allEvents
          .map(
            (event, i) => `
              <div class="event-line">
                <span class="event-number">${faDigits(i + 1)}</span>
                <span>${escapeHtml(event)}</span>
              </div>
            `
          )
          .join("")
      : `
        <div class="empty-event">
          امروز مناسبت ثبت‌شده‌ای در فهرست این تقویم وجود ندارد.
        </div>
      `;

  const iranHtml =
    iranEvents.length > 0
      ? iranEvents
          .map(
            (event) => `
              <div class="mini-event iran-event">
                <span class="dot iran-dot"></span>
                <span>${escapeHtml(event)}</span>
              </div>
            `
          )
          .join("")
      : `<div class="muted">مناسبت داخلی ثبت‌شده‌ای ندارد.</div>`;

  const internationalHtml =
    internationalEvents.length > 0
      ? internationalEvents
          .map(
            (event) => `
              <div class="mini-event world-event">
                <span class="dot world-dot"></span>
                <span>${escapeHtml(event)}</span>
              </div>
            `
          )
          .join("")
      : `<div class="muted">مناسبت بین‌المللی ثبت‌شده‌ای ندارد.</div>`;

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=1024, initial-scale=1" />

<link
  href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800;900&display=swap"
  rel="stylesheet"
/>

<style>
* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  width: ${WIDTH}px;
  min-height: ${HEIGHT}px;
  font-family: "Vazirmatn", Tahoma, Arial, sans-serif;
}

body {
  background: #111;
}

.page {
  position: relative;
  width: ${WIDTH}px;
  min-height: ${HEIGHT}px;
  overflow: hidden;
  color: white;
  background-image:
    linear-gradient(
      180deg,
      rgba(5, 20, 45, .28) 0%,
      rgba(5, 20, 45, .18) 25%,
      rgba(5, 12, 18, .55) 55%,
      rgba(4, 8, 12, .88) 100%
    ),
    url("${background}");
  background-size: cover;
  background-position: center;
}

.page::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 12% 12%, rgba(255,255,255,.34), transparent 18%),
    radial-gradient(circle at 86% 18%, rgba(255,210,80,.24), transparent 20%),
    radial-gradient(circle at 15% 75%, rgba(0,220,180,.16), transparent 25%),
    radial-gradient(circle at 88% 70%, rgba(90,150,255,.18), transparent 25%);
  pointer-events: none;
}

.content {
  position: relative;
  z-index: 2;
  padding: 52px 54px 58px;
}

/* عنوان */
.title-wrap {
  text-align: center;
  margin-bottom: 30px;
}

.title {
  display: inline-block;
  padding: 18px 34px;
  border-radius: 30px;
  background: linear-gradient(
    135deg,
    rgba(7, 40, 75, .82),
    rgba(0, 118, 112, .72),
    rgba(41, 72, 145, .78)
  );
  border: 2px solid rgba(255,255,255,.35);
  box-shadow:
    0 18px 45px rgba(0,0,0,.32),
    inset 0 1px 0 rgba(255,255,255,.25);
  font-size: 39px;
  font-weight: 900;
  letter-spacing: -1px;
}

/* تاریخ */
.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 22px;
  margin-bottom: 24px;
}

.date-main {
  flex: 1.2;
  padding: 25px 28px;
  border-radius: 34px;
  background:
    linear-gradient(
      135deg,
      rgba(255,255,255,.19),
      rgba(255,255,255,.07)
    );
  border: 2px solid rgba(255,255,255,.32);
  box-shadow: 0 20px 45px rgba(0,0,0,.28);
}

.date-big {
  font-size: 65px;
  font-weight: 900;
  line-height: 1.1;
  text-shadow: 0 4px 14px rgba(0,0,0,.5);
}

.weekday {
  margin-top: 12px;
  font-size: 31px;
  font-weight: 800;
}

.time-box {
  flex: .7;
  text-align: center;
  padding: 25px 18px;
  border-radius: 34px;
  background:
    linear-gradient(
      145deg,
      rgba(255,174,0,.82),
      rgba(255,96,77,.76)
    );
  border: 2px solid rgba(255,255,255,.45);
  box-shadow: 0 20px 45px rgba(0,0,0,.3);
}

.clock {
  font-size: 51px;
  font-weight: 900;
}

.clock-label {
  font-size: 22px;
  font-weight: 700;
  margin-top: 7px;
}

/* اطلاعات تقویم */
.info-strip {
  display: flex;
  gap: 15px;
  margin-bottom: 22px;
}

.info {
  flex: 1;
  min-height: 91px;
  padding: 15px 17px;
  border-radius: 25px;
  background: rgba(5,25,45,.63);
  border: 1.5px solid rgba(255,255,255,.25);
  box-shadow: 0 13px 28px rgba(0,0,0,.22);
}

.info-label {
  font-size: 18px;
  opacity: .85;
  font-weight: 600;
}

.info-value {
  margin-top: 5px;
  font-size: 25px;
  font-weight: 850;
}

/* پیشرفت سال */
.progress-box {
  margin: 20px 0 25px;
  padding: 20px 23px;
  border-radius: 30px;
  background:
    linear-gradient(
      90deg,
      rgba(0,115,100,.72),
      rgba(30,80,145,.74)
    );
  border: 2px solid rgba(255,255,255,.27);
  box-shadow: 0 17px 36px rgba(0,0,0,.25);
}

.progress-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 24px;
  font-weight: 800;
}

.progress-percent {
  font-size: 35px;
  font-weight: 900;
}

.progress-track {
  height: 22px;
  margin-top: 13px;
  border-radius: 999px;
  background: rgba(255,255,255,.20);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  width: ${Math.max(1, Math.min(100, progress.percent))}%;
  border-radius: 999px;
  background:
    linear-gradient(
      90deg,
      #72f7c2,
      #ffe36e,
      #ff9a67
    );
  box-shadow: 0 0 20px rgba(255,220,100,.55);
}

/* سه‌گانه اطلاعات */
.quick {
  display: flex;
  gap: 16px;
  margin-bottom: 25px;
}

.quick-item {
  flex: 1;
  min-height: 100px;
  padding: 16px;
  border-radius: 28px;
  text-align: center;
  background: rgba(8,25,45,.67);
  border: 1.5px solid rgba(255,255,255,.27);
  box-shadow: 0 15px 32px rgba(0,0,0,.22);
}

.quick-icon {
  font-size: 30px;
}

.quick-value {
  margin-top: 4px;
  font-size: 23px;
  font-weight: 850;
}

/* مناسبت‌ها */
.events {
  position: relative;
  margin-top: 10px;
  padding: 25px 27px 27px;
  border-radius: 35px;
  background:
    linear-gradient(
      135deg,
      rgba(8,38,61,.87),
      rgba(9,65,67,.76),
      rgba(21,48,92,.82)
    );
  border: 2px solid rgba(255,255,255,.30);
  box-shadow: 0 20px 44px rgba(0,0,0,.30);
}

.section-title {
  font-size: 34px;
  font-weight: 900;
  margin-bottom: 17px;
  text-align: right;
  display: flex;
  align-items: center;
  gap: 12px;
}

.section-title::before {
  content: "";
  width: 8px;
  height: 42px;
  border-radius: 20px;
  background: linear-gradient(#ffd84d,#ff6b6b);
}

.event-columns {
  display: flex;
  gap: 18px;
}

.event-column {
  flex: 1;
  padding: 17px;
  border-radius: 24px;
  background: rgba(255,255,255,.08);
}

.column-title {
  font-size: 25px;
  font-weight: 900;
  margin-bottom: 13px;
}

.mini-event {
  display: flex;
  gap: 11px;
  align-items: flex-start;
  direction: rtl;
  text-align: right;
  font-size: 22px;
  line-height: 1.7;
  font-weight: 650;
  margin-bottom: 10px;
}

.dot {
  width: 12px;
  height: 12px;
  min-width: 12px;
  margin-top: 10px;
  border-radius: 50%;
}

.iran-dot {
  background: #72f7c2;
  box-shadow: 0 0 12px #72f7c2;
}

.world-dot {
  background: #ffd76a;
  box-shadow: 0 0 12px #ffd76a;
}

.muted {
  opacity: .75;
  font-size: 19px;
  line-height: 1.7;
}

.empty-event {
  text-align: right;
  font-size: 23px;
  font-weight: 600;
  opacity: .85;
}

/* پایین صفحه */
.bottom-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 19px;
  margin-top: 23px;
}

/* سخن */
.quote-box {
  min-height: 265px;
  padding: 26px 28px;
  border-radius: 35px;
  background:
    linear-gradient(
      145deg,
      rgba(83,40,110,.87),
      rgba(37,48,110,.84)
    );
  border: 2px solid rgba(255,255,255,.30);
  box-shadow: 0 20px 44px rgba(0,0,0,.3);
  text-align: right;
  direction: rtl;
}

.quote-text {
  font-size: 27px;
  line-height: 1.9;
  font-weight: 750;
}

.quote-author {
  margin-top: 14px;
  font-size: 22px;
  font-weight: 900;
}

.quote-source {
  margin-top: 4px;
  font-size: 17px;
  opacity: .78;
}

/* تفکر */
.thought-box {
  min-height: 265px;
  padding: 26px 28px;
  border-radius: 35px;
  background:
    linear-gradient(
      145deg,
      rgba(12,101,108,.86),
      rgba(14,66,109,.88)
    );
  border: 2px solid rgba(255,255,255,.30);
  box-shadow: 0 20px 44px rgba(0,0,0,.3);
  text-align: right;
  direction: rtl;
}

.thought-text {
  font-size: 27px;
  line-height: 1.95;
  font-weight: 700;
}

/* پایین کوچک */
.footer-info {
  margin-top: 21px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 20px;
  font-weight: 650;
  opacity: .86;
}

.footer-left {
  direction: rtl;
}

.footer-right {
  direction: rtl;
}

/* جلوگیری از کوچک شدن متن */
@media (max-width: 1024px) {
  .content {
    padding: 48px;
  }
}
</style>
</head>

<body>
<div class="page">

  <div class="content">

    <div class="title-wrap">
      <div class="title">
        ${escapeHtml(title)}
      </div>
    </div>

    <div class="hero">

      <div class="date-main">
        <div class="date-big">
          ${escapeHtml(solar)}
        </div>

        <div class="weekday">
          ${escapeHtml(weekday)}
        </div>
      </div>

      <div class="time-box">
        <div class="clock">
          ${escapeHtml(time)}
        </div>

        <div class="clock-label">
          وقت تهران
        </div>
      </div>

    </div>

    <div class="info-strip">

      <div class="info">
        <div class="info-label">میلادی</div>
        <div class="info-value">${escapeHtml(gregorian)}</div>
      </div>

      <div class="info">
        <div class="info-label">قمری</div>
        <div class="info-value">${escapeHtml(islamic)}</div>
      </div>

      <div class="info">
        <div class="info-label">سال حیوانی</div>
        <div class="info-value">${escapeHtml(animal)}</div>
      </div>

    </div>

    <div class="progress-box">

      <div class="progress-top">
        <span>
          پیشرفت سال
        </span>

        <span class="progress-percent">
          ${faDigits(progress.percent)}٪
        </span>
      </div>

      <div class="progress-track">
        <div class="progress-fill"></div>
      </div>

      <div style="
        display:flex;
        justify-content:space-between;
        margin-top:11px;
        font-size:20px;
        font-weight:650;
      ">
        <span>
          روز ${faDigits(progress.dayOfYear)}
        </span>

        <span>
          ${faDigits(progress.remaining)} روز باقی‌مانده
        </span>
      </div>

    </div>

    <div class="quick">

      <div class="quick-item">
        <div class="quick-icon">🌙</div>
        <div class="quick-value">${escapeHtml(moon)}</div>
      </div>

      <div class="quick-item">
        <div class="quick-icon">♈</div>
        <div class="quick-value">${escapeHtml(zodiac)}</div>
      </div>

      <div class="quick-item">
        <div class="quick-icon">📅</div>
        <div class="quick-value">تقویم روزانه</div>
      </div>

    </div>

    <div class="events">

      <div class="section-title">
        رویدادها و مناسبت‌ها
      </div>

      <div class="event-columns">

        <div class="event-column">
          <div class="column-title">
            🇮🇷 مناسبت‌های داخلی
          </div>

          ${iranHtml}
        </div>

        <div class="event-column">
          <div class="column-title">
            🌍 مناسبت‌های بین‌المللی
          </div>

          ${internationalHtml}
        </div>

      </div>

    </div>

    <div class="bottom-grid">

      <div class="quote-box">

        <div class="section-title">
          📜 سخن بزرگان
        </div>

        <div class="quote-text">
          «${escapeHtml(quote.quote)}»
        </div>

        <div class="quote-author">
          — ${escapeHtml(quote.author)}
        </div>

        <div class="quote-source">
          ${escapeHtml(quote.source)}
        </div>

      </div>

      <div class="thought-box">

        <div class="section-title">
          💭 جرعه‌ای تفکر
        </div>

        <div class="thought-text">
          ${escapeHtml(thought)}
        </div>

      </div>

    </div>

    <div class="footer-info">

      <div class="footer-left">
      ${faDigits(progress.dayOfYear)} / ${faDigits(progress.dayOfYear + progress.remaining)}
      </div>

      <div class="footer-right">
        ${escapeHtml(weekday)}
      </div>

    </div>

  </div>

</div>
</body>
</html>`;
}

/* ---------------------------------------------------------
   تبدیل نتیجه Screenshot به Buffer
--------------------------------------------------------- */

async function screenshotToArrayBuffer(
  screenshot: unknown
): Promise<ArrayBuffer> {
  if (screenshot instanceof Response) {
    return await screenshot.arrayBuffer();
  }

  if (screenshot instanceof ArrayBuffer) {
    return screenshot;
  }

  if (
    screenshot &&
    typeof screenshot === "object" &&
    "arrayBuffer" in screenshot &&
    typeof (screenshot as any).arrayBuffer === "function"
  ) {
    return await (screenshot as any).arrayBuffer();
  }

  if (
    screenshot &&
    typeof screenshot === "object" &&
    "body" in screenshot
  ) {
    const body = (screenshot as any).body;

    if (body instanceof ReadableStream) {
      return await new Response(body).arrayBuffer();
    }
  }

  throw new Error("فرمت تصویر تولیدشده توسط Browser Run ناشناخته است.");
}

/* ---------------------------------------------------------
   GET
--------------------------------------------------------- */

export async function GET() {
  try {
    const { env } = await getCloudflareContext({
      async: true,
    });

    const now = new Date();

    const tehran = getTehranParts(now);
    const persian = getPersianDate(now);

    const monthName = getPersianMonthName(persian.month);

    const solarText =
      `${faDigits(persian.year)}/${faDigits(persian.month)}/${faDigits(persian.day)}`;

    const weekday = getPersianWeekday(now);

    const time =
      `${faDigits(String(tehran.hour).padStart(2, "0"))}:${faDigits(
        String(tehran.minute).padStart(2, "0")
      )}`;

    const gregorian = getGregorianDate(now);
    const islamic = getIslamicDate(now);

    const progress = getYearProgress(
      persian.year,
      persian.month,
      persian.day
    );

    const animal = getIranianAnimal(persian.year);
    const zodiac = getZodiac(persian.month, persian.day);
    const moon = getMoonPhase(now);

    const events = getEvents(
      persian.month,
      persian.day,
      now
    );

    const content = getDailyContent(persian.day);

    const background =
      NATURE_IMAGES[(persian.day - 1) % NATURE_IMAGES.length];

    const title =
      "تقویم روزانه گروه صدای کارکنان ثبت احوال";

    const html = buildHtml({
      title,

      solar:
        `${faDigits(persian.day)} ${monthName} ${faDigits(
          persian.year
        )}`,

      weekday,

      gregorian,

      islamic,

      time,

      progress,

      animal,

      zodiac,

      moon,

      iranEvents: events.iran,

      internationalEvents:
        events.international,

      quote: content.quote,

      thought: content.thought,

      background,
    });

    /* -----------------------------------------------------
       Browser Run
    ----------------------------------------------------- */

    const screenshot = await env.BROWSER.quickAction(
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
          height: 1000,
          deviceScaleFactor: 1,
        },

        waitForTimeout: 1800,
      }
    );

    const imageBuffer =
      await screenshotToArrayBuffer(screenshot);

    /* -----------------------------------------------------
       Bale
       بدون caption
    ----------------------------------------------------- */

    const groupId = env.BALE_GROUP_ID;
    const token = env.BALE_SMART_TOKEN;

    if (!groupId) {
      throw new Error("BALE_GROUP_ID تنظیم نشده است.");
    }

    if (!token) {
      throw new Error("BALE_SMART_TOKEN تنظیم نشده است.");
    }

    const form = new FormData();

    form.append(
      "chat_id",
      String(groupId)
    );

    const blob = new Blob(
      [imageBuffer],
      {
        type: "image/png",
      }
    );

    form.append(
      "photo",
      blob,
      "calendar-daily.png"
    );

    const baleResponse =
      await fetch(
        `${BALE_API}/bot${token}/sendPhoto`,
        {
          method: "POST",
          body: form,
        }
      );

    const baleData =
      await baleResponse.json();

    if (!baleResponse.ok || !baleData?.ok) {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          bale_status: baleResponse.status,
          bale: baleData,
        },
        {
          status: 502,
        }
      );
    }

    return NextResponse.json({
      ok: true,

      cancelled: false,

      sent: true,

      bale_status:
        baleResponse.status,

      bale: baleData,

      date: {
        solar:
          `${persian.year}/${persian.month}/${persian.day}`,

        solar_persian:
          `${faDigits(persian.year)}/${faDigits(
            persian.month
          )}/${faDigits(persian.day)}`,

        weekday,

        time,
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
          persian.day,

        day_persian:
          faDigits(persian.day),

        iran_events:
          events.iran,

        international_events:
          events.international,
      },

      image: {
        format: "png",

        bytes:
          imageBuffer.byteLength,

        width: WIDTH,

        height: HEIGHT,
      },

      design: {
        version:
          "nature-dynamic-v3",

        title,

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

        colorful:
          true,

        dynamic_layout:
          true,

        card_style:
          false,

        font:
          "Vazirmatn",

        larger_text:
          true,

        high_readability:
          true,

        iran_events:
          true,

        international_events:
          true,

        unique_daily_content:
          true,

        unique_content_days:
          31,
      },
    });
  } catch (error) {
    console.error(
      "DAILY_CALENDAR_ERROR",
      error
    );

    return NextResponse.json(
      {
        ok: false,

        sent: false,

        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
      }
    );
  }
    }

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "edge";

const TEHRAN_TZ = "Asia/Tehran";

const WIDTH = 1024;
const HEIGHT = 1700;

const BALE_API = "https://tapi.bale.ai/bot";

type Env = {
  BALE_SMART_TOKEN: string;
  BALE_GROUP_ID: string;
  BROWSER: any;
};

type DailyContent = {
  quote: string;
  author: string;
  source: string;
  thought: string;
};

type PersianDate = {
  year: number;
  month: number;
  day: number;
};

type Progress = {
  percent: number;
  dayOfYear: number;
  remaining: number;
  totalDays: number;
};

/* =========================================================
   ابزارهای عمومی
========================================================= */

function faDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

function normalizePersian(text: string): string {
  return text
    .replace(/ي/g, "ی")
    .replace(/ى/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =========================================================
   تاریخ تهران
========================================================= */

function getTehranParts() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TEHRAN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "long",
  });

  const parts = formatter.formatToParts(new Date());

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: get("weekday"),
  };
}

/* =========================================================
   تبدیل میلادی به جلالی
========================================================= */

function gregorianToJalali(gy: number, gm: number, gd: number): PersianDate {
  const gdm = [
    0,
    31,
    59,
    90,
    120,
    151,
    181,
    212,
    243,
    273,
    304,
    334,
  ];

  let gy2 = gm > 2 ? gy + 1 : gy;

  let days =
    355666 +
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) +
    gd +
    gdm[gm - 1];

  let jy = -1595 + 33 * Math.floor(days / 12053);

  days %= 12053;

  jy += 4 * Math.floor(days / 1461);

  days %= 1461;

  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }

  let jd = days + 1;

  let jm =
    jd <= 186
      ? Math.ceil(jd / 31)
      : Math.ceil((jd - 186) / 30) + 6;

  let day =
    jd <= 186
      ? ((jd - 1) % 31) + 1
      : ((jd - 187) % 30) + 1;

  return {
    year: jy,
    month: jm,
    day,
  };
}

/* =========================================================
   نام‌ها
========================================================= */

const PERSIAN_MONTHS = [
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

const WEEKDAYS: Record<string, string> = {
  Saturday: "شنبه",
  Sunday: "یکشنبه",
  Monday: "دوشنبه",
  Tuesday: "سه‌شنبه",
  Wednesday: "چهارشنبه",
  Thursday: "پنجشنبه",
  Friday: "جمعه",
};

const GREGORIAN_MONTHS = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/* =========================================================
   تاریخ قمری تقریبی
========================================================= */

function getIslamicDate(date: Date) {
  const jd =
    Math.floor(
      date.getTime() / 86400000
    ) + 2440588;

  const l =
    jd - 1948440 + 10632;

  const n =
    Math.floor((l - 1) / 10631);

  const l2 =
    l - 10631 * n + 354;

  const j =
    Math.floor(
      (10985 - l2) / 5316
    ) *
      Math.floor(
        (50 * l2) / 17719
      ) +
    Math.floor(l2 / 5670) *
      Math.floor(
        (43 * l2) / 15238
      );

  const l3 =
    l2 -
    Math.floor(
      (30 - j) / 15
    ) *
      Math.floor(
        (17719 * j) / 50
      ) -
    Math.floor(j / 16) *
      Math.floor(
        (15238 * j) / 43
      ) +
    29;

  const m = Math.floor((24 * l3) / 709);

  const d =
    l3 -
    Math.floor(
      (709 * m) / 24
    );

  const y =
    30 * n +
    j -
    30;

  return {
    year: y,
    month: m,
    day: d,
  };
}

const ISLAMIC_MONTHS = [
  "",
  "محرم",
  "صفر",
  "ربیع‌الاول",
  "ربیع‌الثانی",
  "جمادی‌الاول",
  "جمادی‌الثانی",
  "رجب",
  "شعبان",
  "رمضان",
  "شوال",
  "ذیقعده",
  "ذیحجه",
];

/* =========================================================
   سال شمسی
========================================================= */

function isLeapPersianYear(year: number): boolean {
  const remainder = year % 33;

  return [
    1,
    5,
    9,
    13,
    17,
    22,
    26,
    30,
  ].includes(remainder);
}

function getTotalDaysPersianYear(year: number): number {
  return isLeapPersianYear(year) ? 366 : 365;
}

function getDayOfYearPersian(
  month: number,
  day: number
): number {
  if (month <= 6) {
    return (month - 1) * 31 + day;
  }

  return 186 + (month - 7) * 30 + day;
}

function getYearProgress(
  year: number,
  month: number,
  day: number
): Progress {
  const totalDays =
    getTotalDaysPersianYear(year);

  const dayOfYear =
    getDayOfYearPersian(month, day);

  const remaining =
    totalDays - dayOfYear;

  const percent = Math.round(
    (dayOfYear / totalDays) * 100
  );

  return {
    percent,
    dayOfYear,
    remaining,
    totalDays,
  };
}

/* =========================================================
   حیوان سال
   ۱۴۰۰ = گاو
========================================================= */

function getIranianAnimal(year: number): string {
  const animals = [
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
    "موش",
  ];

  return animals[(year - 1400) % 12 < 0
    ? ((year - 1400) % 12) + 12
    : (year - 1400) % 12];
}

/* =========================================================
   برج
========================================================= */

function getZodiac(
  month: number,
  day: number
): string {
  if (month === 1) return "حمل ♈";
  if (month === 2) return "ثور ♉";
  if (month === 3) return "جوزا ♊";
  if (month === 4) return "سرطان ♋";
  if (month === 5) return "اسد ♌";
  if (month === 6) return "سنبله ♍";
  if (month === 7) return "میزان ♎";
  if (month === 8) return "عقرب ♏";
  if (month === 9) return "قوس ♐";
  if (month === 10) return "جدی ♑";
  if (month === 11) return "دلو ♒";
  return "حوت ♓";
}

/* =========================================================
   وضعیت تقریبی ماه
========================================================= */

function getMoonPhase(date: Date): string {
  const knownNewMoon =
    Date.UTC(2000, 0, 6, 18, 14);

  const synodicMonth =
    29.530588853;

  const days =
    (date.getTime() - knownNewMoon) /
    86400000;

  const age =
    ((days % synodicMonth) +
      synodicMonth) %
    synodicMonth;

  if (age < 1.85)
    return "ماه نو 🌑";

  if (age < 7.38)
    return "هلال افزاینده 🌒";

  if (age < 9.23)
    return "تربیع اول 🌓";

  if (age < 14.77)
    return "محدب افزاینده 🌔";

  if (age < 16.61)
    return "ماه کامل 🌕";

  if (age < 22.15)
    return "محدب کاهنده 🌖";

  if (age < 23.99)
    return "تربیع آخر 🌗";

  return "هلال کاهنده 🌘";
}

/* =========================================================
   فصل
========================================================= */

type Season =
  | "spring"
  | "summer"
  | "autumn"
  | "winter";

function getSeason(month: number): Season {
  if (month >= 1 && month <= 3)
    return "spring";

  if (month >= 4 && month <= 6)
    return "summer";

  if (month >= 7 && month <= 9)
    return "autumn";

  return "winter";
}

/* =========================================================
   پس‌زمینه‌های فصلی
   انتخاب براساس روز سال
========================================================= */

const SEASONAL_BACKGROUNDS: Record<
  Season,
  string[]
> = {
  spring: [
    "https://images.unsplash.com/photo-1497250681960-ef046c08a56e?auto=format&fit=crop&w=1400&q=90",
    "https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?auto=format&fit=crop&w=1400&q=90",
    "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=1400&q=90",
    "https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1400&q=90",
    "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1400&q=90",
    "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1400&q=90",
  ],

  summer: [
    "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1400&q=90",
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1400&q=90",
    "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=1400&q=90",
    "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1400&q=90",
    "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1400&q=90",
    "https://images.unsplash.com/photo-1470770903676-69b98201ea1c?auto=format&fit=crop&w=1400&q=90",
  ],

  autumn: [
    "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=1400&q=90",
    "https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=1400&q=90",
    "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1400&q=90",
    "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1400&q=90",
    "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1400&q=90",
    "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1400&q=90",
    "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1400&q=90",
  ],

  winter: [
    "https://images.unsplash.com/photo-1457269449834-928af64c684d?auto=format&fit=crop&w=1400&q=90",
    "https://images.unsplash.com/photo-1483664852095-d6cc6870702d?auto=format&fit=crop&w=1400&q=90",
    "https://images.unsplash.com/photo-1517299321609-52687d1bc55a?auto=format&fit=crop&w=1400&q=90",
    "https://images.unsplash.com/photo-1453306458620-5bbef13a5bca?auto=format&fit=crop&w=1400&q=90",
    "https://images.unsplash.com/photo-1516431883659-655d41c09bf9?auto=format&fit=crop&w=1400&q=90",
    "https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=1400&q=90",
  ],
};

function getSeasonBackground(
  season: Season,
  dayOfYear: number
): string {
  const list =
    SEASONAL_BACKGROUNDS[season];

  return list[
    (dayOfYear - 1) % list.length
  ];
}

/* =========================================================
   مناسبت‌های ایران
   کلید: ماه-روز
========================================================= */

const IRAN_EVENTS: Record<
  string,
  string[]
> = {
  "1-1": ["نوروز"],
  "1-2": ["نوروز"],
  "1-3": ["نوروز"],
  "1-4": ["نوروز"],
  "1-12": ["روز جمهوری اسلامی ایران"],
  "1-13": ["روز طبیعت"],
  "1-25": ["روز بزرگداشت عطار نیشابوری"],
  "2-1": ["روز بزرگداشت سعدی"],
  "2-10": ["روز ملی خلیج فارس"],
  "2-25": ["روز بزرگداشت فردوسی"],
  "3-14": ["رحلت امام خمینی"],
  "3-15": ["قیام خونین ۱۵ خرداد"],
  "3-31": ["روز ملی صنعت و معدن"],
  "4-14": ["روز قلم"],
  "4-25": ["روز بهزیستی و تأمین اجتماعی"],
  "5-17": ["روز خبرنگار"],
  "5-26": ["روز کارآفرینی و آموزش‌های فنی و حرفه‌ای"],
  "6-1": ["روز پزشک"],
  "6-4": ["روز کارمند"],
  "6-5": ["روز بزرگداشت زکریای رازی"],
  "6-13": ["روز تعاون"],
  "6-17": ["روز جهانی صلح"],
  "7-1": ["روز بزرگداشت مولانا"],
  "7-7": ["روز آتش‌نشانی و ایمنی"],
  "7-8": ["روز بزرگداشت مولوی"],
  "7-14": ["روز تهران"],
  "7-20": ["روز بزرگداشت حافظ"],
  "8-13": ["روز دانش‌آموز"],
  "8-24": ["روز کتاب و کتابخوانی"],
  "9-5": ["روز بسیج مستضعفین"],
  "9-7": ["روز نیروی دریایی"],
  "9-16": ["روز دانشجو"],
  "9-25": ["روز پژوهش"],
  "10-1": ["روز ثبت احوال"],
  "10-7": ["روز بزرگداشت نهضت سوادآموزی"],
  "10-13": ["روز جهانی مقاومت"],
  "11-12": ["روز بازگشت امام خمینی"],
  "11-22": ["پیروزی انقلاب اسلامی"],
  "12-5": ["روز مهندسی"],
  "12-14": ["روز احسان و نیکوکاری"],
  "12-15": ["روز درختکاری"],
  "12-22": ["روز بزرگداشت شهدا"],
};

/* =========================================================
   مناسبت‌های بین‌المللی
========================================================= */

const INTERNATIONAL_EVENTS: Record<
  string,
  string[]
> = {
  "1-4": ["روز جهانی آگاهی از مین"],
  "2-3": ["روز جهانی آزادی مطبوعات"],
  "2-15": ["روز جهانی خانواده"],
  "3-8": ["روز جهانی زن"],
  "3-20": ["روز جهانی شادی"],
  "3-21": ["روز جهانی جنگل‌ها"],
  "3-22": ["روز جهانی آب"],
  "3-23": ["روز جهانی هواشناسی"],
  "4-7": ["روز جهانی بهداشت"],
  "4-22": ["روز زمین"],
  "5-3": ["روز جهانی آزادی مطبوعات"],
  "5-15": ["روز جهانی خانواده"],
  "6-5": ["روز جهانی محیط زیست"],
  "6-8": ["روز جهانی اقیانوس‌ها"],
  "6-20": ["روز جهانی پناهندگان"],
  "7-30": ["روز جهانی دوستی"],
  "8-9": ["روز جهانی مردمان بومی"],
  "8-12": ["روز جهانی جوانان"],
  "9-8": ["روز جهانی سوادآموزی"],
  "9-21": ["روز جهانی صلح"],
  "10-1": ["روز جهانی سالمندان"],
  "10-4": ["روز جهانی حیوانات"],
  "10-5": ["روز جهانی معلم", "روز جهانی زیستگاه"],
  "10-10": ["روز جهانی سلامت روان"],
  "10-16": ["روز جهانی غذا"],
  "11-14": ["روز جهانی دیابت"],
  "11-20": ["روز جهانی کودک"],
  "12-1": ["روز جهانی ایدز"],
  "12-3": ["روز جهانی افراد دارای معلولیت"],
  "12-5": ["روز جهانی داوطلب"],
  "12-10": ["روز جهانی حقوق بشر"],
  "12-18": ["روز جهانی مهاجران"],
};

/* =========================================================
   مناسبت‌ها
========================================================= */

function getEvents(
  month: number,
  day: number,
  gregorianMonth: number,
  gregorianDay: number
) {
  const iran =
    IRAN_EVENTS[`${month}-${day}`] || [];

  const international =
    INTERNATIONAL_EVENTS[
      `${gregorianMonth}-${gregorianDay}`
    ] || [];

  return {
    iran,
    international,
  };
}

/* =========================================================
   سخنان مستند
   31 مورد برای روزهای ماه
========================================================= */

const DAILY_QUOTES: DailyContent[] = [
  {
    quote:
      "بنی آدم اعضای یکدیگرند که در آفرینش ز یک گوهرند",
    author: "سعدی",
    source: "گلستان، دیباچه",
    thought:
      "امروز با رفتارم چه اثری بر حال دیگران می‌گذارم؟",
  },
  {
    quote:
      "تو نیکی می‌کن و در دجله انداز",
    author: "سعدی",
    source: "گلستان سعدی",
    thought:
      "اگر انتظار تشکر نداشته باشم، چه کار خوبی انجام می‌دهم؟",
  },
  {
    quote:
      "مشک آن است که خود ببوید، نه آن که عطار بگوید",
    author: "سعدی",
    source: "گلستان، باب هشتم",
    thought:
      "آیا کیفیت کارم خودش معرف من هست؟",
  },
  {
    quote:
      "توانا بود هر که دانا بود",
    author: "فردوسی",
    source: "شاهنامه",
    thought:
      "امروز چه چیزی می‌توانم یاد بگیرم؟",
  },
  {
    quote:
      "ز گهواره تا گور دانش بجوی",
    author: "حکمت مشهور",
    source: "ضرب‌المثل فارسی",
    thought:
      "کدام دانشی را مدت‌هاست به تعویق انداخته‌ام؟",
  },
  {
    quote:
      "هر که ناموخت از گذشت روزگار نیز ناموزد ز هیچ آموزگار",
    author: "فردوسی",
    source: "شاهنامه",
    thought:
      "از تجربه دیروز چه درسی برای امروز دارم؟",
  },
  {
    quote:
      "این قافله عمر عجب می‌گذرد",
    author: "حافظ",
    source: "غزل حافظ",
    thought:
      "اگر امروز تکرار نشود، دوست دارم چگونه از آن یاد کنم؟",
  },
  {
    quote:
      "وقت را غنیمت دان آن قدر که بتوانی",
    author: "سعدی",
    source: "گلستان سعدی",
    thought:
      "کدام کار مهم را نباید به فردا بسپارم؟",
  },
  {
    quote:
      "بنی آدم اعضای یک پیکرند",
    author: "سعدی",
    source: "گلستان، دیباچه",
    thought:
      "امروز چگونه می‌توانم بخشی از یک مشکل جمعی را حل کنم؟",
  },
  {
    quote:
      "تو پای به راه در نه و هیچ مپرس",
    author: "عطار",
    source: "منطق‌الطیر",
    thought:
      "شروع نکردن کدام کار، بزرگ‌ترین مانع من است؟",
  },
  {
    quote:
      "این نیز بگذرد",
    author: "حکمت فارسی",
    source: "حکمت و ادبیات فارسی",
    thought:
      "در یک شرایط سخت، چه چیزی موقتی است؟",
  },
  {
    quote:
      "چو دخلت نیست، خرج آهسته‌تر کن",
    author: "سعدی",
    source: "گلستان سعدی",
    thought:
      "امروز کجا می‌توانم ساده‌تر و هوشمندانه‌تر عمل کنم؟",
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
      "صلاح کار کجا و من خراب کجا",
    author: "حافظ",
    source: "غزلیات حافظ",
    thought:
      "آیا قبل از قضاوت، همه جوانب را می‌بینم؟",
  },
  {
    quote:
      "هر که دلارام دید از دلش آرام رفت",
    author: "حافظ",
    source: "غزلیات حافظ",
    thought:
      "چه چیزی واقعاً به زندگی من آرامش می‌دهد؟",
  },
  {
    quote:
      "کار نیکو کردن از پر کردن است",
    author: "ضرب‌المثل فارسی",
    source: "ضرب‌المثل مشهور فارسی",
    thought:
      "کدام مهارت با تمرین مداوم بهتر می‌شود؟",
  },
  {
    quote:
      "رهرو آن است که آهسته و پیوسته رود",
    author: "ضرب‌المثل فارسی",
    source: "ضرب‌المثل مشهور فارسی",
    thought:
      "امروز کوچک‌ترین قدم مفید من چیست؟",
  },
  {
    quote:
      "جهان یادگار است و ما رفتنی",
    author: "فردوسی",
    source: "شاهنامه",
    thought:
      "چه اثری دوست دارم از من باقی بماند؟",
  },
  {
    quote:
      "به جهان خرم از آنم که جهان خرم از اوست",
    author: "حافظ",
    source: "غزلیات حافظ",
    thought:
      "آیا شادی خودم را به شادی دیگران گره می‌زنم؟",
  },
  {
    quote:
      "خوشا شیراز و وضع بی‌مثالش",
    author: "حافظ",
    source: "غزلیات حافظ",
    thought:
      "چه چیز ساده‌ای امروز می‌تواند حال مرا بهتر کند؟",
  },
  {
    quote:
      "تو خود حجاب خودی حافظ از میان برخیز",
    author: "حافظ",
    source: "غزلیات حافظ",
    thought:
      "کدام محدودیت را خودم برای خودم ساخته‌ام؟",
  },
  {
    quote:
      "هر کسی کو دور ماند از اصل خویش",
    author: "مولانا",
    source: "مثنوی معنوی، دفتر اول",
    thought:
      "چه چیزی مرا از ارزش‌های اصلی‌ام دور می‌کند؟",
  },
  {
    quote:
      "این جهان کوه است و فعل ما ندا",
    author: "مولانا",
    source: "مثنوی معنوی",
    thought:
      "رفتار من چه بازتابی در اطرافم ایجاد می‌کند؟",
  },
  {
    quote:
      "آب کم جو، تشنگی آور به دست",
    author: "مولانا",
    source: "مثنوی معنوی",
    thought:
      "آیا برای خواسته‌هایم اشتیاق واقعی دارم؟",
  },
  {
    quote:
      "از محبت تلخ‌ها شیرین شود",
    author: "مولانا",
    source: "مثنوی معنوی",
    thought:
      "امروز محبت را کجا می‌توانم بیشتر نشان دهم؟",
  },
  {
    quote:
      "تو برای وصل کردن آمدی",
    author: "مولانا",
    source: "مثنوی معنوی",
    thought:
      "امروز کدام فاصله را می‌توانم کمتر کنم؟",
  },
  {
    quote:
      "هر نفس نو می‌شود دنیا و ما",
    author: "مولانا",
    source: "مثنوی معنوی",
    thought:
      "اگر امروز را شروعی تازه بدانم، چه چیزی را تغییر می‌دهم؟",
  },
  {
    quote:
      "به راه بادیه رفتن به از نشستن باطل",
    author: "سعدی",
    source: "غزلیات سعدی",
    thought:
      "حرکت ناقص بهتر است یا انتظار برای شرایط کامل؟",
  },
  {
    quote:
      "نابرده رنج گنج میسر نمی‌شود",
    author: "سعدی",
    source: "گلستان سعدی",
    thought:
      "برای رسیدن به هدفم حاضر به تحمل کدام سختی هستم؟",
  },
  {
    quote:
      "هر که عیب دگران پیش تو آورد و شمرد",
    author: "سعدی",
    source: "گلستان سعدی",
    thought:
      "آیا به جای عیب‌جویی، دنبال راه‌حل می‌گردم؟",
  },
  {
    quote:
      "دلا معاش چنان کن که گر بلغزد پای",
    author: "حافظ",
    source: "غزلیات حافظ",
    thought:
      "چه چیزی در زندگی من نیازمند تعادل بیشتری است؟",
  },
  {
    quote:
      "آسایش دو گیتی تفسیر این دو حرف است",
    author: "حافظ",
    source: "غزلیات حافظ",
    thought:
      "امروز چه چیزی را می‌توانم با آرامش بیشتری انجام دهم؟",
  },
];

/* =========================================================
   محتوای روزانه
========================================================= */

function getDailyContent(
  day: number
): DailyContent {
  return DAILY_QUOTES[
    (day - 1) % DAILY_QUOTES.length
  ];
}

/* =========================================================
   ساخت HTML
========================================================= */

function buildHtml(params: {
  background: string;
  title: string;
  greeting: string;
  solar: string;
  solarLong: string;
  gregorian: string;
  islamic: string;
  weekday: string;
  time: string;
  moon: string;
  animal: string;
  zodiac: string;
  progress: Progress;
  iranEvents: string[];
  internationalEvents: string[];
  content: DailyContent;
  season: Season;
}) {
  const {
    background,
    title,
    greeting,
    solar,
    solarLong,
    gregorian,
    islamic,
    weekday,
    time,
    moon,
    animal,
    zodiac,
    progress,
    iranEvents,
    internationalEvents,
    content,
    season,
  } = params;

  const seasonName =
    season === "spring"
      ? "بهار"
      : season === "summer"
      ? "تابستان"
      : season === "autumn"
      ? "پاییز"
      : "زمستان";

  const iranHtml =
    iranEvents.length > 0
      ? iranEvents
          .map(
            (event) =>
              `<div class="event-line">
                <span class="event-dot"></span>
                <span>${escapeHtml(
                  normalizePersian(event)
                )}</span>
              </div>`
          )
          .join("")
      : `<div class="empty-event">مناسبت شاخصی ثبت نشده است</div>`;

  const internationalHtml =
    internationalEvents.length > 0
      ? internationalEvents
          .map(
            (event) =>
              `<div class="event-line">
                <span class="event-dot"></span>
                <span>${escapeHtml(
                  normalizePersian(event)
                )}</span>
              </div>`
          )
          .join("")
      : `<div class="empty-event">مناسبت بین‌المللی شاخصی ثبت نشده است</div>`;

  return `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport"
      content="width=${WIDTH}, initial-scale=1.0" />

<style>

@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800;900&display=swap');

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
    "Vazirmatn",
    Tahoma,
    Arial,
    sans-serif;

  color: #ffffff;

  background:
    linear-gradient(
      180deg,
      rgba(3, 12, 20, 0.30) 0%,
      rgba(4, 15, 20, 0.05) 22%,
      rgba(2, 10, 15, 0.12) 45%,
      rgba(1, 9, 14, 0.82) 100%
    ),
    url("${background}") center center / cover no-repeat;

  position: relative;
}

/* ======================================================
   لایه‌های زیباسازی
====================================================== */

body::before {
  content: "";
  position: absolute;
  inset: 0;

  background:
    radial-gradient(
      circle at 82% 12%,
      rgba(255, 214, 94, 0.30),
      transparent 22%
    ),
    radial-gradient(
      circle at 12% 36%,
      rgba(76, 201, 240, 0.22),
      transparent 25%
    ),
    linear-gradient(
      115deg,
      rgba(0,0,0,0.25),
      transparent 35%,
      rgba(0,0,0,0.30)
    );

  pointer-events: none;
}

body::after {
  content: "";
  position: absolute;
  inset: 0;

  background:
    linear-gradient(
      90deg,
      rgba(255,255,255,0.08) 1px,
      transparent 1px
    );

  background-size: 64px 64px;

  opacity: 0.035;
  pointer-events: none;
}

/* ======================================================
   پوستر
====================================================== */

.poster {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 54px 62px 52px;

  display: flex;
  flex-direction: column;

  z-index: 2;
}

/* ======================================================
   نوار بالایی
====================================================== */

.top {
  position: relative;
  text-align: right;
  margin-bottom: 24px;
}

.top-accent {
  width: 92px;
  height: 7px;
  border-radius: 20px;

  background:
    linear-gradient(
      90deg,
      #ffd166,
      #06d6a0,
      #4cc9f0
    );

  margin-bottom: 18px;

  box-shadow:
    0 0 22px rgba(255,209,102,0.45);
}

.title {
  font-size: 39px;
  line-height: 1.35;
  font-weight: 900;

  text-shadow:
    0 4px 16px rgba(0,0,0,0.75);

  letter-spacing: -0.7px;
}

.greeting {
  margin-top: 9px;

  font-size: 31px;
  line-height: 1.35;

  font-weight: 700;

  color: #fff4c2;

  text-shadow:
    0 3px 12px rgba(0,0,0,0.85);
}

/* ======================================================
   تاریخ اصلی
====================================================== */

.hero {
  position: relative;

  margin-top: 12px;

  display: flex;
  flex-direction: column;
  align-items: flex-start;

  padding: 22px 0 24px;

  border-top:
    1px solid rgba(255,255,255,0.28);

  border-bottom:
    1px solid rgba(255,255,255,0.25);
}

.hero-season {
  font-size: 20px;
  font-weight: 600;

  color: rgba(255,255,255,0.86);

  margin-bottom: 4px;
}

.hero-date {
  font-size: 78px;
  line-height: 1.05;
  font-weight: 900;

  letter-spacing: -2px;

  text-shadow:
    0 5px 20px rgba(0,0,0,0.90);
}

.hero-long {
  margin-top: 7px;

  font-size: 29px;
  font-weight: 800;

  text-shadow:
    0 3px 13px rgba(0,0,0,0.8);
}

.time-row {
  margin-top: 13px;

  display: flex;
  align-items: center;
  gap: 12px;

  font-size: 27px;
  font-weight: 700;

  color: #f9fbff;
}

.time-icon {
  font-size: 31px;
}

/* ======================================================
   اطلاعات اصلی
====================================================== */

.info-zone {
  margin-top: 25px;

  display: grid;

  grid-template-columns:
    1fr 1fr;

  column-gap: 42px;
  row-gap: 0;

  border-bottom:
    1px solid rgba(255,255,255,0.22);
}

.info-item {
  min-height: 78px;

  display: flex;
  align-items: center;

  gap: 14px;

  border-bottom:
    1px solid rgba(255,255,255,0.14);
}

.info-icon {
  font-size: 28px;
  width: 42px;

  text-align: center;
}

.info-text {
  flex: 1;
}

.info-label {
  font-size: 17px;

  color:
    rgba(255,255,255,0.72);

  font-weight: 500;

  margin-bottom: 3px;
}

.info-value {
  font-size: 23px;

  font-weight: 800;

  text-shadow:
    0 2px 9px rgba(0,0,0,0.8);
}

/* ======================================================
   نوار پیشرفت سال
====================================================== */

.progress-zone {
  margin-top: 26px;
}

.progress-head {
  display: flex;
  justify-content: space-between;
  align-items: center;

  font-size: 21px;
  font-weight: 800;
}

.progress-percent {
  font-size: 30px;
  color: #ffe08a;

  text-shadow:
    0 2px 10px rgba(0,0,0,0.8);
}

.progress-track {
  position: relative;

  height: 13px;

  margin-top: 13px;

  border-radius: 30px;

  background:
    rgba(255,255,255,0.20);

  overflow: hidden;

  box-shadow:
    inset 0 1px 5px rgba(0,0,0,0.35);
}

.progress-fill {
  height: 100%;

  width: ${Math.max(
    2,
    progress.percent
  )}%;

  border-radius: 30px;

  background:
    linear-gradient(
      90deg,
      #00d4ff,
      #06d6a0,
      #ffd166
    );

  box-shadow:
    0 0 18px rgba(6,214,160,0.65);
}

.progress-meta {
  display: flex;
  justify-content: space-between;

  margin-top: 8px;

  color:
    rgba(255,255,255,0.76);

  font-size: 17px;
}

/* ======================================================
   مناسبت‌ها
====================================================== */

.events {
  margin-top: 28px;

  position: relative;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 11px;

  font-size: 29px;
  font-weight: 900;

  margin-bottom: 14px;

  text-shadow:
    0 3px 12px rgba(0,0,0,0.85);
}

.section-title::after {
  content: "";

  height: 3px;

  flex: 1;

  margin-right: 8px;

  background:
    linear-gradient(
      90deg,
      rgba(255,209,102,0.95),
      transparent
    );
}

.events-columns {
  display: grid;

  grid-template-columns:
    1fr 1fr;

  gap: 38px;
}

.event-column {
  min-height: 105px;

  border-right:
    4px solid rgba(255,209,102,0.85);

  padding-right: 18px;
}

.event-column.international {
  border-right-color:
    rgba(76,201,240,0.90);
}

.event-heading {
  font-size: 20px;

  font-weight: 800;

  margin-bottom: 10px;

  color: #ffe9a6;
}

.international .event-heading {
  color: #9fe8ff;
}

.event-line {
  display: flex;
  align-items: flex-start;

  gap: 10px;

  margin-bottom: 8px;

  font-size: 20px;

  line-height: 1.55;

  font-weight: 600;

  text-shadow:
    0 2px 8px rgba(0,0,0,0.9);
}

.event-dot {
  flex: 0 0 auto;

  width: 8px;
  height: 8px;

  margin-top: 10px;

  border-radius: 50%;

  background: #ffd166;

  box-shadow:
    0 0 10px rgba(255,209,102,0.9);
}

.international .event-dot {
  background: #4cc9f0;

  box-shadow:
    0 0 10px rgba(76,201,240,0.9);
}

.empty-event {
  font-size: 17px;

  color:
    rgba(255,255,255,0.55);
}

/* ======================================================
   نقل قول
====================================================== */

.quote-zone {
  margin-top: 27px;

  padding-top: 21px;

  border-top:
    1px solid rgba(255,255,255,0.25);
}

.quote-mark {
  font-family: Georgia, serif;

  font-size: 68px;

  line-height: 0.45;

  color: #ffd166;

  opacity: 0.85;
}

.quote {
  margin-top: 8px;

  font-size: 27px;

  line-height: 1.65;

  font-weight: 800;

  text-shadow:
    0 3px 13px rgba(0,0,0,0.95);
}

.author {
  margin-top: 7px;

  font-size: 19px;

  color: #ffe49a;

  font-weight: 700;
}

.source {
  margin-top: 2px;

  font-size: 15px;

  color:
    rgba(255,255,255,0.62);
}

/* ======================================================
   جرعه تفکر
====================================================== */

.thought-zone {
  margin-top: 19px;

  padding-top: 18px;

  border-top:
    1px solid rgba(255,255,255,0.18);
}

.thought-title {
  font-size: 24px;

  font-weight: 900;

  margin-bottom: 7px;
}

.thought {
  font-size: 25px;

  line-height: 1.65;

  font-weight: 700;

  text-shadow:
    0 3px 12px rgba(0,0,0,0.9);
}

/* ======================================================
   تزئینات تصویری
====================================================== */

.orbit {
  position: absolute;

  left: 38px;
  top: 118px;

  width: 88px;
  height: 88px;

  border:
    1px solid rgba(255,255,255,0.22);

  border-radius: 50%;

  opacity: 0.55;
}

.orbit::before {
  content: "";

  position: absolute;

  inset: 15px;

  border:
    1px solid rgba(255,209,102,0.40);

  border-radius: 50%;
}

.orbit::after {
  content: "✦";

  position: absolute;

  left: 34px;
  top: 27px;

  font-size: 23px;

  color: #ffe08a;
}

/* ======================================================
   عدم نمایش footer
====================================================== */

.footer {
  display: none;
}

</style>
</head>

<body>

<div class="poster">

  <div class="orbit"></div>

  <header class="top">

    <div class="top-accent"></div>

    <div class="title">
      ${escapeHtml(title)}
    </div>

    <div class="greeting">
      ${escapeHtml(greeting)} ☀️
    </div>

  </header>

  <section class="hero">

    <div class="hero-season">
      فصل ${escapeHtml(seasonName)}
    </div>

    <div class="hero-date">
      ${faDigits(solar)}
    </div>

    <div class="hero-long">
      ${escapeHtml(solarLong)}
    </div>

    <div class="time-row">
      <span class="time-icon">🕰️</span>
      <span>${escapeHtml(weekday)}</span>
      <span>•</span>
      <span>${faDigits(time)}</span>
    </div>

  </section>

  <section class="info-zone">

    <div class="info-item">
      <div class="info-icon">🌙</div>
      <div class="info-text">
        <div class="info-label">تقویم قمری</div>
        <div class="info-value">
          ${escapeHtml(islamic)}
        </div>
      </div>
    </div>

    <div class="info-item">
      <div class="info-icon">🌍</div>
      <div class="info-text">
        <div class="info-label">تقویم میلادی</div>
        <div class="info-value">
          ${escapeHtml(gregorian)}
        </div>
      </div>
    </div>

    <div class="info-item">
      <div class="info-icon">🌗</div>
      <div class="info-text">
        <div class="info-label">وضعیت ماه</div>
        <div class="info-value">
          ${escapeHtml(moon)}
        </div>
      </div>
    </div>

    <div class="info-item">
      <div class="info-icon">🐴</div>
      <div class="info-text">
        <div class="info-label">نماد سال</div>
        <div class="info-value">
          ${escapeHtml(animal)}
        </div>
      </div>
    </div>

    <div class="info-item">
      <div class="info-icon">♎</div>
      <div class="info-text">
        <div class="info-label">برج</div>
        <div class="info-value">
          ${escapeHtml(zodiac)}
        </div>
      </div>
    </div>

    <div class="info-item">
      <div class="info-icon">📅</div>
      <div class="info-text">
        <div class="info-label">روز سال</div>
        <div class="info-value">
          ${faDigits(progress.dayOfYear)}
          از
          ${faDigits(progress.totalDays)}
        </div>
      </div>
    </div>

  </section>

  <section class="progress-zone">

    <div class="progress-head">

      <span>
        📊 پیشرفت سال ${faDigits(progress.percent)}٪
      </span>

      <span class="progress-percent">
        ${faDigits(progress.percent)}٪
      </span>

    </div>

    <div class="progress-track">
      <div class="progress-fill"></div>
    </div>

    <div class="progress-meta">

      <span>
        روز ${faDigits(progress.dayOfYear)}
      </span>

      <span>
        ${faDigits(progress.remaining)}
        روز باقی‌مانده
      </span>

    </div>

  </section>

  <section class="events">

    <div class="section-title">
      🗓️ رویدادها و مناسبت‌ها
    </div>

    <div class="events-columns">

      <div class="event-column">

        <div class="event-heading">
          🇮🇷 ایران
        </div>

        ${iranHtml}

      </div>

      <div class="event-column international">

        <div class="event-heading">
          🌐 جهان
        </div>

        ${internationalHtml}

      </div>

    </div>

  </section>

  <section class="quote-zone">

    <div class="quote-mark">“</div>

    <div class="quote">
      ${escapeHtml(
        normalizePersian(content.quote)
      )}
    </div>

    <div class="author">
      — ${escapeHtml(content.author)}
    </div>

    <div class="source">
      منبع: ${escapeHtml(content.source)}
    </div>

  </section>

  <section class="thought-zone">

    <div class="thought-title">
      💭 جرعه‌ای تفکر
    </div>

    <div class="thought">
      ${escapeHtml(
        normalizePersian(content.thought)
      )}
    </div>

  </section>

</div>

</body>
</html>
`;
}

/* =========================================================
   ارسال عکس به بله
========================================================= */

async function sendPhoto(
  env: Env,
  imageBytes: Uint8Array
) {
  const form =
    new FormData();

  const safeImageBytes = new Uint8Array(imageBytes);

const blob = new Blob(
  [safeImageBytes],
  { type: "image/png" }
);

  form.append(
    "chat_id",
    env.BALE_GROUP_ID
  );

  form.append(
    "photo",
    blob,
    "calendar-daily.png"
  );

  /*
   * عمداً caption نداریم.
   * بنابراین هیچ نوشته‌ای زیر تصویر
   * در بله نمایش داده نمی‌شود.
   */

  const response =
    await fetch(
      `${BALE_API}${env.BALE_SMART_TOKEN}/sendPhoto`,
      {
        method: "POST",
        body: form,
      }
    );

  const text =
    await response.text();

  let data: any;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      ok: false,
      raw: text,
    };
  }

  return {
    status: response.status,
    data,
  };
}

/* =========================================================
   GET
========================================================= */

export async function GET(
  request: Request
) {
  try {
    const { env } =
      await getCloudflareContext({
        async: true,
      });

    const cloudflareEnv =
      env as unknown as Env;

    if (
      !cloudflareEnv.BALE_SMART_TOKEN ||
      !cloudflareEnv.BALE_GROUP_ID
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "BALE_SMART_TOKEN یا BALE_GROUP_ID تنظیم نشده است.",
        },
        { status: 500 }
      );
    }

    const now =
      new Date();

    const tehran =
      getTehranParts();

    const jalali =
      gregorianToJalali(
        tehran.year,
        tehran.month,
        tehran.day
      );

    const weekday =
      WEEKDAYS[tehran.weekday] ||
      tehran.weekday;

    const progress =
      getYearProgress(
        jalali.year,
        jalali.month,
        jalali.day
      );

    const dateForMoon =
      new Date(
        Date.UTC(
          tehran.year,
          tehran.month - 1,
          tehran.day
        )
      );

    const islamic =
      getIslamicDate(
        dateForMoon
      );

    const moon =
      getMoonPhase(
        now
      );

    const animal =
      getIranianAnimal(
        jalali.year
      );

    const zodiac =
      getZodiac(
        jalali.month,
        jalali.day
      );

    const season =
      getSeason(
        jalali.month
      );

    const background =
      getSeasonBackground(
        season,
        progress.dayOfYear
      );

    const gregorianMonth =
      tehran.month;

    const gregorianDay =
      tehran.day;

    const events =
      getEvents(
        jalali.month,
        jalali.day,
        gregorianMonth,
        gregorianDay
      );

    const content =
      getDailyContent(
        jalali.day
      );

    const solar =
      `${jalali.year}/${jalali.month}/${jalali.day}`;

    const solarLong =
      `${jalali.day} ${PERSIAN_MONTHS[jalali.month]} ${jalali.year}`;

    const gregorian =
      `${gregorianDay} ${GREGORIAN_MONTHS[gregorianMonth]} ${tehran.year}`;

    const islamicText =
      `${islamic.day} ${ISLAMIC_MONTHS[islamic.month]} ${islamic.year}`;

    const time =
      `${String(tehran.hour).padStart(2, "0")}:${String(
        tehran.minute
      ).padStart(2, "0")}`;

    const title =
      "تقویم روزانه گروه صدای کارکنان ثبت احوال";

    const greeting =
      "روزت پر از اتفاقات خوب";

    const html =
      buildHtml({
        background,
        title,
        greeting,
        solar,
        solarLong,
        gregorian,
        islamic: islamicText,
        weekday,
        time,
        moon,
        animal,
        zodiac,
        progress,
        iranEvents: events.iran,
        internationalEvents:
          events.international,
        content,
        season,
      });

    if (!cloudflareEnv.BROWSER) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "BROWSER binding پیدا نشد.",
        },
        { status: 500 }
      );
    }

    const screenshot =
      await cloudflareEnv.BROWSER.quickAction(
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

          waitForTimeout: 1800,
        }
      );

    const imageBytes =
      new Uint8Array(
        await screenshot.arrayBuffer()
      );

    const bale =
      await sendPhoto(
        cloudflareEnv,
        imageBytes
      );

    return NextResponse.json({
      ok: true,
      cancelled: false,
      sent: Boolean(
        bale.data?.ok
      ),

      bale_status:
        bale.status,

      bale: bale.data,

      date: {
        solar,
        solar_persian:
          faDigits(solar),
        solar_long:
          solarLong,
        weekday,
        time:
          faDigits(time),
        gregorian,
        islamic:
          islamicText,
      },

      content: {
        quote:
          content.quote,
        author:
          content.author,
        source:
          content.source,
        thought:
          content.thought,
        day:
          jalali.day,
        day_persian:
          faDigits(jalali.day),
      },

      season: {
        name:
          season === "spring"
            ? "بهار"
            : season === "summer"
            ? "تابستان"
            : season === "autumn"
            ? "پاییز"
            : "زمستان",
        background,
        background_index:
          (progress.dayOfYear - 1) %
          SEASONAL_BACKGROUNDS[season]
            .length,
      },

      image: {
        format: "png",
        bytes:
          imageBytes.byteLength,
        width: WIDTH,
        height: HEIGHT,
      },

      design: {
        version:
          "nature-seasonal-infographic-v4",

        title:
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

        seasonal_background:
          true,

        season:
          season,

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

        large_text:
          true,

        high_readability:
          true,

        mobile_friendly:
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

  } catch (error: any) {
    console.error(
      "DAILY CALENDAR ERROR:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          String(error),
      },
      { status: 500 }
    );
  }
}

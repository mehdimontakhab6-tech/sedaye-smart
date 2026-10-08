import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

const MAX_NEWS = 20;
const MIN_MEDIA = 1;
const REQUEST_TIMEOUT_MS = 7000;

type NewsItem = {
  title: string;
  url: string;
  source: string;
  domain: string;
  publishedAt: string;
};

type Candidate = {
  title: string;
  url: string;
  source: string;
  domain: string;
  publishedAt?: string;
  description?: string;
};

type SourceConfig = {
  url: string;
  domain: string;
  source: string;
};

type SourceResult = {
  source: string;
  domain: string;
  url: string;
  httpStatus: number | null;
  rawItems: number;
  parsedItems: number;
  relevantItems: number;
  windowItems: number;
  noDateItems: number;
  error: string | null;
};

/*
 * رسانه‌های معتبر داخلی
 */
const TRUSTED_MEDIA: Record<string, string> = {
  "irna.ir": "ایرنا",
  "irna.news": "ایرنا",
  "isna.ir": "ایسنا",
  "mehrnews.com": "مهر",
  "tasnimnews.ir": "تسنیم",
  "tasnimnews.com": "تسنیم",
  "farsnews.ir": "فارس",
  "farsnews.com": "فارس",
  "ilna.ir": "ایلنا",
  "yjc.ir": "باشگاه خبرنگاران جوان",
  "khabaronline.ir": "خبرآنلاین",
  "tabnak.ir": "تابناک",
  "asriran.com": "عصر ایران",
  "hamshahrionline.ir": "همشهری آنلاین",
  "jamejamonline.ir": "جام جم آنلاین",
  "mizanonline.ir": "میزان",
  "snn.ir": "خبرگزاری دانشجو",
  "ana.ir": "خبرگزاری آنا",
  "shana.ir": "شانا",
  "iqna.ir": "ایکنا",
  "entekhab.ir": "انتخاب",
  "fararu.com": "فرارو",
};

/*
 * منابع RSS
 */
const RSS_SOURCES: SourceConfig[] = [
  {
    url: "https://www.irna.ir/rss",
    domain: "irna.ir",
    source: "ایرنا",
  },
  {
    url: "https://www.isna.ir/rss",
    domain: "isna.ir",
    source: "ایسنا",
  },
  {
    url: "https://www.mehrnews.com/rss",
    domain: "mehrnews.com",
    source: "مهر",
  },
  {
    url: "https://www.farsnews.ir/rss",
    domain: "farsnews.ir",
    source: "فارس",
  },
  {
    url: "https://www.ilna.ir/rss",
    domain: "ilna.ir",
    source: "ایلنا",
  },
  {
    url: "https://www.yjc.ir/fa/rss/allnews",
    domain: "yjc.ir",
    source: "باشگاه خبرنگاران جوان",
  },
  {
    url: "https://www.khabaronline.ir/rss",
    domain: "khabaronline.ir",
    source: "خبرآنلاین",
  },
  {
    url: "https://www.tabnak.ir/fa/rss/allnews",
    domain: "tabnak.ir",
    source: "تابناک",
  },
  {
    url: "https://www.asriran.com/fa/rss/allnews",
    domain: "asriran.com",
    source: "عصر ایران",
  },
  {
    url: "https://www.hamshahrionline.ir/rss",
    domain: "hamshahrionline.ir",
    source: "همشهری آنلاین",
  },
  {
    url: "https://jamejamonline.ir/fa/rss",
    domain: "jamejamonline.ir",
    source: "جام جم آنلاین",
  },
  {
    url: "https://www.mizanonline.ir/fa/rss",
    domain: "mizanonline.ir",
    source: "میزان",
  },
  {
    url: "https://snn.ir/fa/rss",
    domain: "snn.ir",
    source: "خبرگزاری دانشجو",
  },
  {
    url: "https://ana.ir/fa/rss",
    domain: "ana.ir",
    source: "خبرگزاری آنا",
  },
  {
    url: "https://www.shana.ir/rss",
    domain: "shana.ir",
    source: "شانا",
  },
  {
    url: "https://iqna.ir/fa/rss",
    domain: "iqna.ir",
    source: "ایکنا",
  },
  {
    url: "https://www.tasnimnews.ir/fa/rss",
    domain: "tasnimnews.ir",
    source: "تسنیم",
  },
  {
    url:
      "https://www.tasnimnews.com/fa/rss/feed/0/8/0/%D9%85%D9%87%D9%85%D8%AA%D8%B1%DB%8C%D9%86-%D8%AE%D8%A8%D8%B1%D9%87%D8%A7%DB%8C-%D8%AA%D8%B3%D9%86%DB%8C%D9%85",
    domain: "tasnimnews.com",
    source: "تسنیم",
  },
  {
    url: "https://www.entekhab.ir/fa/rss",
    domain: "entekhab.ir",
    source: "انتخاب",
  },
  {
    url: "https://www.fararu.com/rss",
    domain: "fararu.com",
    source: "فرارو",
  },
];

/*
 * منبع تخصصی تسنیم
 */
const SPECIAL_SOURCES: SourceConfig[] = [
  {
    url:
      "https://tasnimnews.ir/fa/keyword/4067/%D8%B3%D8%A7%D8%B2%D9%85%D8%A7%D9%86-%D8%AB%D8%A8%D8%AA-%D8%A7%D8%AD%D9%88%D8%A7%D9%84-%DA%A9%D8%B4%D9%88%D8%B1",
    domain: "tasnimnews.ir",
    source: "تسنیم",
  },
];

/*
 * دامنه‌های غیرمجاز
 */
const BLOCKED_DOMAINS = new Set([
  "bbc.com",
  "bbc.co.uk",
  "bbc.in",
  "voanews.com",
  "rferl.org",
  "radiofarda.com",
  "iranintl.com",
  "iranintl.net",
  "dw.com",
  "dw.de",
  "reuters.com",
  "apnews.com",
  "afp.com",
  "aljazeera.com",
  "aljazeera.net",
  "france24.com",
  "nytimes.com",
  "washingtonpost.com",
  "theguardian.com",
  "cnn.com",
  "foxnews.com",
  "skynews.com",
  "npr.org",
]);

/*
 * واژه‌های بسیار قوی و اختصاصی ثبت احوال
 *
 * وجود این موارد در عنوان، نشانه بسیار قوی
 * برای مرتبط بودن خبر است.
 */
const STRONG_TERMS = [
  "ثبت احوال",
  "سازمان ثبت احوال",
  "سازمان ثبت احوال کشور",
  "ثبت احوال کشور",
  "خدمات ثبت احوال",
  "داده های ثبت احوال",
  "داده‌های ثبت احوال",
  "آمار ثبت احوال",
  "مرکز رصد جمعیت",
  "رصد جمعیت کشور",
  "سامانه سهیم",
  "کارت هوشمند ملی",
  "گواهی فوت",
  "گواهی ولادت",
  "گواهی حصر وراثت",
  "حصر وراثت",
  "انحصار وراثت",
  "تغییر نام خانوادگی",
];

/*
 * واژه‌های هویتی
 *
 * این‌ها به تنهایی همیشه کافی نیستند،
 * بنابراین در فیلتر نهایی با زمینه ثبت احوال
 * بررسی می‌شوند.
 */
const SECONDARY_TERMS = [
  "کارت ملی",
  "شناسنامه",
  "مدارک هویتی",
  "مدرک هویتی",
  "خدمات هویتی",
  "اطلاعات هویتی",
  "هویت ایرانی",
  "داده های هویتی",
  "داده‌های هویتی",
  "تغییر نام",
  "رصد جمعیت",
];

/*
 * موضوعات جمعیتی/ثبت وقایع
 *
 * این واژه‌ها به تنهایی هرگز کافی نیستند.
 */
const CONTEXT_TERMS = [
  "ولادت",
  "وفات",
  "ازدواج",
  "طلاق",
  "جمعیت",
  "هویتی",
  "تولد",
  "فوت",
];

/*
 * واژه‌هایی که برای اثبات ارتباط با ثبت احوال
 * در عنوان یا توضیحات قابل استفاده‌اند.
 */
const REGISTRATION_CONTEXT_TERMS = [
  "ثبت احوال",
  "سازمان ثبت احوال",
  "خدمات ثبت احوال",
  "ثبت احوال کشور",
  "کارت ملی",
  "کارت هوشمند ملی",
  "شناسنامه",
  "مدارک هویتی",
  "مدرک هویتی",
  "خدمات هویتی",
  "اطلاعات هویتی",
  "هویت ایرانی",
  "سامانه سهیم",
  "حصر وراثت",
  "انحصار وراثت",
  "گواهی فوت",
  "گواهی ولادت",
  "گواهی حصر وراثت",
  "تغییر نام خانوادگی",
  "تغییر نام",
  "آمار ثبت احوال",
  "داده های ثبت احوال",
  "داده‌های ثبت احوال",
  "رصد جمعیت",
  "مرکز رصد جمعیت",
];

/*
 * موضوعات مشخصاً نامرتبط
 *
 * این فهرست عمداً گسترده‌تر شده تا خبرهای
 * عمومی با یک کلمه مشترک وارد گزارش نشوند.
 */
const BLOCKED_TITLE_TERMS = [
  "دلار",
  "ارز",
  "تخصیص ارز",
  "رسوب کالا",
  "واردکنندگان",
  "واردات",
  "صادرات",
  "فروش خودرو",
  "خرید خودرو",
  "خودرو",
  "خودروساز",
  "خودروسازی",
  "وام",
  "تسهیلات بانکی",
  "بانک",
  "بانکی",
  "سهام",
  "بورس",
  "بازار سرمایه",
  "قیمت طلا",
  "طلا",
  "قیمت سکه",
  "سکه",
  "قیمت مسکن",
  "مسکن",
  "املاک",
  "اجاره",
  "سوخت",
  "بنزین",
  "گازوئیل",
  "فوتبال",
  "ورزش",
  "کشتی",
  "والیبال",
  "بسکتبال",
  "شنا",
  "شنای",
  "شناگر",
  "شناگران",
  "مسابقات شنا",
  "مسابقات ورزشی",
  "مسابقات",
  "ورزشکار",
  "ورزشکاران",
  "المپیک",
  "مائو",
  "انقلاب فرهنگی چین",
];

/*
 * مواردی که اگر در عنوان کنار یک واژه هویتی
 * بیایند، احتمال زیادی دارد خبر مربوط به
 * موضوع دیگری باشد.
 */
const NON_REGISTRATION_CONTEXT_TERMS = [
  "شناسنامه خودرو",
  "کارت ملی خودرو",
  "هویت خودرو",
  "هویت دیجیتال بانکی",
  "احراز هویت بانکی",
  "احراز هویت مشتری",
  "احراز هویت در بانک",
  "کارت بانکی",
  "کارت اعتباری",
  "هویت برند",
  "هویت بصری",
  "هویت سازمانی",
  "هویت فرهنگی",
  "هویت هنری",
  "هویت تاریخی",
  "هویت سیاسی",
];

/*
 * نرمال‌سازی متن فارسی
 */
function normalizePersianText(value: string): string {
  return String(value || "")
    .replace(/ي/g, "ی")
    .replace(/ى/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ۀ/g, "ه")
    .replace(/ة/g, "ه")
    .replace(/‌/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeDigits(value: string): string {
  return String(value || "")
    .replace(/[۰-۹]/g, (d) =>
      String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    )
    .replace(/[٠-٩]/g, (d) =>
      String("٠١٢٣٤٥٦٧٨٩".indexOf(d))
    );
}

function normalizeDomain(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split(":")[0]
    .trim();
}

function isTrustedIranianMedia(domain: string): boolean {
  const normalized = normalizeDomain(domain);

  if (!normalized || BLOCKED_DOMAINS.has(normalized)) {
    return false;
  }

  if (TRUSTED_MEDIA[normalized]) {
    return true;
  }

  return Object.keys(TRUSTED_MEDIA).some((trusted) =>
    normalized.endsWith("." + trusted)
  );
}

function getMediaName(
  domain: string,
  source?: string
): string {
  const normalized = normalizeDomain(domain);

  if (TRUSTED_MEDIA[normalized]) {
    return TRUSTED_MEDIA[normalized];
  }

  const trusted = Object.keys(TRUSTED_MEDIA).find((item) =>
    normalized.endsWith("." + item)
  );

  return trusted
    ? TRUSTED_MEDIA[trusted]
    : source?.trim() || normalized;
}

function cleanText(value: string): string {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXml(value: string): string {
  return String(value || "")
    .replace(/<!\[CDATA\[/gi, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(Number(code))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    );
}

function extractTag(
  xml: string,
  tag: string
): string {
  const escaped = tag.replace(/:/g, "\\:");

  const regex = new RegExp(
    `<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`,
    "i"
  );

  const match = xml.match(regex);

  return match
    ? decodeXml(cleanText(match[1]))
    : "";
}

function extractLink(xml: string): string {
  const normal = extractTag(xml, "link");

  if (
    normal &&
    /^https?:\/\//i.test(normal)
  ) {
    return normal.trim();
  }

  const match = xml.match(
    /<link[^>]+href=["']([^"']+)["'][^>]*>/i
  );

  return match
    ? decodeXml(match[1].trim())
    : "";
}

/*
 * تبدیل جلالی به میلادی
 */
function jalaliToGregorian(
  jy: number,
  jm: number,
  jd: number,
  hour = 0,
  minute = 0
): Date | null {
  if (
    jy < 1200 ||
    jy > 1600 ||
    jm < 1 ||
    jm > 12 ||
    jd < 1 ||
    jd > 31
  ) {
    return null;
  }

  const div = (a: number, b: number) =>
    Math.floor(a / b);

  const mod = (a: number, b: number) =>
    a - Math.floor(a / b) * b;

  const breaks = [
    -61,
    9,
    38,
    199,
    426,
    686,
    756,
    818,
    1111,
    1181,
    1210,
    1635,
    2060,
    2097,
    2192,
    2262,
    2347,
    2380,
    2455,
    3178,
  ];

  let gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  let jump = 0;

  for (let i = 1; i < breaks.length; i++) {
    const jmBreak = breaks[i];

    jump = jmBreak - jp;

    if (jy < jmBreak) {
      break;
    }

    leapJ +=
      div(jump, 33) * 8 +
      div(mod(jump, 33) + 3, 4);

    jp = jmBreak;
  }

  const n = jy - jp;

  leapJ +=
    div(n, 33) * 8 +
    div(mod(n, 33) + 3, 4);

  if (
    mod(jump, 33) === 4 &&
    jump - n === 4
  ) {
    leapJ++;
  }

  const leapG =
    div(gy, 4) -
    div(div(gy, 100) + 1, 4) -
    150;

  const march =
    20 + leapJ - leapG;

  const dayOfYear =
    jm <= 6
      ? (jm - 1) * 31 + jd - 1
      : 186 +
        (jm - 7) * 30 +
        jd -
        1;

  const date = new Date(
    Date.UTC(
      gy,
      2,
      march,
      hour - 3,
      minute - 30,
      0
    )
  );

  date.setUTCDate(
    date.getUTCDate() + dayOfYear
  );

  return date;
}

function parseGregorianDate(
  value: string
): Date | null {
  const normalized =
    normalizeDigits(value.trim());

  if (!normalized) {
    return null;
  }

  const iso =
    normalized.match(
      /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/
    );

  if (iso) {
    const date =
      new Date(normalized);

    if (
      !Number.isNaN(
        date.getTime()
      )
    ) {
      return date;
    }
  }

  const timestamp =
    Date.parse(normalized);

  if (
    !Number.isNaN(timestamp)
  ) {
    return new Date(timestamp);
  }

  return null;
}

function parseDate(
  value?: string
): Date | null {
  if (!value) {
    return null;
  }

  const normalized =
    normalizeDigits(value.trim());

  if (!normalized) {
    return null;
  }

  const numeric =
    normalized.match(
      /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
    );

  if (numeric) {
    const year =
      Number(numeric[1]);

    const month =
      Number(numeric[2]);

    const day =
      Number(numeric[3]);

    const hour =
      Number(numeric[4] || 0);

    const minute =
      Number(numeric[5] || 0);

    if (
      year >= 1200 &&
      year <= 1600
    ) {
      const jalali =
        jalaliToGregorian(
          year,
          month,
          day,
          hour,
          minute
        );

      if (jalali) {
        return jalali;
      }
    }
  }

  const gregorian =
    parseGregorianDate(normalized);

  if (gregorian) {
    return gregorian;
  }

  const months: Record<string, number> = {
    فروردین: 1,
    اردیبهشت: 2,
    خرداد: 3,
    تیر: 4,
    مرداد: 5,
    شهریور: 6,
    مهر: 7,
    آبان: 8,
    آذر: 9,
    دی: 10,
    بهمن: 11,
    اسفند: 12,
  };

  const textMatch =
    normalized.match(
      /(\d{1,2})\s+([^\s،,-]+)\s+(\d{4})(?:\s*[-–]?\s*(\d{1,2}):(\d{2}))?/
    );

  if (textMatch) {
    const day =
      Number(textMatch[1]);

    const month =
      months[textMatch[2]];

    const year =
      Number(textMatch[3]);

    if (month) {
      return jalaliToGregorian(
        year,
        month,
        day,
        Number(textMatch[4] || 0),
        Number(textMatch[5] || 0)
      );
    }
  }

  return null;
}

/*
 * تاریخ جلالی موجود در URL تسنیم
 *
 * نمونه:
 * /fa/news/1405/07/16/...
 *
 * اگر تاریخ واقعی داخل صفحه مقاله پیدا نشود،
 * این تاریخ به عنوان fallback استفاده می‌شود.
 */
function parseTasnimDateFromUrl(
  url: string
): Date | null {
  try {
    const parsedUrl =
      new URL(url);

    const path =
      normalizeDigits(
        decodeURIComponent(
          parsedUrl.pathname
        )
      );

    const match =
      path.match(
        /\/(?:fa\/)?news\/(1[2-5]\d{2})\/(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])(?:\/|$)/i
      );

    if (!match) {
      return null;
    }

    const year =
      Number(match[1]);

    const month =
      Number(match[2]);

    const day =
      Number(match[3]);

    const date =
      jalaliToGregorian(
        year,
        month,
        day,
        0,
        0
      );

    return date;
  } catch {
    return null;
  }
}

function parseFeed(
  xml: string,
  sourceDomain: string,
  sourceName: string
): {
  items: Candidate[];
  rawItems: number;
} {
  const blocks = [
    ...(xml.match(
      /<item\b[\s\S]*?<\/item>/gi
    ) || []),
    ...(xml.match(
      /<entry\b[\s\S]*?<\/entry>/gi
    ) || []),
  ];

  const items: Candidate[] = [];

  for (const block of blocks) {
    const title =
      extractTag(block, "title");

    const url =
      extractLink(block);

    const description =
      extractTag(
        block,
        "description"
      ) ||
      extractTag(
        block,
        "summary"
      ) ||
      extractTag(
        block,
        "content"
      );

    const published =
      extractTag(
        block,
        "pubDate"
      ) ||
      extractTag(
        block,
        "published"
      ) ||
      extractTag(
        block,
        "updated"
      ) ||
      extractTag(
        block,
        "dc:date"
      );

    if (!title || !url) {
      continue;
    }

    let domain =
      normalizeDomain(
        sourceDomain
      );

    try {
      const urlDomain =
        normalizeDomain(
          new URL(url).hostname
        );

      if (
        isTrustedIranianMedia(
          urlDomain
        )
      ) {
        domain = urlDomain;
      }
    } catch {
      // دامنه منبع حفظ می‌شود
    }

    if (
      !isTrustedIranianMedia(domain)
    ) {
      continue;
    }

    items.push({
      title: cleanText(title),
      url: url.trim(),
      source: getMediaName(
        domain,
        sourceName
      ),
      domain,
      publishedAt:
        published || undefined,
      description:
        cleanText(description),
    });
  }

  return {
    items,
    rawItems: blocks.length,
  };
}

/*
 * بررسی وجود یک عبارت در متن
 */
function containsAny(
  text: string,
  terms: string[]
): boolean {
  return terms.some((term) =>
    text.includes(
      normalizePersianText(term)
    )
  );
}

/*
 * فیلتر نهایی اخبار ثبت احوال
 *
 * اینجا عمداً از مدل «هر کلمه مشترک = خبر مرتبط»
 * استفاده نمی‌کنیم.
 *
 * خبر باید یک نشانه واقعی و مشخص از حوزه ثبت احوال
 * داشته باشد.
 */
function isRelevantNews(
  title: string,
  description = ""
): boolean {
  const t =
    normalizePersianText(title);

  const d =
    normalizePersianText(
      description
    );

  /*
   * مرحله ۱:
   * خبرهای مشخصاً نامرتبط را سریع حذف کن.
   */
  if (
    containsAny(
      t,
      BLOCKED_TITLE_TERMS
    )
  ) {
    return false;
  }

  /*
   * مرحله ۲:
   * بعضی کاربردهای «هویت»، «شناسنامه» و...
   * مربوط به حوزه‌های دیگری هستند.
   */
  if (
    containsAny(
      t,
      NON_REGISTRATION_CONTEXT_TERMS
    )
  ) {
    return false;
  }

  /*
   * مرحله ۳:
   * اگر عنوان مستقیماً عبارت بسیار اختصاصی
   * ثبت احوال داشته باشد، خبر معتبر است.
   */
  const strongTitleMatch =
    containsAny(
      t,
      STRONG_TERMS
    );

  if (strongTitleMatch) {
    return true;
  }

  /*
   * مرحله ۴:
   * عبارات هویتی عمومی‌تر مثل «کارت ملی»
   * یا «شناسنامه» باید با زمینه ثبت احوال
   * همراه باشند.
   *
   * این کار جلوی بسیاری از خبرهای نامرتبط
   * را می‌گیرد.
   */
  const secondaryTitleMatch =
    containsAny(
      t,
      SECONDARY_TERMS
    );

  const explicitRegistrationContext =
    containsAny(
      t,
      REGISTRATION_CONTEXT_TERMS
    ) ||
    containsAny(
      d,
      REGISTRATION_CONTEXT_TERMS
    );

  if (
    secondaryTitleMatch &&
    explicitRegistrationContext
  ) {
    return true;
  }

  /*
   * مرحله ۵:
   * موضوعاتی مانند تولد، فوت، ازدواج،
   * طلاق و جمعیت به تنهایی کافی نیستند.
   *
   * اگر عنوان چنین موضوعی دارد،
   * توضیحات باید صراحتاً نشانه‌ای از
   * ثبت احوال یا خدمات هویتی داشته باشد.
   */
  const hasContextInTitle =
    containsAny(
      t,
      CONTEXT_TERMS
    );

  if (!hasContextInTitle) {
    return false;
  }

  const identityInDescription =
    containsAny(
      d,
      REGISTRATION_CONTEXT_TERMS
    );

  if (!identityInDescription) {
    return false;
  }

  /*
   * اگر عنوان صرفاً «تولد»، «فوت»، «جمعیت»
   * و مانند آن باشد ولی توضیحات نشانه مشخص
   * ثبت احوال داشته باشد، قابل قبول است.
   */
  return true;
}

function extractArticleLinks(
  html: string,
  sourceDomain: string
): string[] {
  const links: string[] = [];

  const regex =
    /(?:href|data-url)=["']([^"']+)["']/gi;

  let match: RegExpExecArray | null;

  while (
    (match = regex.exec(html)) !== null
  ) {
    let href =
      match[1]?.trim();

    if (!href) {
      continue;
    }

    if (href.startsWith("/")) {
      href =
        `https://${sourceDomain}${href}`;
    }

    if (
      !/^https?:\/\//i.test(href)
    ) {
      continue;
    }

    try {
      const url =
        new URL(href);

      if (
        normalizeDomain(
          url.hostname
        ) !==
        normalizeDomain(
          sourceDomain
        )
      ) {
        continue;
      }

      if (
        !url.pathname.includes(
          "/news/"
        )
      ) {
        continue;
      }

      links.push(
        url.toString()
      );
    } catch {
      continue;
    }
  }

  return [
    ...new Set(links),
  ];
}

function extractArticleTitle(
  html: string
): string {
  const patterns = [
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i,
  ];

  for (const regex of patterns) {
    const match =
      html.match(regex);

    if (match?.[1]) {
      const value =
        cleanText(
          decodeXml(
            match[1]
          )
        );

      if (value) {
        return value;
      }
    }
  }

  return "";
}

function extractArticleDescription(
  html: string
): string {
  const patterns = [
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
  ];

  for (const regex of patterns) {
    const match =
      html.match(regex);

    if (match?.[1]) {
      return cleanText(
        decodeXml(
          match[1]
        )
      );
    }
  }

  return "";
}

function extractArticlePublishedDate(
  html: string
): Date | null {
  const patterns = [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']pubdate["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']date["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+itemprop=["']datePublished["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:published_time["'][^>]+content=["']([^"']+)["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /"dateCreated"\s*:\s*"([^"]+)"/i,
    /"published_time"\s*:\s*"([^"]+)"/i,
  ];

  for (const regex of patterns) {
    const match =
      html.match(regex);

    if (match?.[1]) {
      const value =
        decodeXml(
          match[1]
        ).trim();

      const parsed =
        parseDate(value);

      if (parsed) {
        return parsed;
      }

      const direct =
        new Date(value);

      if (
        !Number.isNaN(
          direct.getTime()
        )
      ) {
        return direct;
      }
    }
  }

  const persianDatePatterns = [
    /(\d{1,2})\s+(فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند)\s+(\d{4})\s*[-–]\s*(\d{1,2}):(\d{2})/i,

    /(\d{1,2})\s+(فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند)\s+(\d{4})\s+(\d{1,2}):(\d{2})/i,
  ];

  for (const regex of persianDatePatterns) {
    const match =
      normalizeDigits(
        cleanText(html)
      ).match(regex);

    if (!match) {
      continue;
    }

    const months: Record<string, number> = {
      فروردین: 1,
      اردیبهشت: 2,
      خرداد: 3,
      تیر: 4,
      مرداد: 5,
      شهریور: 6,
      مهر: 7,
      آبان: 8,
      آذر: 9,
      دی: 10,
      بهمن: 11,
      اسفند: 12,
    };

    const day =
      Number(match[1]);

    const month =
      months[match[2]];

    const year =
      Number(match[3]);

    const hour =
      Number(match[4] || 0);

    const minute =
      Number(match[5] || 0);

    if (
      month &&
      year >= 1200 &&
      year <= 1600
    ) {
      const parsed =
        jalaliToGregorian(
          year,
          month,
          day,
          hour,
          minute
        );

      if (parsed) {
        return parsed;
      }
    }
  }

  return null;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs
    );

  try {
    return await fetch(
      input,
      {
        ...init,
        signal:
          controller.signal,
      }
    );
  } finally {
    clearTimeout(timer);
  }
}

/*
 * بازه دقیق:
 * ۲۲:۳۰ تهران تا ۲۲:۳۰ روز بعد
 */
function getReportWindow() {
  const now =
    new Date();

  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Asia/Tehran",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }
    ).formatToParts(now);

  const get =
    (type: string) =>
      Number(
        parts.find(
          (x) =>
            x.type === type
        )?.value || 0
      );

  const year =
    get("year");

  const month =
    get("month");

  const day =
    get("day");

  const hour =
    get("hour");

  const minute =
    get("minute");

  let end =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        19,
        0,
        0
      )
    );

  if (
    hour < 22 ||
    (
      hour === 22 &&
      minute < 30
    )
  ) {
    end =
      new Date(
        end.getTime() -
          24 *
            60 *
            60 *
            1000
      );
  }

  const start =
    new Date(
      end.getTime() -
        24 *
          60 *
          60 *
          1000
    );

  const format =
    (date: Date) =>
      new Intl.DateTimeFormat(
        "fa-IR-u-ca-persian",
        {
          timeZone:
            "Asia/Tehran",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }
      ).format(date);

  return {
    start,
    end,
    startTehran:
      format(start),
    endTehran:
      format(end),
  };
}

function isInsideWindow(
  date: Date | null,
  start: Date,
  end: Date
): boolean {
  if (!date) {
    return false;
  }

  const time =
    date.getTime();

  return (
    time >= start.getTime() &&
    time < end.getTime()
  );
}

function normalizeTitle(
  title: string
): string {
  return normalizePersianText(
    title
  )
    .replace(
      /[\u064B-\u065F\u0670]/g,
      ""
    )
    .replace(
      /[^\p{L}\p{N}\s]/gu,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function dedupeNews(
  items: NewsItem[]
): NewsItem[] {
  const seen =
    new Set<string>();

  const result:
    NewsItem[] = [];

  for (const item of items) {
    const key =
      normalizeTitle(
        item.title
      );

    if (
      !key ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

async function fetchSource(
  source: SourceConfig,
  start: Date,
  end: Date
): Promise<{
  candidates: Candidate[];
  diagnostics: SourceResult;
}> {
  const diagnostics:
    SourceResult = {
      source:
        source.source,
      domain:
        source.domain,
      url:
        source.url,
      httpStatus:
        null,
      rawItems:
        0,
      parsedItems:
        0,
      relevantItems:
        0,
      windowItems:
        0,
      noDateItems:
        0,
      error:
        null,
    };

  try {
    const response =
      await fetchWithTimeout(
        source.url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; SedayeSmart/6.0)",
            Accept:
              "application/rss+xml, application/xml, text/xml, */*",
          },
          cache:
            "no-store",
        }
      );

    diagnostics.httpStatus =
      response.status;

    if (
      !response.ok
    ) {
      diagnostics.error =
        `HTTP ${response.status}`;

      return {
        candidates: [],
        diagnostics,
      };
    }

    const xml =
      await response.text();

    const parsed =
      parseFeed(
        xml,
        source.domain,
        source.source
      );

    diagnostics.rawItems =
      parsed.rawItems;

    diagnostics.parsedItems =
      parsed.items.length;

    const relevant =
      parsed.items.filter(
        (item) =>
          isRelevantNews(
            item.title,
            item.description
          )
      );

    diagnostics.relevantItems =
      relevant.length;

    diagnostics.noDateItems =
      relevant.filter(
        (item) =>
          !parseDate(
            item.publishedAt
          )
      ).length;

    const windowItems =
      relevant.filter(
        (item) =>
          isInsideWindow(
            parseDate(
              item.publishedAt
            ),
            start,
            end
          )
      );

    diagnostics.windowItems =
      windowItems.length;

    return {
      candidates:
        relevant,
      diagnostics,
    };
  } catch (error) {
    diagnostics.error =
      error instanceof Error
        ? error.name ===
          "AbortError"
          ? "timeout"
          : error.message
        : String(error);

    return {
      candidates: [],
      diagnostics,
    };
  }
}

async function fetchSpecialSource(
  source: SourceConfig,
  start: Date,
  end: Date
): Promise<{
  candidates: Candidate[];
  diagnostics: SourceResult;
}> {
  const diagnostics:
    SourceResult = {
      source:
        source.source,
      domain:
        source.domain,
      url:
        source.url,
      httpStatus:
        null,
      rawItems:
        0,
      parsedItems:
        0,
      relevantItems:
        0,
      windowItems:
        0,
      noDateItems:
        0,
      error:
        null,
    };

  try {
    const response =
      await fetchWithTimeout(
        source.url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; SedayeSmart/6.0)",
            Accept:
              "text/html,application/xhtml+xml,*/*",
          },
          cache:
            "no-store",
        }
      );

    diagnostics.httpStatus =
      response.status;

    if (
      !response.ok
    ) {
      diagnostics.error =
        `HTTP ${response.status}`;

      return {
        candidates: [],
        diagnostics,
      };
    }

    const html =
      await response.text();

    const links =
      extractArticleLinks(
        html,
        source.domain
      ).slice(
        0,
        30
      );

    diagnostics.rawItems =
      links.length;

    const results =
      await Promise.all(
        links.map(
          async (url) => {
            try {
              const articleResponse =
                await fetchWithTimeout(
                  url,
                  {
                    headers: {
                      "User-Agent":
                        "Mozilla/5.0 (compatible; SedayeSmart/6.0)",
                    },
                    cache:
                      "no-store",
                  }
                );

              if (
                !articleResponse.ok
              ) {
                return null;
              }

              const article =
                await articleResponse.text();

              const title =
                extractArticleTitle(
                  article
                );

              const description =
                extractArticleDescription(
                  article
                );

              const realDate =
                extractArticlePublishedDate(
                  article
                );

              const date =
                realDate ||
                parseTasnimDateFromUrl(
                  url
                );

              if (
                !title ||
                !date
              ) {
                return null;
              }

              return {
                title,
                url,
                source:
                  source.source,
                domain:
                  source.domain,
                publishedAt:
                  date.toISOString(),
                description,
              } satisfies Candidate;
            } catch {
              return null;
            }
          }
        )
      );

    const candidates =
      results.filter(
        (item) =>
          item !== null
      );

    diagnostics.parsedItems =
      candidates.length;

    const relevant =
      candidates.filter(
        (item) =>
          isRelevantNews(
            item.title,
            item.description
          )
      );

    diagnostics.relevantItems =
      relevant.length;

    diagnostics.noDateItems =
      relevant.filter(
        (item) =>
          !parseDate(
            item.publishedAt
          )
      ).length;

    diagnostics.windowItems =
      relevant.filter(
        (item) =>
          isInsideWindow(
            parseDate(
              item.publishedAt
            ),
            start,
            end
          )
      ).length;

    return {
      candidates:
        relevant,
      diagnostics,
    };
  } catch (error) {
    diagnostics.error =
      error instanceof Error
        ? error.name ===
          "AbortError"
          ? "timeout"
          : error.message
        : String(error);

    return {
      candidates: [],
      diagnostics,
    };
  }
}

async function getNews(
  start: Date,
  end: Date
) {
  const rss =
    await Promise.all(
      RSS_SOURCES.map(
        (source) =>
          fetchSource(
            source,
            start,
            end
          )
      )
    );

  const special =
    await Promise.all(
      SPECIAL_SOURCES.map(
        (source) =>
          fetchSpecialSource(
            source,
            start,
            end
          )
      )
    );

  const allCandidates:
    Candidate[] = [];

  const diagnostics:
    SourceResult[] = [];

  for (
    const result of [
      ...rss,
      ...special,
    ]
  ) {
    allCandidates.push(
      ...result.candidates
    );

    diagnostics.push(
      result.diagnostics
    );
  }

  const selected =
    allCandidates.filter(
      (item) =>
        isInsideWindow(
          parseDate(
            item.publishedAt
          ),
          start,
          end
        )
    );

  selected.sort(
    (a, b) => {
      const da =
        parseDate(
          a.publishedAt
        )?.getTime() || 0;

      const db =
        parseDate(
          b.publishedAt
        )?.getTime() || 0;

      return db - da;
    }
  );

  const mapped =
    selected
      .map((item) => {
        const date =
          parseDate(
            item.publishedAt
          );

        if (!date) {
          return null;
        }

        return {
          title:
            cleanText(
              item.title
            ),
          url:
            item.url,
          source:
            getMediaName(
              item.domain,
              item.source
            ),
          domain:
            normalizeDomain(
              item.domain
            ),
          publishedAt:
            date.toISOString(),
        };
      })
      .filter(
        (
          item
        ): item is NewsItem =>
          item !== null
      );

  return {
    news:
      dedupeNews(
        mapped
      ).slice(
        0,
        MAX_NEWS
      ),
    diagnostics,
  };
}

/*
 * وضعیت ارسال اخبار از Supabase
 */
async function getScheduleState(
  env: CloudflareEnv
): Promise<boolean> {
  const supabaseUrl =
    env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceKey =
    env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    !serviceKey
  ) {
    console.error(
      "[news] Supabase configuration missing"
    );

    return true;
  }

  try {
    const url =
      `${supabaseUrl}/rest/v1/settings` +
      "?key=eq.schedule_news" +
      "&select=value" +
      "&limit=1";

    const response =
      await fetchWithTimeout(
        url,
        {
          method: "GET",
          headers: {
            apikey:
              serviceKey,
            Authorization:
              `Bearer ${serviceKey}`,
            Accept:
              "application/json",
          },
          cache:
            "no-store",
        }
      );

    if (
      !response.ok
    ) {
      console.error(
        "[news] Supabase settings GET failed:",
        response.status
      );

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

    const value =
      rows[0]?.value;

    if (
      value === false ||
      value === "false" ||
      value === 0 ||
      value === "0"
    ) {
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "[news] schedule state error:",
      error
    );

    return true;
  }
}

async function sendBaleMessage(
  env: CloudflareEnv,
  text: string
) {
  const token =
    env.BALE_SMART_TOKEN;

  const chatId =
    env.BALE_GROUP_ID;

  if (
    !token ||
    !chatId
  ) {
    throw new Error(
      "BALE_SMART_TOKEN or BALE_GROUP_ID is missing"
    );
  }

  const response =
    await fetch(
      `https://tapi.bale.ai/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body:
          JSON.stringify({
            chat_id:
              chatId,
            text,
            disable_web_page_preview:
              false,
          }),
      }
    );

  const data =
    await response.json();

  if (
    !response.ok ||
    data?.ok === false
  ) {
    throw new Error(
      `Bale sendMessage failed: ${JSON.stringify(
        data
      )}`
    );
  }

  return data;
}

/*
 * پیام نهایی
 *
 * دقت شود که هیچ footer اضافه‌ای مثل:
 * «اخبار مرتبط با ثبت احوال از رسانه‌های معتبر داخلی»
 * یا
 * «مدیر هوشمند گروه»
 * در اینجا وجود ندارد.
 */
function formatNewsMessage(
  news: NewsItem[],
  sentAt: Date
): string {
  const time =
    new Intl.DateTimeFormat(
      "fa-IR",
      {
        timeZone:
          "Asia/Tehran",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }
    ).format(sentAt);

  const lines:
    string[] = [];

  lines.push(
    "ثبت احوال در رسانه ها"
  );

  lines.push(
    `🕐 زمان ارسال: ${time}`
  );

  lines.push(
    `📰 تعداد اخبار: ${news.length}`
  );

  lines.push(
    "━━━━━━━━━━━━━━"
  );

  lines.push("");

  news.forEach(
    (item, index) => {
      lines.push(
        `${index + 1}️⃣ ${item.title}`
      );

      lines.push(
        `📰 ${item.source}`
      );

      lines.push(
        `🔗 ${item.url}`
      );

      lines.push("");
    }
  );

  lines.push(
    "━━━━━━━━━━━━━━"
  );

  return lines.join(
    "\n"
  );
}

export async function GET(
  _request: Request
) {
  const startedAt =
    Date.now();

  try {
    const { env } =
      await getCloudflareContext(
        {
          async: true,
        }
      );

    /*
     * ابتدا وضعیت فعال/غیرفعال بودن اخبار
     * بررسی می‌شود.
     */
    const scheduleEnabled =
      await getScheduleState(
        env
      );

    if (
      !scheduleEnabled
    ) {
      return NextResponse.json(
        {
          ok: true,
          cancelled: true,
          sent: false,
          reason:
            "schedule_news_disabled",
          message:
            "ارسال اخبار ثبت احوال لغو شده است.",
          runtime_ms:
            Date.now() -
            startedAt,
        },
        {
          headers: {
            "Cache-Control":
              "no-store, no-cache, must-revalidate",
          },
        }
      );
    }

    /*
     * محاسبه بازه دقیق
     */
    const {
      start,
      end,
      startTehran,
      endTehran,
    } =
      getReportWindow();

    /*
     * دریافت اخبار
     */
    const result =
      await getNews(
        start,
        end
      );

    const news =
      result.news;

    const mediaSet =
      new Set(
        news.map(
          (item) =>
            item.domain
        )
      );

    /*
     * اگر خبر واقعی و معتبر وجود نداشت،
     * هیچ پیام بله‌ای ارسال نمی‌شود.
     */
    if (
      news.length === 0 ||
      mediaSet.size <
        MIN_MEDIA
    ) {
      return NextResponse.json(
        {
          ok: true,
          cancelled: false,
          sent: false,
          reason:
            "no_relevant_iranian_media",

          news: {
            totalFetched:
              result.diagnostics.reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  item.rawItems,
                0
              ),

            parsedItems:
              result.diagnostics.reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  item.parsedItems,
                0
              ),

            relevantBeforeWindow:
              result.diagnostics.reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  item.relevantItems,
                0
              ),

            selected: 0,

            mediaCount:
              mediaSet.size,

            minimumMedia:
              MIN_MEDIA,

            maximumNews:
              MAX_NEWS,

            noDate:
              result.diagnostics.reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  item.noDateItems,
                0
              ),

            windowItems:
              result.diagnostics.reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  item.windowItems,
                0
              ),
          },

          sources:
            result.diagnostics,

          report_window: {
            start:
              start.toISOString(),

            end:
              end.toISOString(),

            start_tehran:
              startTehran,

            end_tehran:
              endTehran,
          },

          runtime_ms:
            Date.now() -
            startedAt,
        },
        {
          headers: {
            "Cache-Control":
              "no-store, no-cache, must-revalidate",
          },
        }
      );
    }

    /*
     * ساخت پیام
     */
    const message =
      formatNewsMessage(
        news,
        new Date()
      );

    /*
     * ارسال به گروه بله
     */
    const bale =
      await sendBaleMessage(
        env,
        message
      );

    const sentAt =
      new Date();

    const sentAtTehran =
      new Intl.DateTimeFormat(
        "fa-IR",
        {
          timeZone:
            "Asia/Tehran",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }
      ).format(sentAt);

    return NextResponse.json(
      {
        ok: true,
        cancelled: false,
        sent: true,

        sent_at:
          sentAt.toISOString(),

        sent_at_tehran:
          sentAtTehran,

        bale_status: 200,

        bale,

        news: {
          totalFetched:
            result.diagnostics.reduce(
              (
                total,
                item
              ) =>
                total +
                item.rawItems,
              0
            ),

          parsedItems:
            result.diagnostics.reduce(
              (
                total,
                item
              ) =>
                total +
                item.parsedItems,
              0
            ),

          relevantBeforeWindow:
            result.diagnostics.reduce(
              (
                total,
                item
              ) =>
                total +
                item.relevantItems,
              0
            ),

          selected:
            news.length,

          mediaCount:
            mediaSet.size,

          minimumMedia:
            MIN_MEDIA,

          maximumNews:
            MAX_NEWS,

          windowItems:
            result.diagnostics.reduce(
              (
                total,
                item
              ) =>
                total +
                item.windowItems,
              0
            ),
        },

        sources:
          result.diagnostics,

        report_window: {
          start:
            start.toISOString(),

          end:
            end.toISOString(),

          start_tehran:
            startTehran,

          end_tehran:
            endTehran,
        },

        runtime_ms:
          Date.now() -
          startedAt,
      },
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error(
      "[news] daily summary error:",
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
        runtime_ms:
          Date.now() -
          startedAt,
      },
      {
        status: 500,
      }
    );
  }
  }

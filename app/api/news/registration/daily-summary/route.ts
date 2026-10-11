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

type Candidate = NewsItem & {
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

  sampleItems?: Array<{
    title: string;
    url: string;
    publishedAt: string;
    parsedDate: string | null;
    inWindow: boolean;
  }>;

  error: string | null;
};

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
 "iribnews.ir": "خبرگزاری صدا و سیما",
  "entekhab.ir": "انتخاب",
  "fararu.com": "فرارو",
};

const RSS_SOURCES: SourceConfig[] = [
  { url: "https://www.irna.ir/rss", domain: "irna.ir", source: "ایرنا" },
  { url: "https://www.isna.ir/rss", domain: "isna.ir", source: "ایسنا" },
  { url: "https://www.mehrnews.com/rss", domain: "mehrnews.com", source: "مهر" },
  { url: "https://www.farsnews.ir/rss", domain: "farsnews.ir", source: "فارس" },
  { url: "https://www.ilna.ir/rss", domain: "ilna.ir", source: "ایلنا" },
  { url: "https://www.yjc.ir/fa/rss/allnews", domain: "yjc.ir", source: "باشگاه خبرنگاران جوان" },
  { url: "https://www.khabaronline.ir/rss", domain: "khabaronline.ir", source: "خبرآنلاین" },
  { url: "https://www.tabnak.ir/fa/rss/allnews", domain: "tabnak.ir", source: "تابناک" },
  { url: "https://www.asriran.com/fa/rss/allnews", domain: "asriran.com", source: "عصر ایران" },
  { url: "https://www.hamshahrionline.ir/rss", domain: "hamshahrionline.ir", source: "همشهری آنلاین" },
  { url: "https://jamejamonline.ir/fa/rss", domain: "jamejamonline.ir", source: "جام جم آنلاین" },
  { url: "https://www.mizanonline.ir/fa/rss", domain: "mizanonline.ir", source: "میزان" },
  { url: "https://snn.ir/fa/rss", domain: "snn.ir", source: "خبرگزاری دانشجو" },
  { url: "https://ana.ir/fa/rss", domain: "ana.ir", source: "خبرگزاری آنا" },
 {
  url: "https://www.iribnews.ir/fa/rss/allnews",
  domain: "iribnews.ir",
  source: "خبرگزاری صدا و سیما",
},
  { url: "https://www.shana.ir/rss", domain: "shana.ir", source: "شانا" },
  { url: "https://iqna.ir/fa/rss", domain: "iqna.ir", source: "ایکنا" },
  { url: "https://www.tasnimnews.ir/fa/rss", domain: "tasnimnews.ir", source: "تسنیم" },
  {
    url: "https://www.tasnimnews.com/fa/rss/feed/0/8/0/%D9%85%D9%87%D9%85%D8%AA%D8%B1%DB%8C%D9%86-%D8%AE%D8%A8%D8%B1%D9%87%D8%A7%DB%8C-%D8%AA%D8%B3%D9%86%DB%8C%D9%85",
    domain: "tasnimnews.com",
    source: "تسنیم",
  },
  { url: "https://www.entekhab.ir/fa/rss", domain: "entekhab.ir", source: "انتخاب" },
  { url: "https://www.fararu.com/rss", domain: "fararu.com", source: "فرارو" },
];

const SPECIAL_SOURCES: SourceConfig[] = [
  {
    url: "https://tasnimnews.ir/fa/keyword/4067/%D8%B3%D8%A7%D8%B2%D9%85%D8%A7%D9%86-%D8%AB%D8%A8%D8%AA-%D8%A7%D8%AD%D9%88%D8%A7%D9%84-%DA%A9%D8%B4%D9%88%D8%B1",
    domain: "tasnimnews.ir",
    source: "تسنیم",
  },
  {
    url: "https://www.tasnimnews.ir/fa/service/2/%D8%A7%D8%AC%D8%AA%D9%85%D8%A7%D8%B9%DB%8C",
    domain: "tasnimnews.ir",
    source: "تسنیم",
  },
];

const BLOCKED_DOMAINS = new Set([
  "bbc.com", "bbc.co.uk", "bbc.in", "voanews.com", "rferl.org",
  "radiofarda.com", "iranintl.com", "iranintl.net", "dw.com", "dw.de",
  "reuters.com", "apnews.com", "afp.com", "aljazeera.com",
  "aljazeera.net", "france24.com", "nytimes.com",
  "washingtonpost.com", "theguardian.com", "cnn.com", "foxnews.com",
  "skynews.com", "npr.org",
]);

const STRONG_TERMS = [
  "ثبت احوال",
  "سازمان ثبت احوال",
  "سازمان ثبت احوال کشور",
  "ثبت احوال کشور",
  "خدمات ثبت احوال",
  "داده های ثبت احوال",
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

const SECONDARY_TERMS = [
  "کارت ملی",
  "شناسنامه",
  "مدارک هویتی",
  "مدرک هویتی",
  "خدمات هویتی",
  "اطلاعات هویتی",
  "هویت ایرانی",
  "داده های هویتی",
  "تغییر نام",
  "رصد جمعیت",
];

const CONTEXT_TERMS = [
  "ولادت", "وفات", "ازدواج", "طلاق", "جمعیت", "هویتی", "تولد", "فوت",
];

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
  "رصد جمعیت",
  "مرکز رصد جمعیت",
];

const BLOCKED_TITLE_TERMS = [
  "دلار", "ارز", "تخصیص ارز", "رسوب کالا", "واردکنندگان",
  "واردات", "صادرات", "فروش خودرو", "خرید خودرو", "خودرو",
  "خودروساز", "خودروسازی", "وام", "تسهیلات بانکی", "بانک",
  "بانکی", "سهام", "بورس", "بازار سرمایه", "قیمت طلا", "طلا",
  "قیمت سکه", "سکه", "قیمت مسکن", "مسکن", "املاک", "اجاره",
  "سوخت", "بنزین", "گازوئیل", "فوتبال", "ورزش", "کشتی",
  "والیبال", "بسکتبال", "شناگر", "شناگران", "مسابقات شنا",
  "مسابقات ورزشی", "ورزشکار", "ورزشکاران", "المپیک",
  "مائو", "انقلاب فرهنگی چین",
];

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

function normalizePersianText(value: string): string {
  return String(value || "")
    .replace(/ي/g, "ی")
    .replace(/ى/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ۀة]/g, "ه")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/‌/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeDigits(value: string): string {
  return String(value || "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
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
    normalized.endsWith(`.${trusted}`)
  );
}

function getMediaName(domain: string, source?: string): string {
  const normalized = normalizeDomain(domain);

  if (TRUSTED_MEDIA[normalized]) {
    return TRUSTED_MEDIA[normalized];
  }

  const trusted = Object.keys(TRUSTED_MEDIA).find((item) =>
    normalized.endsWith(`.${item}`)
  );

  return trusted ? TRUSTED_MEDIA[trusted] : source?.trim() || normalized;
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
      String.fromCodePoint(Number(code))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(parseInt(code, 16))
    );
}

function extractTag(xml: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const regex = new RegExp(
    `<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}\\s*>`,
    "i"
  );

  const match = xml.match(regex);
  return match ? decodeXml(cleanText(match[1])) : "";
}

function extractLink(xml: string): string {
  const linkTag = xml.match(/<link\b([^>]*)>([\s\S]*?)<\/link\s*>/i);

  if (linkTag) {
    const body = decodeXml(cleanText(linkTag[2]));
    if (/^https?:\/\//i.test(body)) return body.trim();

    const href = linkTag[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (href) return decodeXml(href.trim());
  }

  const selfClosing = xml.match(
    /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\/?>/i
  );

  return selfClosing ? decodeXml(selfClosing[1].trim()) : "";
}

function containsAny(text: string, terms: string[]): boolean {
  return terms.some((term) =>
    text.includes(normalizePersianText(term))
  );
}

function isRelevantNews(title: string, description = ""): boolean {
  const t = normalizePersianText(title);
  const d = normalizePersianText(description);

  if (!t) return false;

  // ابتدا کاربردهای صریحاً نامرتبط رد می‌شوند.
  if (containsAny(t, NON_REGISTRATION_CONTEXT_TERMS)) {
    return false;
  }

  // عبارت دقیق ثبت احوال بر فهرست عمومی واژه‌های مسدود اولویت دارد.
  if (
  containsAny(t, STRONG_TERMS) ||
  containsAny(d, STRONG_TERMS)
) {
  return true;
  }

  if (containsAny(t, BLOCKED_TITLE_TERMS)) {
    return false;
  }

  const secondaryTitleMatch = containsAny(t, SECONDARY_TERMS);
  const explicitContext =
    containsAny(t, REGISTRATION_CONTEXT_TERMS) ||
    containsAny(d, REGISTRATION_CONTEXT_TERMS);

  if (secondaryTitleMatch && explicitContext) {
    return true;
  }

  // تولد، فوت، ازدواج، طلاق و جمعیت به تنهایی کافی نیستند.
  return (
    containsAny(t, CONTEXT_TERMS) &&
    containsAny(d, REGISTRATION_CONTEXT_TERMS)
  );
}

/*
 * تبدیل تاریخ جلالی به میلادی.
 * ساعت ورودی، ساعت تهران در نظر گرفته می‌شود.
 */
function jalaliToGregorian(
  jy: number,
  jm: number,
  jd: number,
  hour = 0,
  minute = 0
): Date | null {
  if (jy < 1200 || jy > 1600 || jm < 1 || jm > 12 || jd < 1 || jd > 31) {
    return null;
  }

  const div = (a: number, b: number) => Math.floor(a / b);
  const mod = (a: number, b: number) => a - Math.floor(a / b) * b;

  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181,
    1210, 1635, 2060, 2097, 2192, 2262, 2347, 2380,
    2455, 3178,
  ];

  let gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  let jump = 0;

  for (let i = 1; i < breaks.length; i++) {
    const jmBreak = breaks[i];
    jump = jmBreak - jp;

    if (jy < jmBreak) break;

    leapJ += div(jump, 33) * 8 + div(mod(jump, 33) + 3, 4);
    jp = jmBreak;
  }

  const n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);

  if (mod(jump, 33) === 4 && jump - n === 4) leapJ++;

  const leapG = div(gy, 4) - div(div(gy, 100) + 1, 4) - 150;
  const march = 20 + leapJ - leapG;

  const dayOfYear =
    jm <= 6
      ? (jm - 1) * 31 + jd - 1
      : 186 + (jm - 7) * 30 + jd - 1;

  const date = new Date(
    Date.UTC(gy, 2, march, hour - 3, minute - 30, 0)
  );

  date.setUTCDate(date.getUTCDate() + dayOfYear);

  // جلوگیری از پذیرش روزهای نامعتبر مثل ۳۱ اسفند در سال غیرکبیسه
  const check = new Date(date.getTime());
  check.setUTCDate(check.getUTCDate() - dayOfYear);

  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function parseGregorianDate(value: string): Date | null {
  const normalized = normalizeDigits(value.trim());
  if (!normalized) return null;

  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDate(value?: string): Date | null {
  if (!value) return null;

  const normalized = normalizeDigits(value.trim());
  if (!normalized) return null;

  const numeric = normalized.match(
    /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (numeric) {
    const year = Number(numeric[1]);
    const month = Number(numeric[2]);
    const day = Number(numeric[3]);
    const hour = Number(numeric[4] || 0);
    const minute = Number(numeric[5] || 0);
    const second = Number(numeric[6] || 0);

    if (year >= 1200 && year <= 1600) {
      if (month > 12 || day > 31 || hour > 23 || minute > 59 || second > 59) {
        return null;
      }

      const jalali = jalaliToGregorian(year, month, day, hour, minute);
      if (!jalali) return null;

      jalali.setUTCSeconds(second);
      return jalali;
    }

    if (
      year >= 1900 &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31 &&
      hour <= 23 &&
      minute <= 59 &&
      second <= 59
    ) {
      const date = new Date(
        Date.UTC(year, month - 1, day, hour, minute, second)
      );

      // تاریخ‌های عددی بدون منطقه زمانی، به‌عنوان زمان UTC تفسیر می‌شوند.
      if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
      ) {
        return null;
      }

      return date;
    }

    return null;
  }

  const gregorian = parseGregorianDate(normalized);
  if (gregorian) return gregorian;

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

  const textMatch = normalized.match(
    /(\d{1,2})\s+(فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند)\s+(\d{4})(?:\s*[-–]?\s*(\d{1,2}):(\d{2}))?/i
  );

  if (textMatch) {
    const day = Number(textMatch[1]);
    const month = months[textMatch[2]];
    const year = Number(textMatch[3]);
    const hour = Number(textMatch[4] || 0);
    const minute = Number(textMatch[5] || 0);

    if (!month || year < 1200 || year > 1600) return null;

    return jalaliToGregorian(year, month, day, hour, minute);
  }

  return null;
}

/*
 * فقط تاریخ انتشار قابل قبول است.
 * updated، dateModified و تاریخ URL عمداً fallback نیستند.
 */
function extractArticlePublishedDate(html: string): Date | null {
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];

  const allowedFields = new Set([
    "article:published_time",
    "og:published_time",
    "pubdate",
    "date",
    "datepublished",
    "parsely-pub-date",
    "publishdate",
  ]);

  for (const tag of metaTags) {
    const key =
      tag.match(/\bproperty\s*=\s*["']([^"']+)["']/i)?.[1] ||
      tag.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1] ||
      tag.match(/\bitemprop\s*=\s*["']([^"']+)["']/i)?.[1] ||
      "";

    if (!allowedFields.has(key.toLowerCase())) continue;

    const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!content) continue;

    const parsed = parseDate(decodeXml(content).trim());
    if (parsed) return parsed;
  }

  // فقط datePublished پذیرفته می‌شود؛ dateCreated و dateModified خیر.
  const structured = html.match(
    /["']datePublished["']\s*:\s*["']([^"']+)["']/i
  );

  if (structured?.[1]) {
    const parsed = parseDate(decodeXml(structured[1]).trim());
    if (parsed) return parsed;
  }

  const timeTags = html.match(/<time\b[^>]*>/gi) || [];

  for (const tag of timeTags) {
    const datetime = tag.match(/\bdatetime\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!datetime) continue;

    const parsed = parseDate(decodeXml(datetime).trim());
    if (parsed) return parsed;
  }

  const plainText = normalizeDigits(cleanText(html));

  const persianDate = plainText.match(
    /(\d{1,2})\s+(فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند)\s+(\d{4})\s*[-–،,]?\s*(\d{1,2}):(\d{2})/i
  );

  if (persianDate) {
    return parseDate(
      `${persianDate[1]} ${persianDate[2]} ${persianDate[3]} ${persianDate[4]}:${persianDate[5]}`
    );
  }

  // تاریخ متنی بدون ساعت به‌تنهایی برای پنجره دقیق ۲۴ساعته کافی نیست.
  return null;
}

function extractArticleTitle(html: string): string {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);

  if (h1?.[1]) {
    const title = cleanText(decodeXml(h1[1]));
    if (title) return title;
  }

  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];

  for (const tag of metaTags) {
    const key =
      tag.match(/\bproperty\s*=\s*["']([^"']+)["']/i)?.[1] ||
      tag.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1] ||
      "";

    if (!["og:title", "twitter:title"].includes(key.toLowerCase())) {
      continue;
    }

    const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];

    if (content) {
      const title = cleanText(decodeXml(content));
      if (title) return title;
    }
  }

  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);

  return titleTag?.[1] ? cleanText(decodeXml(titleTag[1])) : "";
}

function extractArticleDescription(html: string): string {
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];

  for (const tag of metaTags) {
    const key =
      tag.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1] ||
      tag.match(/\bproperty\s*=\s*["']([^"']+)["']/i)?.[1] ||
      "";

    if (
      !["description", "og:description", "twitter:description"].includes(
        key.toLowerCase()
      )
    ) {
      continue;
    }

    const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];

    if (content) {
      const description = cleanText(decodeXml(content));
      if (description) return description;
    }
  }

  const paragraph = html.match(
    /<p\b[^>]*class=["'][^"']*(?:lead|summary|subtitle|description|intro)[^"']*["'][^>]*>([\s\S]*?)<\/p>/i
  );

  return paragraph?.[1]
    ? cleanText(decodeXml(paragraph[1]))
    : "";
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/*
 * پنجره ثابت روزانه:
 * ساعت ۲۲:۳۰ تهران روز قبل تا ساعت ۲۲:۳۰ تهران روز جاری.
 * این تابع برای زمان اجرای قبل از ۲۲:۳۰، آخرین پنجره کامل‌شده را برمی‌گرداند.
 */
function getReportWindow() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value || 0);

  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");

  // ساعت ۱۹:۰۰ UTC برابر ۲۲:۳۰ تهران است.
  let end = new Date(Date.UTC(year, month - 1, day, 19, 0, 0));

  if (hour < 22 || (hour === 22 && minute < 30)) {
    end = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  }

  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  const format = (date: Date) =>
    new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      timeZone: "Asia/Tehran",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);

  return {
    start,
    end,
    startTehran: format(start),
    endTehran: format(end),
  };
}

function isInsideWindow(
  date: Date | null,
  start: Date,
  end: Date
): boolean {
  if (!date || Number.isNaN(date.getTime())) return false;

  const time = date.getTime();

  return time >= start.getTime() && time < end.getTime();
}

function normalizeTitle(title: string): string {
  return normalizePersianText(title)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeNews(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const result: NewsItem[] = [];

  for (const item of items) {
    const key = normalizeTitle(item.title);

    if (!key || seen.has(key)) continue;

    seen.add(key);
    result.push(item);
  }

  return result;
}

function parseFeed(
  xml: string,
  sourceDomain: string,
  sourceName: string
): { items: Candidate[]; rawItems: number } {
  const blocks = [
    ...(xml.match(/<item\b[\s\S]*?<\/item>/gi) || []),
    ...(xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || []),
  ];

  const items: Candidate[] = [];

  for (const block of blocks) {
    const title = extractTag(block, "title");
    const url = extractLink(block);

    const description =
      extractTag(block, "description") ||
      extractTag(block, "summary") ||
      extractTag(block, "content");

    // updated عمداً استفاده نمی‌شود؛ تاریخ ویرایش جای تاریخ انتشار نیست.
    const published =
      extractTag(block, "pubDate") ||
      extractTag(block, "published") ||
      extractTag(block, "dc:date");

    if (!title || !url) continue;

    let domain = normalizeDomain(sourceDomain);

    try {
      const urlDomain = normalizeDomain(new URL(url).hostname);
      if (isTrustedIranianMedia(urlDomain)) domain = urlDomain;
    } catch {
      continue;
    }

    if (!isTrustedIranianMedia(domain)) continue;

    items.push({
      title: cleanText(title),
      url: url.trim(),
      source: getMediaName(domain, sourceName),
      domain,
      publishedAt: published || "",
      description: cleanText(description),
    });
  }

  return { items, rawItems: blocks.length };
}

function newDiagnostics(source: SourceConfig): SourceResult {
  return {
    source: source.source,
    domain: source.domain,
    url: source.url,
    httpStatus: null,
    rawItems: 0,
    parsedItems: 0,
    relevantItems: 0,
    windowItems: 0,
    noDateItems: 0,
    error: null,
  };
}

async function fetchSource(
  source: SourceConfig,
  start: Date,
  end: Date
): Promise<{ candidates: Candidate[]; diagnostics: SourceResult }> {
  const diagnostics = newDiagnostics(source);

  try {
    const response = await fetchWithTimeout(source.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SedayeSmart/6.0)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      cache: "no-store",
    });

    diagnostics.httpStatus = response.status;

    if (!response.ok) {
      diagnostics.error = `HTTP ${response.status}`;
      return { candidates: [], diagnostics };
    }

    const xml = await response.text();
    const parsed = parseFeed(xml, source.domain, source.source);

    diagnostics.rawItems = parsed.rawItems;
    diagnostics.parsedItems = parsed.items.length;

    const relevant = parsed.items.filter((item) =>
      isRelevantNews(item.title, item.description)
    );

    diagnostics.relevantItems = relevant.length;

    
diagnostics.sampleItems = relevant.map((item) => {
  const date = parseDate(item.publishedAt);

  return {
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt,
    parsedDate: date?.toISOString() ?? null,
    inWindow: isInsideWindow(date, start, end),
  };
});

    console.log(
  "[NEWS-DIAGNOSTICS]",
  JSON.stringify(
    relevant.map((item) => ({
      title: item.title,
      url: item.url,
      publishedAt: item.publishedAt,
      parsedDate: parseDate(item.publishedAt)?.toISOString() ?? null,
      inWindow: isInsideWindow(
        parseDate(item.publishedAt) ?? new Date(0),
        start,
        end
      ),
    }))
  )
);
    
    const dated = relevant.filter((item) => {
      const date = parseDate(item.publishedAt);
      if (!date) diagnostics.noDateItems++;
      return Boolean(date);
    });

    const windowItems = dated.filter((item) =>
      isInsideWindow(parseDate(item.publishedAt), start, end)
    );

    diagnostics.windowItems = windowItems.length;

    return { candidates: windowItems, diagnostics };
  } catch (error) {
    diagnostics.error =
      error instanceof Error
        ? error.name === "AbortError"
          ? "timeout"
          : error.message
        : String(error);

    return { candidates: [], diagnostics };
  }
}

function extractArticleLinks(html: string, sourceDomain: string): string[] {
  const links: string[] = [];
  const normalizedSource = normalizeDomain(sourceDomain);

  const isTasnim =
    normalizedSource === "tasnimnews.ir" ||
    normalizedSource === "tasnimnews.com";

  const attributeRegex =
    /\b(?:href|data-url|data-href|data-link|data-article-url)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;

  let match: RegExpExecArray | null;

  while ((match = attributeRegex.exec(html)) !== null) {
    const href = (match[1] || match[2] || match[3] || "")
      .trim()
      .replace(/&amp;/gi, "&");

    if (
      !href ||
      href.startsWith("#") ||
      /^javascript:/i.test(href) ||
      /^mailto:/i.test(href)
    ) {
      continue;
    }

    try {
      const url = new URL(href, `https://${normalizedSource}/`);
      const host = normalizeDomain(url.hostname);

      const sameDomain = host === normalizedSource;
      const tasnimAlias =
        isTasnim &&
        (host === "tasnimnews.ir" || host === "tasnimnews.com");

      if (!sameDomain && !tasnimAlias) continue;
      if (!isTrustedIranianMedia(host)) continue;

      const path = decodeURIComponent(url.pathname);

      const isArticle =
        /\/(?:fa\/)?news\/\d{4}\/\d{1,2}\/\d{1,2}\//i.test(path) ||
        /\/(?:fa\/)?news\/\d{5,}\/?$/i.test(path);

      if (!isArticle) continue;

      url.hash = "";
      for (const key of [
        "utm_source", "utm_medium", "utm_campaign",
        "utm_term", "utm_content",
      ]) {
        url.searchParams.delete(key);
      }

      links.push(url.toString());
    } catch {
      continue;
    }
  }

  return [...new Set(links)];
}

async function fetchSpecialSource(
  source: SourceConfig,
  start: Date,
  end: Date
): Promise<{ candidates: Candidate[]; diagnostics: SourceResult }> {
  const diagnostics = newDiagnostics(source);

  try {
    const response = await fetchWithTimeout(source.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SedayeSmart/6.0)",
        Accept: "text/html,application/xhtml+xml,*/*",
      },
      cache: "no-store",
    });

    diagnostics.httpStatus = response.status;

    if (!response.ok) {
      diagnostics.error = `HTTP ${response.status}`;
      return { candidates: [], diagnostics };
    }

    const html = await response.text();
    const links = extractArticleLinks(html, source.domain).slice(0, 6);

    diagnostics.rawItems = links.length;

    const results = await Promise.all(
      links.map(async (url): Promise<Candidate | null> => {
        try {
          const articleResponse = await fetchWithTimeout(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; SedayeSmart/6.0)",
              Accept: "text/html,application/xhtml+xml,*/*",
            },
            cache: "no-store",
          });

          if (!articleResponse.ok) return null;

          const article = await articleResponse.text();
          const title = extractArticleTitle(article);
          const description = extractArticleDescription(article);
          const publishedDate = extractArticlePublishedDate(article);

          // تاریخ URL به عنوان تاریخ انتشار جعل یا جایگزین نمی‌شود.
          if (!title || !publishedDate) return null;

          const domain = normalizeDomain(new URL(url).hostname);
          if (!isTrustedIranianMedia(domain)) return null;

          return {
            title,
            url,
            source: getMediaName(domain, source.source),
            domain,
            publishedAt: publishedDate.toISOString(),
            description,
          };
        } catch {
          return null;
        }
      })
    );

    const parsed = results.filter(
      (item): item is Candidate => item !== null
    );

    diagnostics.parsedItems = parsed.length;

    const relevant = parsed.filter((item) =>
      isRelevantNews(item.title, item.description)
    );

    diagnostics.relevantItems = relevant.length;

    const inWindow: Candidate[] = [];

    for (const item of relevant) {
      const date = parseDate(item.publishedAt);

      if (!date) {
        diagnostics.noDateItems++;
        continue;
      }

      if (isInsideWindow(date, start, end)) {
        inWindow.push(item);
      }
    }

    diagnostics.windowItems = inWindow.length;

    return { candidates: inWindow, diagnostics };
  } catch (error) {
    diagnostics.error =
      error instanceof Error
        ? error.name === "AbortError"
          ? "timeout"
          : error.message
        : String(error);

    return { candidates: [], diagnostics };
  }
}

async function getNews(start: Date, end: Date) {
  const results = await Promise.all([
    ...RSS_SOURCES.map((source) => fetchSource(source, start, end)),
    ...SPECIAL_SOURCES.map((source) =>
      fetchSpecialSource(source, start, end)
    ),
  ]);

  const candidates = results.flatMap((result) => result.candidates);
  const diagnostics = results.map((result) => result.diagnostics);

  // فیلتر نهایی مجدداً اعمال می‌شود تا هیچ مسیر ورودی نتواند
  // خبری خارج از بازه یا فاقد تاریخ را وارد گزارش کند.
  const selected = candidates.filter((item) => {
    const date = parseDate(item.publishedAt);

    return (
      Boolean(date) &&
      isRelevantNews(item.title, item.description) &&
      isInsideWindow(date, start, end)
    );
  });

  selected.sort((a, b) => {
    const da = parseDate(a.publishedAt)?.getTime() || 0;
    const db = parseDate(b.publishedAt)?.getTime() || 0;
    return db - da;
  });

  const mapped: NewsItem[] = selected.map((item) => ({
    title: cleanText(item.title),
    url: item.url,
    source: getMediaName(item.domain, item.source),
    domain: normalizeDomain(item.domain),
    publishedAt: parseDate(item.publishedAt)!.toISOString(),
  }));

  return {
    news: dedupeNews(mapped).slice(0, MAX_NEWS),
    diagnostics,
  };
}

async function getScheduleState(env: CloudflareEnv): Promise<boolean> {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("[news] Supabase configuration missing");
    return true;
  }

  try {
    const url =
      `${supabaseUrl}/rest/v1/settings` +
      "?key=eq.schedule_news&select=value&limit=1";

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("[news] Supabase settings GET failed:", response.status);
      return true;
    }

    const rows: unknown = await response.json();

    if (!Array.isArray(rows) || rows.length === 0) return true;

    const value = (rows[0] as { value?: unknown })?.value;

    return !(
      value === false ||
      value === "false" ||
      value === 0 ||
      value === "0"
    );
  } catch (error) {
    console.error("[news] schedule state error:", error);
    return true;
  }
}

async function sendBaleMessage(env: CloudflareEnv, text: string) {
  const token = env.BALE_SMART_TOKEN;
  const chatId = env.BALE_GROUP_ID;

  if (!token || !chatId) {
    throw new Error("BALE_SMART_TOKEN or BALE_GROUP_ID is missing");
  }

  const response = await fetch(
    `https://tapi.bale.ai/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: false,
      }),
    }
  );

  const data: unknown = await response.json();

  if (
    !response.ok ||
    (typeof data === "object" &&
      data !== null &&
      "ok" in data &&
      (data as { ok?: unknown }).ok === false)
  ) {
    throw new Error(`Bale sendMessage failed: ${JSON.stringify(data)}`);
  }

  return data;
}

function formatNewsMessage(news: NewsItem[], sentAt: Date): string {
  const time = new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(sentAt);

  const lines: string[] = [
    "ثبت احوال در رسانه ها",
    `🕐 زمان ارسال: ${time}`,
    `📰 تعداد اخبار: ${news.length}`,
    "━━━━━━━━━━━━━━",
    "",
  ];

  news.forEach((item, index) => {
    lines.push(`${index + 1}️⃣ ${item.title}`);
    lines.push(`📰 ${item.source}`);
    lines.push(`🔗 ${item.url}`);
    lines.push("");
  });

  lines.push("━━━━━━━━━━━━━━");

  return lines.join("\n");
}

export async function GET(_request: Request) {
  const startedAt = Date.now();

  try {
    const { env } = await getCloudflareContext({ async: true });

    const scheduleEnabled = await getScheduleState(env);

    if (!scheduleEnabled) {
      return NextResponse.json(
        {
          ok: true,
          cancelled: true,
          sent: false,
          reason: "schedule_news_disabled",
          message: "ارسال اخبار ثبت احوال لغو شده است.",
          runtime_ms: Date.now() - startedAt,
        },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        }
      );
    }

    const { start, end, startTehran, endTehran } = getReportWindow();
    const result = await getNews(start, end);
    const news = result.news;
    const mediaSet = new Set(news.map((item) => item.domain));

    const newsStats = {
      totalFetched: result.diagnostics.reduce(
        (total, item) => total + item.rawItems,
        0
      ),
      parsedItems: result.diagnostics.reduce(
        (total, item) => total + item.parsedItems,
        0
      ),
      relevantBeforeWindow: result.diagnostics.reduce(
        (total, item) => total + item.relevantItems,
        0
      ),
      selected: news.length,
      mediaCount: mediaSet.size,
      minimumMedia: MIN_MEDIA,
      maximumNews: MAX_NEWS,
      noDate: result.diagnostics.reduce(
        (total, item) => total + item.noDateItems,
        0
      ),
      windowItems: result.diagnostics.reduce(
        (total, item) => total + item.windowItems,
        0
      ),
    };

    const reportWindow = {
      start: start.toISOString(),
      end: end.toISOString(),
      start_tehran: startTehran,
      end_tehran: endTehran,
    };

    if (new URL(_request.url).searchParams.get("diagnostics") === "1") {
  return NextResponse.json(
    {
      ok: true,
      diagnosticsOnly: true,
      news: newsStats,
      sources: result.diagnostics,
      report_window: reportWindow,
      runtime_ms: Date.now() - startedAt,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
    }
    
    /*
     * هیچ پیام «خبر جدیدی نیست» هم به بله ارسال نمی‌شود.
     */
    if (news.length === 0 || mediaSet.size < MIN_MEDIA) {
      return NextResponse.json(
        {
          ok: true,
          cancelled: false,
          sent: false,
          reason: "no_relevant_iranian_media",
          news: newsStats,
          sources: result.diagnostics,
          report_window: reportWindow,
          runtime_ms: Date.now() - startedAt,
        },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        }
      );
    }

    const message = formatNewsMessage(news, new Date());
    const bale = await sendBaleMessage(env, message);
    const sentAt = new Date();

    const sentAtTehran = new Intl.DateTimeFormat("fa-IR", {
      timeZone: "Asia/Tehran",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(sentAt);

    return NextResponse.json(
      {
        ok: true,
        cancelled: false,
        sent: true,
        sent_at: sentAt.toISOString(),
        sent_at_tehran: sentAtTehran,
        bale_status: 200,
        bale,
        news: newsStats,
        sources: result.diagnostics,
        report_window: reportWindow,
        runtime_ms: Date.now() - startedAt,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("[news] daily summary error:", error);

    return NextResponse.json(
      {
        ok: false,
        sent: false,
        error: error instanceof Error ? error.message : String(error),
        runtime_ms: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}

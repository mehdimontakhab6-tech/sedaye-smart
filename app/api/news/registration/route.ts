import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

const MAX_NEWS = 20;
const MIN_MEDIA_TO_SEND = 1;
const MAX_MEDIA_TO_SEND = 20;
const REQUEST_TIMEOUT_MS = 7000;
const IRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;

const USER_AGENT =
  "Mozilla/5.0 (compatible; SedayeSmart/1.0; +https://sedaye-smart.mehdimontakhab6.workers.dev)";

type CloudflareEnv = {
  BALE_SMART_TOKEN?: string;
  BALE_GROUP_ID?: string;
};

type NewsItem = {
  title: string;
  link: string;
  description: string;
  source: string;
  publishedAt: string;
};

type Candidate = {
  title: string;
  link: string;
  description: string;
  publishedAt: string;
};

type SourceConfig = {
  name: string;
  url: string;
};

type SourceResult = {
  source: string;
  url: string;
  status: number | null;
  rawItems: number;
  parsedItems: number;
  relevantItems: number;
  missingDate: number;
  outsideWindow: number;
  error?: string;
  samples: Array<{ title: string; publishedAt: string }>;
  keywordSamples: Array<{
    title: string;
    publishedAt: string;
    description: string;
  }>;
  matchedSamples: Array<{
    title: string;
    publishedAt: string;
    reason: string;
    matchedTerms: string[];
  }>;
  nearMatchSamples: Array<{
    title: string;
    publishedAt: string;
    matchedTerms: string[];
  }>;
};

type ReportWindow = {
  start: Date;
  end: Date;
};

type FetchTextResult = {
  status: number;
  ok: boolean;
  body: string;
};

// همه منابع RSS برای بررسی خبرهای ثبت احوال
const RSS_SOURCES: SourceConfig[] = [
  { name: "ایرنا", url: "https://www.irna.ir/rss" },
  { name: "ایسنا", url: "https://www.isna.ir/rss" },
  { name: "مهر", url: "https://www.mehrnews.com/rss" },
  { name: "ایلنا", url: "https://www.ilna.ir/rss" },
  { name: "باشگاه خبرنگاران جوان", url: "https://www.yjc.ir/fa/rss/allnews" },
  { name: "خبرآنلاین", url: "https://www.khabaronline.ir/rss" },
  { name: "تابناک", url: "https://www.tabnak.ir/fa/rss/allnews" },
  { name: "عصر ایران", url: "https://www.asriran.com/fa/rss/allnews" },
  { name: "همشهری آنلاین", url: "https://www.hamshahrionline.ir/rss" },
  { name: "جام جم آنلاین", url: "https://jamejamonline.ir/fa/rss/allnews" },
  { name: "میزان", url: "https://www.mizanonline.ir/fa/rss/allnews" },
  { name: "شبکه خبر", url: "https://www.iribnews.ir/fa/rss/allnews" },
  { name: "شانا", url: "https://www.shana.ir/rss" },
  { name: "ایکنا", url: "https://iqna.ir/fa/rss" },
  { name: "انتخاب", url: "https://www.entekhab.ir/fa/rss/allnews" },
  { name: "تسنیم", url: "https://www.tasnimnews.ir/fa/rss" },
  { name: "خبرگزاری دانشجو", url: "https://snn.ir/fa/rss/allnews" },
  { name: "ایمنا", url: "https://www.imna.ir/rss" },
  { name: "خبرگزاری آنا", url: "https://ana.ir/fa/rss/allnews" },
  { name: "ایسکانیوز", url: "https://www.iscanews.ir/rss" },
];

const BLOCKED_DOMAINS = [
  "reuters.com",
  "apnews.com",
  "bbc.com",
  "bbc.co.uk",
  "cnn.com",
  "nytimes.com",
  "theguardian.com",
  "aljazeera.com",
  "dw.com",
  "voanews.com",
];

const STRONG_TERMS = [
  "سازمان ثبت احوال",
  "سازمان ثبت احوال کشور",
  "ثبت احوال",
  "اداره ثبت احوال",
  "ادارات ثبت احوال",
  "رئیس سازمان ثبت احوال",
  "رییس سازمان ثبت احوال",
  "رئیس ثبت احوال",
  "رییس ثبت احوال",
  "مدیرکل ثبت احوال",
  "مدیر کل ثبت احوال",
  "معاون سازمان ثبت احوال",
  "سخنگوی سازمان ثبت احوال",
  "پایگاه اطلاعات جمعیت سازمان ثبت احوال",
  "سامانه سازمان ثبت احوال",
  "درگاه سازمان ثبت احوال",
  "ثبت وقایع حیاتی",
];

const SECONDARY_TERMS = [
  "کارت ملی",
  "کارت هوشمند ملی",
  "کارت ملی هوشمند",
  "کد ملی",
  "شماره ملی",
  "شناسنامه",
  "صدور شناسنامه",
  "تعویض شناسنامه",
  "شناسنامه المثنی",
  "شناسنامه نوزاد",
  "گواهی ولادت",
  "گواهی فوت",
  "اطلاعات هویتی",
  "اسناد هویتی",
  "احراز هویت",
  "پایگاه جمعیت",
  "آمار ولادت",
  "آمار تولد",
  "آمار فوت",
  "آمار وفات",
  "آمار ازدواج",
  "آمار طلاق",
  "ثبت ولادت",
  "ثبت وفات",
  "ثبت ازدواج",
  "ثبت طلاق",
  "خدمات هویتی",
];

/**
 * خدمات مشخص حوزه ثبت احوال.
 * وجود این عبارت‌ها در عنوان برای پذیرش خبر کافی است.
 */
const DIRECT_SERVICE_TERMS = [
  "صدور شناسنامه",
  "تعویض شناسنامه",
  "شناسنامه المثنی",
  "شناسنامه نوزاد",
  "گواهی ولادت",
  "گواهی فوت",
  "پایگاه اطلاعات جمعیت",
  "درگاه خدمات الکترونیک ثبت احوال",
  "خدمات الکترونیک ثبت احوال",
  "اصلاح مشخصات شناسنامه",
  "اصلاح مشخصات هویتی",
  "ثبت ولادت",
  "ثبت وفات",
  "ثبت ازدواج",
  "ثبت طلاق",
  "ثبت وقایع حیاتی",
];

const BLOCKED_TITLE_TERMS = [
  "قیمت خودرو",
  "قیمت دلار",
  "قیمت طلا",
  "قیمت سکه",
  "قیمت مسکن",
  "بورس امروز",
  "شاخص بورس",
  "نتیجه فوتبال",
  "نتایج فوتبال",
  "لیگ برتر",
  "جدول لیگ",
  "ترکیب استقلال",
  "ترکیب پرسپولیس",
  "نقل و انتقالات فوتبال",
  "پیش بینی هوا",
  "پیش‌بینی هوا",
  "فال روزانه",
  "اوقات شرعی",
  "سهمیه ارز",
  "خرید ارز",
  "فروش ارز",
  "قیمت ارز",
  "نرخ ارز",
  "دلار سهمیه ای",
  "دلار مسافرتی",
  "ارز مسافرتی",
  "محصولات کشاورزی",
  "صادرات کشاورزی",
  "شناسنامه دار محصولات",
];

const NON_REGISTRATION_CONTEXT_TERMS = [
  "هویت بصری",
  "هویت برند",
  "هویت فرهنگی",
  "هویت تاریخی",
  "هویت سیاسی",
  "هویت هنری",
  "هویت معماری",
  "هویت شهری",
  "هویت باشگاه",
  "هویت تیم",
  "کارت ملی خودرو",
  "کارت شناسایی خودرو",
  "شناسایی خودرو",
  "هویت دیجیتال برند",
  "سازمان امور مالیاتی",
  "مودیان مالیاتی",
  "هویت اقتصادی",
  "فرار مالیاتی",
  "مالیات بر ارزش افزوده",
  "اظهارنامه مالیاتی",
  "درگاه ملی خدمات مالیاتی",
  "بانک مرکزی",
  "صرافی",
];

const CARD_ID_TERMS = [
  "کارت ملی",
  "کارت هوشمند ملی",
  "کارت ملی هوشمند",
];

const CARD_ACTION_TERMS = [
  "صدور",
  "تمدید",
  "تعویض",
  "اعتبار",
  "تمدید اعتبار",
  "هوشمندسازی",
  "هوشمند سازی",
  "ثبت نام",
  "ثبت‌نام",
  "دریافت",
  "تحویل",
  "ارائه",
  "فعال سازی",
  "فعال‌سازی",
  "غیرفعال سازی",
  "غیرفعال‌سازی",
  "پیگیری",
  "نوبت دهی",
  "نوبت‌دهی",
  "درخواست",
  "مهلت",
  "خدمات",
  "سامانه",
  "انقضا",
];

const SHENASNAMEH_ACTION_TERMS = [
  "صدور",
  "تعویض",
  "اصلاح",
  "المثنی",
  "نوزاد",
  "هوشمند",
  "خدمات",
  "درخواست",
  "ثبت نام",
  "ثبت‌نام",
  "دریافت",
  "تحویل",
  "استعلام",
  "سامانه",
  "مهلت",
  "اعتبار",
  "تغییر مشخصات",
];

const BIRTH_DEATH_TERMS = [
  "ولادت",
  "تولد",
  "وفات",
  "فوت",
];

const EVENT_ACTION_TERMS = [
  "ثبت",
  "آمار",
  "گواهی",
  "صدور",
  "خدمات",
  "وقایع حیاتی",
  "ثبت احوال",
  "اطلاعات جمعیت",
];

const MARRIAGE_DIVORCE_TERMS = [
  "ازدواج",
  "طلاق",
];

const NAME_CHANGE_TERMS = [
  "تغییر نام",
  "تغییر نام خانوادگی",
  "اصلاح نام",
  "اصلاح نام خانوادگی",
];

/**
 * فقط موضوعات واقعی مرتبط برای نمونه‌های near match.
 * واژه‌های عمومی مانند «ثبت»، «صدور»، «خدمات» و «جمعیت»
 * به‌تنهایی نباید باعث ساخته‌شدن نمونه شوند.
 */
const NEAR_MATCH_TERMS = [
  "ثبت احوال",
  "سازمان ثبت احوال",
  "کارت ملی",
  "کارت هوشمند ملی",
  "کارت ملی هوشمند",
  "کد ملی",
  "شماره ملی",
  "شناسنامه",
  "ولادت",
  "تولد",
  "وفات",
  "فوت",
  "ازدواج",
  "طلاق",
  "گواهی ولادت",
  "گواهی فوت",
  "ثبت وقایع حیاتی",
  "پایگاه اطلاعات جمعیت",
  "تغییر نام",
  "تغییر نام خانوادگی",
  "اصلاح نام",
  "اصلاح نام خانوادگی",
];

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\u200c/g, " ")
    .replace(/[\u200b-\u200f\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, digits: string) => {
      const code = Number(digits);
      if (
        !Number.isInteger(code) ||
        code < 0 ||
        code > 0x10ffff ||
        (code >= 0xd800 && code <= 0xdfff)
      ) {
        return "";
      }
      return String.fromCodePoint(code);
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, digits: string) => {
      const code = parseInt(digits, 16);
      if (
        !Number.isInteger(code) ||
        code < 0 ||
        code > 0x10ffff ||
        (code >= 0xd800 && code <= 0xdfff)
      ) {
        return "";
      }
      return String.fromCodePoint(code);
    });
}

function cleanText(value: unknown): string {
  return decodeXml(String(value ?? ""))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u200b-\u200f\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanNewsTitle(title: string): string {
  return title
    .replace(
      /\s*[-–—|،:]?\s*(?:(?:کد|شماره|شناسه)(?:\s+خبر)?)\s*[:：#-]?\s*[۰-۹0-9]+\s*$/i,
      ""
    )
    .replace(/\s*[\[(（]\s*[۰-۹0-9]{4,}\s*[\])）]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTag(block: string, tag: string): string {
  const escaped = escapeRegExp(tag);
  const expression = new RegExp(
    `<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}\\s*>`,
    "i"
  );
  const match = block.match(expression);
  return match ? cleanText(match[1]) : "";
}

function normalizeDomain(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

function isBlockedDomain(url: string): boolean {
  try {
    const hostname = normalizeDomain(new URL(url).hostname);
    return BLOCKED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return true;
  }
}

function isIranianNewsLink(url: string): boolean {
  try {
    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }

    const host = normalizeDomain(parsed.hostname);

    if (isBlockedDomain(url)) {
      return false;
    }

    return (
      host.endsWith(".ir") ||
      host === "tasnimnews.ir" ||
      host === "tasnimnews.com"
    );
  } catch {
    return false;
  }
}

/**
 * تطبیق عبارت با مرز واژه.
 *
 * برای مثال:
 * «فوت» در «فوتبال» پیدا نمی‌شود.
 * اما «فوت» در «گواهی فوت» یا «ثبت فوت» پیدا می‌شود.
 */
function containsTerm(text: string, term: string): boolean {
  const normalizedText = normalizeText(text);
  const normalizedTerm = normalizeText(term);

  if (!normalizedText || !normalizedTerm) {
    return false;
  }

  const expression = new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegExp(normalizedTerm)}(?=$|[^\\p{L}\\p{N}])`,
    "u"
  );

  return expression.test(normalizedText);
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => containsTerm(text, term));
}

function findMatchedTerms(
  text: string,
  terms: string[]
): string[] {
  return terms.filter((term) => containsTerm(text, term));
}

function uniqueTerms(terms: string[]): string[] {
  return [...new Set(terms)];
}

type RelevanceDecision = {
  relevant: boolean;
  reason: string;
  matchedTerms: string[];
};

/**
 * ارزیابی ارتباط خبر با وظایف سازمان ثبت احوال.
 *
 * اولویت تصمیم‌گیری:
 * ۱. حذف موضوعات صریحاً نامرتبط
 * ۲. پذیرش نام صریح سازمان در عنوان
 * ۳. پذیرش خدمات مشخص در عنوان
 * ۴. پذیرش کارت ملی و شناسنامه فقط همراه با اقدام مشخص
 * ۵. پذیرش ولادت و وفات فقط همراه با اقدام مرتبط
 * ۶. پذیرش آمار ازدواج و طلاق
 * ۷. پذیرش تغییر نام فقط با قرینه صریح ثبت احوال
 * ۸. پذیرش اشاره به سازمان در متن همراه با موضوع مرتبط
 */
function evaluateRegistrationNews(
  title: string,
  description = ""
): RelevanceDecision {
  const normalizedTitle = normalizeText(title);
  const normalizedDescription = normalizeText(description);
  const combined = `${normalizedTitle} ${normalizedDescription}`;

  const rejected: RelevanceDecision = {
    relevant: false,
    reason: "شواهد کافی برای ارتباط با ثبت احوال وجود ندارد",
    matchedTerms: [],
  };

  if (!normalizedTitle) {
    return {
      ...rejected,
      reason: "عنوان خبر خالی است",
    };
  }

  // اولویت حذف موضوعات صریحاً نامرتبط
  if (includesAny(normalizedTitle, BLOCKED_TITLE_TERMS)) {
    return {
      ...rejected,
      reason: "عنوان شامل موضوع صریحاً نامرتبط است",
      matchedTerms: findMatchedTerms(
        normalizedTitle,
        BLOCKED_TITLE_TERMS
      ),
    };
  }

  if (
    includesAny(
      normalizedTitle,
      NON_REGISTRATION_CONTEXT_TERMS
    )
  ) {
    return {
      ...rejected,
      reason: "عنوان در زمینه هویتی غیرمرتبط قرار دارد",
      matchedTerms: findMatchedTerms(
        normalizedTitle,
        NON_REGISTRATION_CONTEXT_TERMS
      ),
    };
  }

  // نام صریح ثبت احوال در عنوان
  const strongTitleMatches = findMatchedTerms(
    normalizedTitle,
    STRONG_TERMS
  );

  if (strongTitleMatches.length > 0) {
    return {
      relevant: true,
      reason: "وجود عبارت صریح ثبت احوال در عنوان",
      matchedTerms: strongTitleMatches,
    };
  }

  // خدمات مشخص ثبت احوال در عنوان
  const directTitleMatches = findMatchedTerms(
    normalizedTitle,
    DIRECT_SERVICE_TERMS
  );

  if (directTitleMatches.length > 0) {
    return {
      relevant: true,
      reason: "وجود خدمت مشخص ثبت احوال در عنوان",
      matchedTerms: directTitleMatches,
    };
  }

  // کارت ملی فقط همراه با اقدام مشخص
  const cardMatches = findMatchedTerms(
    normalizedTitle,
    CARD_ID_TERMS
  );

  const cardActions = findMatchedTerms(
    normalizedTitle,
    CARD_ACTION_TERMS
  );

  if (cardMatches.length > 0 && cardActions.length > 0) {
    return {
      relevant: true,
      reason: "موضوع کارت ملی همراه با اقدام مشخص",
      matchedTerms: uniqueTerms([
        ...cardMatches,
        ...cardActions,
      ]),
    };
  }

  // شناسنامه فقط همراه با اقدام یا خدمت مشخص
  const shenasnamehMatches = findMatchedTerms(
    normalizedTitle,
    ["شناسنامه"]
  );

  const shenasnamehActions = findMatchedTerms(
    normalizedTitle,
    SHENASNAMEH_ACTION_TERMS
  );

  if (
    shenasnamehMatches.length > 0 &&
    shenasnamehActions.length > 0
  ) {
    return {
      relevant: true,
      reason: "موضوع شناسنامه همراه با اقدام یا خدمت مشخص",
      matchedTerms: uniqueTerms([
        ...shenasnamehMatches,
        ...shenasnamehActions,
      ]),
    };
  }

  // ولادت و وفات فقط همراه با ثبت، آمار یا خدمت مشخص
  const birthDeathMatches = findMatchedTerms(
    normalizedTitle,
    BIRTH_DEATH_TERMS
  );

  const eventActions = findMatchedTerms(
    normalizedTitle,
    EVENT_ACTION_TERMS
  );

  if (
    birthDeathMatches.length > 0 &&
    eventActions.length > 0
  ) {
    return {
      relevant: true,
      reason: "موضوع ولادت یا وفات همراه با ثبت، آمار یا خدمت",
      matchedTerms: uniqueTerms([
        ...birthDeathMatches,
        ...eventActions,
      ]),
    };
  }

  // آمار ازدواج و طلاق
  const marriageDivorceMatches = findMatchedTerms(
    normalizedTitle,
    MARRIAGE_DIVORCE_TERMS
  );

  const statisticsMatches = findMatchedTerms(
    normalizedTitle,
    ["آمار", "آمارهای", "آمار جدید"]
  );

  if (
    marriageDivorceMatches.length > 0 &&
    statisticsMatches.length > 0
  ) {
    return {
      relevant: true,
      reason: "عنوان شامل آمار ازدواج یا طلاق است",
      matchedTerms: uniqueTerms([
        ...marriageDivorceMatches,
        ...statisticsMatches,
      ]),
    };
  }

  // تغییر نام فقط با قرینه صریح ثبت احوال
  const explicitRegistration = findMatchedTerms(
    combined,
    STRONG_TERMS
  );

  const nameChangeMatches = findMatchedTerms(
    combined,
    NAME_CHANGE_TERMS
  );

  if (
    explicitRegistration.length > 0 &&
    nameChangeMatches.length > 0
  ) {
    return {
      relevant: true,
      reason: "تغییر نام همراه با اشاره صریح به ثبت احوال",
      matchedTerms: uniqueTerms([
        ...explicitRegistration,
        ...nameChangeMatches,
      ]),
    };
  }

  // نام سازمان در متن همراه با موضوع یا خدمت مرتبط
  if (explicitRegistration.length > 0) {
    const serviceMatches = findMatchedTerms(
      combined,
      [
        ...SECONDARY_TERMS,
        ...DIRECT_SERVICE_TERMS,
        ...CARD_ID_TERMS,
        ...NAME_CHANGE_TERMS,
      ]
    );

    if (serviceMatches.length > 0) {
      return {
        relevant: true,
        reason: "اشاره به ثبت احوال و یک خدمت یا موضوع مرتبط در متن",
        matchedTerms: uniqueTerms([
          ...explicitRegistration,
          ...serviceMatches,
        ]),
      };
    }
  }

  // خبر رد شده؛ فقط موضوعات واقعی برای Diagnostics ثبت می‌شوند.
  return {
    ...rejected,
    matchedTerms: uniqueTerms(
      findMatchedTerms(combined, NEAR_MATCH_TERMS)
    ),
  };
}

function isRelevantNews(
  title: string,
  description = ""
): boolean {
  return evaluateRegistrationNews(title, description).relevant;
}

// دریافت پاسخ همراه با متن، در محدوده زمانی تعیین‌شده
async function fetchText(
  url: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<FetchTextResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        ...(init.headers || {}),
      },
    });

    const body = await response.text();

    return {
      status: response.status,
      ok: response.ok,
      body,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseGregorianDate(value: string): Date | null {
  const input = value.trim();
  if (!input) return null;

  const direct = new Date(input);

  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const match = input.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/
  );

  if (!match) return null;

  const [, y, m, d, h = "0", min = "0", sec = "0"] = match;

  const result = new Date(
    Date.UTC(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(h),
      Number(min),
      Number(sec)
    )
  );

  if (
    result.getUTCFullYear() !== Number(y) ||
    result.getUTCMonth() !== Number(m) - 1 ||
    result.getUTCDate() !== Number(d)
  ) {
    return null;
  }

  return Number.isNaN(result.getTime()) ? null : result;
}

function jalaliToGregorian(
  jy: number,
  jm: number,
  jd: number
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

  const jalaliMonthDays = [
    31, 31, 31, 31, 31, 31,
    30, 30, 30, 30, 30, 29,
  ];

  if (jm <= 6 && jd > 31) return null;
  if (jm >= 7 && jm <= 11 && jd > 30) return null;
  if (jm === 12 && jd > 30) return null;

  let year = jy - 979;
  const month = jm - 1;
  const day = jd - 1;

  let days =
    365 * year +
    Math.floor(year / 33) * 8 +
    Math.floor(((year % 33) + 3) / 4);

  for (let i = 0; i < month; i++) {
    days += jalaliMonthDays[i];
  }

  days += day;

  let gDays = days + 79;
  let gy = 1600 + 400 * Math.floor(gDays / 146097);

  gDays %= 146097;

  let leap = true;

  if (gDays >= 36525) {
    gDays--;
    gy += 100 * Math.floor(gDays / 36524);
    gDays %= 36524;

    if (gDays >= 365) {
      gDays++;
    } else {
      leap = false;
    }
  }

  gy += 4 * Math.floor(gDays / 1461);
  gDays %= 1461;

  if (gDays >= 366) {
    leap = false;
    gDays--;
    gy += Math.floor(gDays / 365);
    gDays %= 365;
  }

  const gregorianMonthDays = [
    31,
    leap ? 29 : 28,
    31, 30, 31, 30,
    31, 31, 30, 31, 30, 31,
  ];

  let gm = 0;

  while (gm < 12 && gDays >= gregorianMonthDays[gm]) {
    gDays -= gregorianMonthDays[gm];
    gm++;
  }

  if (gm >= 12) return null;

  return new Date(Date.UTC(gy, gm, gDays + 1));
}

function parseDate(value: string): Date | null {
  const input = cleanText(value);

  if (!input) return null;

  const normalized = normalizeText(input);

  const numericJalali = normalized.match(
    /(?:^|\D)(14\d{2})[/-](\d{1,2})[/-](\d{1,2})(?=$|\D)/
  );

  if (numericJalali) {
    const date = jalaliToGregorian(
      Number(numericJalali[1]),
      Number(numericJalali[2]),
      Number(numericJalali[3])
    );

    if (date) return date;
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

  const textualJalali = normalized.match(
    /(\d{1,2})\s+(فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند)\s+(14\d{2})/
  );

  if (textualJalali) {
    const date = jalaliToGregorian(
      Number(textualJalali[3]),
      months[textualJalali[2]],
      Number(textualJalali[1])
    );

    if (date) return date;
  }

  return parseGregorianDate(input);
}

/**
 * بازه گزارش روزانه:
 * اجرای عادی در ساعت ۲۲:۳۰، بازه ۲۴ ساعت منتهی به همان لحظه را می‌گیرد.
 *
 * حالت preview:
 * نزدیک‌ترین بازه آینده تا ساعت ۲۲:۳۰ را برای Diagnostics انتخاب می‌کند.
 */
function getReportWindow(
  now = new Date(),
  preview = false
): ReportWindow {
  const iranNow = new Date(now.getTime() + IRAN_OFFSET_MS);

  const year = iranNow.getUTCFullYear();
  const month = iranNow.getUTCMonth();
  const day = iranNow.getUTCDate();

  const hour = iranNow.getUTCHours();
  const minute = iranNow.getUTCMinutes();

  const todayBoundary = Date.UTC(year, month, day, 22, 30, 0);
  const beforeBoundary = hour < 22 || (hour === 22 && minute < 30);

  let endLocal: number;

  if (preview) {
    endLocal = beforeBoundary
      ? todayBoundary
      : todayBoundary + 24 * 60 * 60 * 1000;
  } else {
    endLocal = beforeBoundary
      ? todayBoundary - 24 * 60 * 60 * 1000
      : todayBoundary;
  }

  const startLocal = endLocal - 24 * 60 * 60 * 1000;

  return {
    start: new Date(startLocal - IRAN_OFFSET_MS),
    end: new Date(endLocal - IRAN_OFFSET_MS),
  };
}

function extractLink(block: string): string {
  const links = block.match(/<link\b[^>]*\/?>/gi) || [];

  for (const tag of links) {
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i);

    if (!href?.[1]) continue;

    const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/i);
    const relValue = (rel?.[1] || "").toLowerCase();

    if (relValue && relValue !== "alternate") {
      continue;
    }

    return decodeXml(href[1]).trim();
  }

  const rssLink = block.match(
    /<link(?:\s[^>]*)?>([\s\S]*?)<\/link\s*>/i
  );

  if (rssLink?.[1]) {
    return cleanText(rssLink[1]);
  }

  const guid = block.match(
    /<guid(?:\s[^>]*)?>([\s\S]*?)<\/guid\s*>/i
  );

  if (guid?.[1]) {
    const value = cleanText(guid[1]);

    if (/^https?:\/\//i.test(value)) {
      return value;
    }
  }

  return "";
}

function parseFeed(xml: string): Candidate[] {
  const blocks =
    xml.match(
      /<(?:item|entry)\b[^>]*>[\s\S]*?<\/(?:item|entry)\s*>/gi
    ) || [];

  const result: Candidate[] = [];

  for (const block of blocks) {
    const title =
      extractTag(block, "title") ||
      extractTag(block, "media:title");

    const link = extractLink(block);

    const description =
      extractTag(block, "description") ||
      extractTag(block, "summary") ||
      extractTag(block, "content:encoded") ||
      extractTag(block, "content");

    const published =
      extractTag(block, "pubDate") ||
      extractTag(block, "published") ||
      extractTag(block, "updated") ||
      extractTag(block, "dc:date") ||
      extractTag(block, "date");

    if (!title || !link || !isIranianNewsLink(link)) {
      continue;
    }

    result.push({
      title,
      link,
      description,
      publishedAt: published,
    });
  }

  return result;
}

function getKeywordSamples(
  candidates: Candidate[]
): SourceResult["keywordSamples"] {
  const keywords = [
    ...STRONG_TERMS,
    ...SECONDARY_TERMS,
    ...DIRECT_SERVICE_TERMS,
    "ولادت",
    "تولد",
    "وفات",
    "فوت",
    "ازدواج",
    "طلاق",
  ];

  return candidates
    .filter((item) =>
      includesAny(
        `${item.title} ${item.description}`,
        keywords
      )
    )
    .slice(0, 10)
    .map((item) => ({
      title: item.title,
      publishedAt: item.publishedAt,
      description: item.description.slice(0, 240),
    }));
}

// نمونه خبرهایی که به موضوع نزدیک هستند اما فیلتر آن‌ها را نپذیرفته است.
function getNearMatchSamples(
  candidates: Candidate[]
): SourceResult["nearMatchSamples"] {
  const result: SourceResult["nearMatchSamples"] = [];

  for (const item of candidates) {
    const analysis = evaluateRegistrationNews(
      item.title,
      item.description
    );

    if (
      analysis.relevant ||
      analysis.matchedTerms.length === 0
    ) {
      continue;
    }

    result.push({
      title: item.title,
      publishedAt: item.publishedAt,
      matchedTerms: analysis.matchedTerms,
    });

    if (result.length >= 10) {
      break;
    }
  }

  return result;
}

async function fetchSource(
  source: SourceConfig,
  window: ReportWindow
): Promise<{
  items: NewsItem[];
  diagnostics: SourceResult;
}> {
  const diagnostics: SourceResult = {
    source: source.name,
    url: source.url,
    status: null,
    rawItems: 0,
    parsedItems: 0,
    relevantItems: 0,
    missingDate: 0,
    outsideWindow: 0,
    samples: [],
    keywordSamples: [],
    matchedSamples: [],
    nearMatchSamples: [],
  };

  try {
    const response = await fetchText(source.url);

    diagnostics.status = response.status;

    if (!response.ok) {
      diagnostics.error = `HTTP ${response.status}`;
      return { items: [], diagnostics };
    }

    const body = response.body;

    if (/^\s*(?:<!doctype\s+html\b|<html\b)/i.test(body)) {
      diagnostics.error = "Expected RSS/XML but received HTML";
      return { items: [], diagnostics };
    }

    diagnostics.rawItems =
      (body.match(/<(?:item|entry)\b/gi) || []).length;

    const candidates = parseFeed(body);

    diagnostics.parsedItems = candidates.length;
    diagnostics.keywordSamples = getKeywordSamples(candidates);
    diagnostics.nearMatchSamples = getNearMatchSamples(candidates);

    const items: NewsItem[] = [];

    for (const candidate of candidates) {
      const analysis = evaluateRegistrationNews(
        candidate.title,
        candidate.description
      );

      if (!analysis.relevant) {
        continue;
      }

      diagnostics.relevantItems++;

      // ثبت دلیل پذیرش خبر برای بررسی دقیق‌تر در Diagnostics
      if (diagnostics.matchedSamples.length < 10) {
        diagnostics.matchedSamples.push({
          title: candidate.title,
          publishedAt: candidate.publishedAt,
          reason: analysis.reason,
          matchedTerms: analysis.matchedTerms,
        });
      }

      const publishedDate = parseDate(candidate.publishedAt);

      if (!publishedDate) {
        diagnostics.missingDate++;
        continue;
      }

      if (
        publishedDate < window.start ||
        publishedDate >= window.end
      ) {
        diagnostics.outsideWindow++;
        continue;
      }

      items.push({
        title: candidate.title,
        link: candidate.link,
        description: candidate.description,
        source: source.name,
        publishedAt: publishedDate.toISOString(),
      });
    }

    diagnostics.samples = candidates.slice(0, 5).map((item) => ({
      title: item.title,
      publishedAt: item.publishedAt,
    }));

    return { items, diagnostics };
  } catch (error) {
    diagnostics.error =
      error instanceof Error
        ? error.message
        : "Unknown fetch error";

    return { items: [], diagnostics };
  }
}

/**
 * خبرهای تکراری یک رسانه حذف می‌شوند.
 * اما اگر چند رسانه مستقل یک خبر را منتشر کرده باشند،
 * خبر هر رسانه حفظ می‌شود تا تعداد رسانه‌ها درست محاسبه شود.
 */
function deduplicate(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const result: NewsItem[] = [];

  for (const item of items) {
    const titleKey = normalizeText(item.title).replace(
      /[^\p{L}\p{N}]+/gu,
      ""
    );

    const key = `${item.source}:${titleKey}`;

    if (!titleKey || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

async function getNews(
  window: ReportWindow
): Promise<{
  items: NewsItem[];
  diagnostics: SourceResult[];
}> {
  const results = await Promise.all(
    RSS_SOURCES.map((source) => fetchSource(source, window))
  );

  const diagnostics = results.map(
    (result) => result.diagnostics
  );

  const allItems = results.flatMap(
    (result) => result.items
  );

  // ابتدا خبرها از جدیدترین به قدیمی‌ترین مرتب می‌شوند.
  const sortedItems = deduplicate(allItems).sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() -
      new Date(a.publishedAt).getTime()
  );

  // انتخاب حداکثر ۲۰ رسانه مستقل و حداکثر ۲۰ خبر.
  const selectedSources = new Set<string>();
  const items: NewsItem[] = [];

  for (const item of sortedItems) {
    if (items.length >= MAX_NEWS) {
      break;
    }

    if (
      !selectedSources.has(item.source) &&
      selectedSources.size >= MAX_MEDIA_TO_SEND
    ) {
      continue;
    }

    selectedSources.add(item.source);
    items.push(item);
  }

  return { items, diagnostics };
}

async function sendBaleMessage(
  env: CloudflareEnv,
  message: string
): Promise<unknown> {
  const token = env.BALE_SMART_TOKEN;
  const chatId = env.BALE_GROUP_ID;

  if (!token || !chatId) {
    throw new Error(
      "BALE_SMART_TOKEN or BALE_GROUP_ID is missing"
    );
  }

  const response = await fetchText(
    `https://tapi.bale.ai/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        disable_web_page_preview: false,
      }),
    },
    10000
  );

  let data: unknown;

  try {
    data = JSON.parse(response.body);
  } catch {
    throw new Error(
      `Bale returned a non-JSON response (HTTP ${response.status})`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Bale sendMessage failed (HTTP ${response.status})`
    );
  }

  if (
    typeof data !== "object" ||
    data === null ||
    !("ok" in data) ||
    (data as { ok?: unknown }).ok !== true
  ) {
    throw new Error(
      "Bale did not confirm successful message delivery"
    );
  }

  return data;
}

function formatNewsMessage(
  items: NewsItem[],
  window: ReportWindow
): string {
  const formatter = new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const mediaCount = new Set(
    items.map((item) => item.source)
  ).size;

  const header = [
    "⚫️ ثبت احوال در رسانه‌ها",
    `📅 بازه گزارش: ${formatter.format(window.start)} تا ${formatter.format(window.end)}`,
    `🗞 تعداد رسانه‌ها: ${mediaCount}`,
    `📌 تعداد خبرها: ${items.length}`,
  ].join("\n");

  const newsList = items
    .map((item, index) =>
      [
        `${index + 1}. ${cleanNewsTitle(item.title)}`,
        `🗞 منبع: ${item.source}`,
        `🔗 ${item.link}`,
      ].join("\n")
    )
    .join("\n\n");

  return newsList ? `${header}\n\n${newsList}` : header;
}

function noCacheHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate",
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const diagnosticsOnly =
      url.searchParams.get("diagnostics") === "1";

    // window=next فقط برای پیش‌نمایش Diagnostics است.
    // این گزینه هیچ پیام بله‌ای ارسال نمی‌کند.
    const previewNextWindow =
      diagnosticsOnly &&
      url.searchParams.get("window") === "next";

    const { env } = await getCloudflareContext();
    const cloudflareEnv = env as CloudflareEnv;

    const window = getReportWindow(
      new Date(),
      previewNextWindow
    );

    const { items, diagnostics } = await getNews(window);

    const mediaCount = new Set(
      items.map((item) => item.source)
    ).size;

    const stats = {
      totalSources: RSS_SOURCES.length,
      totalFetched: diagnostics.reduce(
        (sum, item) => sum + item.rawItems,
        0
      ),
      parsedItems: diagnostics.reduce(
        (sum, item) => sum + item.parsedItems,
        0
      ),
      relevantBeforeWindow: diagnostics.reduce(
        (sum, item) => sum + item.relevantItems,
        0
      ),
      selected: items.length,
      mediaCount,
      minimumMedia: MIN_MEDIA_TO_SEND,
      maximumMedia: MAX_MEDIA_TO_SEND,
      maximumNews: MAX_NEWS,
      previewNextWindow,
      windowStart: window.start.toISOString(),
      windowEnd: window.end.toISOString(),
      noDate: diagnostics.reduce(
        (sum, item) => sum + item.missingDate,
        0
      ),
      outsideWindow: diagnostics.reduce(
        (sum, item) => sum + item.outsideWindow,
        0
      ),
      windowItems: items.length,
    };

    // Diagnostics فقط خروجی بررسی می‌دهد و ارسال انجام نمی‌دهد.
    if (diagnosticsOnly) {
      return NextResponse.json(
        {
          ok: true,
          diagnosticsOnly: true,
          stats,
          sources: diagnostics,
        },
        { headers: noCacheHeaders() }
      );
    }

    if (items.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          sent: false,
          reason: "no_relevant_news_in_window",
          stats,
          sources: diagnostics,
        },
        { headers: noCacheHeaders() }
      );
    }

    if (mediaCount < MIN_MEDIA_TO_SEND) {
      return NextResponse.json(
        {
          ok: true,
          sent: false,
          reason: "not_enough_media",
          message:
            "تعداد رسانه‌های دارای خبر مرتبط به حداقل تعیین‌شده نرسیده است.",
          stats,
          sources: diagnostics,
        },
        { headers: noCacheHeaders() }
      );
    }

    await sendBaleMessage(
      cloudflareEnv,
      formatNewsMessage(items, window)
    );

    return NextResponse.json(
      {
        ok: true,
        sent: true,
        count: items.length,
        mediaCount,
        stats,
      },
      { headers: noCacheHeaders() }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      {
        status: 500,
        headers: noCacheHeaders(),
      }
    );
  }
}

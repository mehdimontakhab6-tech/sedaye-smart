import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

const MAX_NEWS = 20;
const MIN_MEDIA_TO_SEND = 1;
const MAX_MEDIA_TO_SEND = 20;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_ITEMS_PER_FEED = 100;
const REQUEST_TIMEOUT_MS = 7000;
const MAX_BALE_MESSAGE_LENGTH = 3500;
const IRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

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
  fallbackUrls?: string[];
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
  rejectedMissingTitle: number;
  rejectedMissingLink: number;
  rejectedDomain: number;
  error?: string;
  contentType?: string;
  finalUrl?: string;
  redirected?: boolean;
  responseType?: "rss" | "html" | "unknown";
  responsePreview?: string;
  attempts?: Array<{
    url: string;
    status: number | null;
    contentType: string;
    finalUrl: string;
    redirected: boolean;
    responseType: "rss" | "html" | "unknown";
    preview: string;
    error?: string;
  }>;
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
  contentType: string;
  finalUrl: string;
  redirected: boolean;
};

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
  {
    name: "تسنیم",
    url: "https://www.tasnimnews.ir/fa/rss",
    fallbackUrls: [
      "https://www.tasnimnews.com/fa/rss/feed/0/8/0/%D9%85%D9%87%D9%85%D8%AA%D8%B1%DB%8C%D9%86-%D8%A7%D8%AE%D8%A8%D8%A7%D8%B1-%D8%AA%D8%B3%D9%86%DB%8C%D9%85",
    ],
  },
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
      (domain) =>
        hostname === domain ||
        hostname.endsWith(`.${domain}`)
    );
  } catch {
    return true;
  }
}

function isIranianNewsLink(
  url: string,
  source: SourceConfig
): boolean {
  try {
    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }

    const host = normalizeDomain(parsed.hostname);

    if (isBlockedDomain(url)) {
      return false;
    }

    const sourceUrls = [
      source.url,
      ...(source.fallbackUrls || []),
    ];

    const sourceHosts = sourceUrls
      .map((value) => {
        try {
          return normalizeDomain(new URL(value).hostname);
        } catch {
          return "";
        }
      })
      .filter(Boolean);

    const belongsToSource = sourceHosts.some(
      (sourceHost) =>
        host === sourceHost ||
        host.endsWith(`.${sourceHost}`)
    );

    return (
      host.endsWith(".ir") ||
      host === "tasnimnews.com" ||
      host.endsWith(".tasnimnews.com") ||
      belongsToSource
    );
  } catch {
    return false;
  }
}

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

function detectResponseType(
  body: string,
  contentType = ""
): "rss" | "html" | "unknown" {
  const sample = body.replace(/^\uFEFF/, "").trimStart();
  const normalizedContentType = contentType.toLowerCase();

  if (!sample) {
    return "unknown";
  }

  if (
    /^\s*(?:<!doctype\s+html\b|<html\b)/i.test(sample) ||
    /<\s*(?:head|body)\b[^>]*>/i.test(sample)
  ) {
    return "html";
  }

  if (
    /<\?xml\b/i.test(sample) ||
    /<rss\b/i.test(sample) ||
    /<feed\b/i.test(sample) ||
    /<rdf:RDF\b/i.test(sample) ||
    /<(?:item|entry)\b/i.test(sample)
  ) {
    return "rss";
  }

  if (
    normalizedContentType.includes("text/html") ||
    normalizedContentType.includes("application/xhtml")
  ) {
    return "html";
  }

  return "unknown";
}

function getResponsePreview(body: string): string {
  return body
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 350);
}

async function fetchText(
  url: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<FetchTextResult> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
        ...(init.headers || {}),
      },
    });

    const contentType =
      response.headers.get("content-type") || "";

    const contentLength = Number(
      response.headers.get("content-length") || 0
    );

    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_RESPONSE_BYTES
    ) {
      try {
        await response.body?.cancel();
      } catch {
        // لغو پاسخ در صورت بسته‌شدن stream ممکن است خطا بدهد.
      }

      throw new Error(
        `Response exceeded ${MAX_RESPONSE_BYTES} byte limit`
      );
    }

    if (!response.body) {
      return {
        status: response.status,
        ok: response.ok,
        body: "",
        contentType,
        finalUrl: response.url || url,
        redirected: response.redirected,
      };
    }

    reader = response.body.getReader();

    const decoder = new TextDecoder("utf-8");
    let body = "";
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      totalBytes += value.byteLength;

      if (totalBytes > MAX_RESPONSE_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // خطای احتمالی لغو stream نادیده گرفته می‌شود.
        }

        throw new Error(
          `Response exceeded ${MAX_RESPONSE_BYTES} byte limit`
        );
      }

      body += decoder.decode(value, { stream: true });
    }

    body += decoder.decode();

    return {
      status: response.status,
      ok: response.ok,
      body,
      contentType,
      finalUrl: response.url || url,
      redirected: response.redirected,
    };
  } finally {
    if (reader) {
      try {
        reader.releaseLock();
      } catch {
        // ممکن است stream قبلاً لغو شده باشد.
      }
    }

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

  const todayBoundary = Date.UTC(
    year,
    month,
    day,
    22,
    30,
    0
  );

  const beforeBoundary =
    hour < 22 || (hour === 22 && minute < 30);

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

function parseFeed(
  xml: string,
  source: SourceConfig,
  diagnostics?: SourceResult
): Candidate[] {
  const blocks =
    xml.match(
      /<(?:item|entry)\b[^>]*>[\s\S]*?<\/(?:item|entry)\s*>/gi
    ) || [];

  const result: Candidate[] = [];

  for (const block of blocks.slice(0, MAX_ITEMS_PER_FEED)) {
    const title =
      extractTag(block, "title") ||
      extractTag(block, "media:title");

    const link = extractLink(block);

    if (!title) {
      if (diagnostics) {
        diagnostics.rejectedMissingTitle++;
      }

      continue;
    }

    if (!link) {
      if (diagnostics) {
        diagnostics.rejectedMissingLink++;
      }

      continue;
    }

    if (!isIranianNewsLink(link, source)) {
      if (diagnostics) {
        diagnostics.rejectedDomain++;
      }

      continue;
    }

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

async function fetchFeedAttempt(
  url: string
): Promise<{
  response: FetchTextResult | null;
  responseType: "rss" | "html" | "unknown";
  attempt: NonNullable<SourceResult["attempts"]>[number];
}> {
  try {
    const response = await fetchText(url);

    const responseType = detectResponseType(
      response.body,
      response.contentType
    );

    const attempt = {
      url,
      status: response.status,
      contentType: response.contentType,
      finalUrl: response.finalUrl,
      redirected: response.redirected,
      responseType,
      preview: getResponsePreview(response.body),
      ...(!response.ok
        ? { error: `HTTP ${response.status}` }
        : {}),
    };

    return {
      response,
      responseType,
      attempt,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown fetch error";

    return {
      response: null,
      responseType: "unknown",
      attempt: {
        url,
        status: null,
        contentType: "",
        finalUrl: url,
        redirected: false,
        responseType: "unknown",
        preview: "",
        error: message,
      },
    };
  }
}

async function fetchSource(
  source: SourceConfig,
  window: ReportWindow,
  diagnosticsMode = false
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
    rejectedMissingTitle: 0,
    rejectedMissingLink: 0,
    rejectedDomain: 0,
    samples: [],
    keywordSamples: [],
    matchedSamples: [],
    nearMatchSamples: [],
    attempts: [],
  };

  try {
    const urlsToTry = [
      source.url,
      ...(source.fallbackUrls || []),
    ];

    let selectedResponse: FetchTextResult | null = null;
    let selectedResponseType: "rss" | "html" | "unknown" =
      "unknown";

    for (const attemptUrl of urlsToTry) {
      const result = await fetchFeedAttempt(attemptUrl);

      diagnostics.attempts!.push(result.attempt);

      diagnostics.status = result.response?.status ?? null;
      diagnostics.contentType =
        result.response?.contentType || "";
      diagnostics.finalUrl =
        result.response?.finalUrl || attemptUrl;
      diagnostics.redirected =
        result.response?.redirected || false;
      diagnostics.responseType = result.responseType;
      diagnostics.responsePreview = result.attempt.preview;

      if (
        result.response &&
        result.response.ok &&
        result.responseType === "rss"
      ) {
        selectedResponse = result.response;
        selectedResponseType = result.responseType;
        break;
      }
    }

    if (!selectedResponse) {
      const attempts = diagnostics.attempts || [];
      const lastAttempt = attempts[attempts.length - 1];

      if (lastAttempt?.error) {
        diagnostics.error = lastAttempt.error;
      } else if (lastAttempt?.responseType === "html") {
        diagnostics.error =
          "Expected RSS/XML but received HTML from all attempted URLs";
      } else if (
        lastAttempt?.status &&
        lastAttempt.status >= 400
      ) {
        diagnostics.error =
          `HTTP ${lastAttempt.status} from all attempted URLs`;
      } else {
        diagnostics.error =
          "No valid RSS/XML response received from source";
      }

      return { items: [], diagnostics };
    }

    const body = selectedResponse.body;

    diagnostics.status = selectedResponse.status;
    diagnostics.contentType = selectedResponse.contentType;
    diagnostics.finalUrl = selectedResponse.finalUrl;
    diagnostics.redirected = selectedResponse.redirected;
    diagnostics.responseType = selectedResponseType;
    diagnostics.responsePreview = getResponsePreview(body);

    diagnostics.rawItems =
      (body.match(/<(?:item|entry)\b/gi) || []).length;

    const candidates = parseFeed(
      body,
      source,
      diagnostics
    );

    diagnostics.parsedItems = candidates.length;

    if (diagnosticsMode) {
      diagnostics.keywordSamples =
        getKeywordSamples(candidates);

      diagnostics.nearMatchSamples =
        getNearMatchSamples(candidates);

      diagnostics.samples = candidates
        .slice(0, 5)
        .map((item) => ({
          title: item.title,
          publishedAt: item.publishedAt,
        }));
    }

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

      if (
        diagnosticsMode &&
        diagnostics.matchedSamples.length < 10
      ) {
        diagnostics.matchedSamples.push({
          title: candidate.title,
          publishedAt: candidate.publishedAt,
          reason: analysis.reason,
          matchedTerms: analysis.matchedTerms,
        });
      }

      const publishedDate = parseDate(
        candidate.publishedAt
      );

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

    return { items, diagnostics };
  } catch (error) {
    diagnostics.error =
      error instanceof Error
        ? error.message
        : "Unknown error";

    return { items: [], diagnostics };
  }
}

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
  window: ReportWindow,
  sources: SourceConfig[] = RSS_SOURCES,
  diagnosticsMode = false
): Promise<{
  items: NewsItem[];
  diagnostics: SourceResult[];
}> {
  const results = await Promise.all(
    sources.map((source) =>
      fetchSource(source, window, diagnosticsMode)
    )
  );

  const diagnostics = results.map(
    (result) => result.diagnostics
  );

  const allItems = results.flatMap(
    (result) => result.items
  );

  const sortedItems = deduplicate(allItems).sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() -
      new Date(a.publishedAt).getTime()
  );

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

function normalizeSourceKey(value: string): string {
  return normalizeText(value)
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/\.(ir|com|org|net)$/, "")
    .replace(/[^a-z0-9\u0600-\u06ff]/g, "");
}

function getSourceAliases(source: SourceConfig): string[] {
  const aliases = new Set<string>();

  aliases.add(normalizeSourceKey(source.name));

  const urls = [
    source.url,
    ...(source.fallbackUrls || []),
  ];

  for (const value of urls) {
    try {
      const hostname = new URL(value).hostname
        .toLowerCase()
        .replace(/^www\./, "");

      const withoutTld = hostname.replace(
        /\.(ir|com|org|net)$/,
        ""
      );

      aliases.add(normalizeSourceKey(hostname));
      aliases.add(normalizeSourceKey(withoutTld));

      aliases.add(
        normalizeSourceKey(
          withoutTld.replace(/news$/, "")
        )
      );
    } catch {
      // URL نامعتبر به فهرست نام‌های جایگزین اضافه نمی‌شود.
    }
  }

  return [...aliases].filter(Boolean);
}

function findSource(value: string): SourceConfig | null {
  const requested = normalizeSourceKey(value);

  if (!requested) {
    return null;
  }

  return (
    RSS_SOURCES.find((source) =>
      getSourceAliases(source).includes(requested)
    ) || null
  );
}

/**
 * ارسال پیام به Bale و بررسی پاسخ واقعی API.
 */
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
      `Bale returned non-JSON response (HTTP ${response.status}): ${response.body.slice(0, 300)}`
    );
  }

  if (!response.ok) {
    const description =
      typeof data === "object" &&
      data !== null &&
      "description" in data
        ? String((data as { description?: unknown }).description || "")
        : "";

    throw new Error(
      `Bale sendMessage failed (HTTP ${response.status}): ${description || response.body.slice(0, 300)}`
    );
  }

  if (
    typeof data !== "object" ||
    data === null ||
    !("ok" in data) ||
    (data as { ok?: unknown }).ok !== true
  ) {
    const description =
      typeof data === "object" &&
      data !== null &&
      "description" in data
        ? String((data as { description?: unknown }).description || "")
        : "";

    throw new Error(
      `Bale did not confirm successful delivery: ${description || response.body.slice(0, 300)}`
    );
  }

  return data;
}

/**
 * ساخت پیام‌های مستقل با سقف طول مشخص.
 * هر خبر به‌صورت یک بلوک کامل در یک پیام قرار می‌گیرد.
 */
function formatNewsMessages(
  items: NewsItem[],
  window: ReportWindow
): string[] {
  if (items.length === 0) {
    return [];
  }

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

  if (header.length > MAX_BALE_MESSAGE_LENGTH) {
    throw new Error(
      "Report header exceeds Bale message length limit"
    );
  }

  const messages: string[] = [];
  let currentBlocks: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    const block = [
      `${i + 1}. ${cleanNewsTitle(item.title)}`,
      `🗞 منبع: ${item.source}`,
      `🔗 ${item.link}`,
    ].join("\n");

    const candidateMessage =
      `${header}\n\n${[...currentBlocks, block].join("\n\n")}`;

    if (candidateMessage.length <= MAX_BALE_MESSAGE_LENGTH) {
      currentBlocks.push(block);
      continue;
    }

    if (currentBlocks.length > 0) {
      messages.push(
        `${header}\n\n${currentBlocks.join("\n\n")}`
      );
    }

    const singleBlockMessage = `${header}\n\n${block}`;

    if (singleBlockMessage.length > MAX_BALE_MESSAGE_LENGTH) {
      throw new Error(
        `News item ${i + 1} exceeds Bale message length limit`
      );
    }

    currentBlocks = [block];
  }

  if (currentBlocks.length > 0) {
    messages.push(
      `${header}\n\n${currentBlocks.join("\n\n")}`
    );
  }

  return messages;
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

    const previewNextWindow =
      diagnosticsOnly &&
      url.searchParams.get("window") === "next";

    const requestedSource =
      url.searchParams.get("source")?.trim() || "";

    const window = getReportWindow(
      new Date(),
      previewNextWindow
    );

    if (diagnosticsOnly && !requestedSource) {
      return NextResponse.json(
        {
          ok: true,
          diagnosticsOnly: true,
          fetched: false,
          message:
            "برای بررسی یک منبع، پارامتر source را مشخص کنید.",
          usage: [
            "?diagnostics=1&source=ایرنا",
            "?diagnostics=1&source=irna",
            "?diagnostics=1&source=tasnim",
            "?diagnostics=1&source=isna",
            "?diagnostics=1&source=mehr",
            "?diagnostics=1&source=ilna",
          ],
          stats: {
            totalSources: RSS_SOURCES.length,
            checkedSources: 0,
            previewNextWindow,
            windowStart: window.start.toISOString(),
            windowEnd: window.end.toISOString(),
            maximumResponseBytes: MAX_RESPONSE_BYTES,
            maximumItemsPerFeed: MAX_ITEMS_PER_FEED,
          },
          availableSources: RSS_SOURCES.map((source) => ({
            name: source.name,
            url: source.url,
            fallbackUrls: source.fallbackUrls || [],
          })),
        },
        { headers: noCacheHeaders() }
      );
    }

    let sourcesToCheck = RSS_SOURCES;
    let diagnosticsMode = false;

    if (diagnosticsOnly && requestedSource) {
      const selectedSource = findSource(requestedSource);

      if (!selectedSource) {
        return NextResponse.json(
          {
            ok: false,
            error: "منبع در فهرست RSS تعریف نشده است.",
            requestedSource,
            availableSources: RSS_SOURCES.map(
              (source) => source.name
            ),
          },
          {
            status: 400,
            headers: noCacheHeaders(),
          }
        );
      }

      sourcesToCheck = [selectedSource];
      diagnosticsMode = true;
    }

    const { items, diagnostics } = await getNews(
      window,
      sourcesToCheck,
      diagnosticsMode
    );

    const mediaCount = new Set(
      items.map((item) => item.source)
    ).size;

    const stats = {
      totalSources: RSS_SOURCES.length,
      checkedSources: sourcesToCheck.length,
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
      maximumResponseBytes: MAX_RESPONSE_BYTES,
      maximumItemsPerFeed: MAX_ITEMS_PER_FEED,
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
      rejectedMissingTitle: diagnostics.reduce(
        (sum, item) => sum + item.rejectedMissingTitle,
        0
      ),
      rejectedMissingLink: diagnostics.reduce(
        (sum, item) => sum + item.rejectedMissingLink,
        0
      ),
      rejectedDomain: diagnostics.reduce(
        (sum, item) => sum + item.rejectedDomain,
        0
      ),
    };

    if (diagnosticsOnly) {
      return NextResponse.json(
        {
          ok: true,
          diagnosticsOnly: true,
          fetched: true,
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

    const messages = formatNewsMessages(items, window);

    if (messages.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          sent: false,
          reason: "empty_message_list",
          stats,
        },
        { headers: noCacheHeaders() }
      );
    }

    const { env } = await getCloudflareContext();
    const cloudflareEnv = env as CloudflareEnv;

    let sentMessages = 0;

    for (let index = 0; index < messages.length; index++) {
      try {
        await sendBaleMessage(
          cloudflareEnv,
          messages[index]
        );

        sentMessages++;
      } catch (error) {
        return NextResponse.json(
          {
            ok: false,
            sent: false,
            reason: "bale_delivery_failed",
            count: items.length,
            mediaCount,
            sentMessages,
            totalMessages: messages.length,
            failedMessage: index + 1,
            error:
              error instanceof Error
                ? error.message
                : "Unknown Bale delivery error",
            stats,
          },
          {
            status: 502,
            headers: noCacheHeaders(),
          }
        );
      }
    }

    return NextResponse.json(
      {
        ok: true,
        sent: true,
        count: items.length,
        mediaCount,
        sentMessages,
        totalMessages: messages.length,
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

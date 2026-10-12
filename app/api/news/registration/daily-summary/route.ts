import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

const MAX_NEWS = 20;
const MIN_MEDIA = 1;
const REQUEST_TIMEOUT_MS = 7000;

const USER_AGENT =
  "Mozilla/5.0 (compatible; SedayeSmart/1.0; +https://sedaye-smart.mehdimontakhab6.workers.dev)";

type CloudflareEnv = {
  BALE_SMART_TOKEN?: string;
  BALE_GROUP_ID?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
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
  kind?: "rss" | "html";
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
  samples: Array<{
    title: string;
    publishedAt: string;
  }>;
};

const RSS_SOURCES: SourceConfig[] = [
  { name: "ایرنا", url: "https://www.irna.ir/rss" },
  { name: "ایسنا", url: "https://www.isna.ir/rss" },
  { name: "مهر", url: "https://www.mehrnews.com/rss" },
  { name: "ایلنا", url: "https://www.ilna.ir/rss" },
  {
    name: "باشگاه خبرنگاران جوان",
    url: "https://www.yjc.ir/fa/rss/allnews",
  },
  { name: "خبرآنلاین", url: "https://www.khabaronline.ir/rss" },
  { name: "تابناک", url: "https://www.tabnak.ir/fa/rss/allnews" },
  {
    name: "عصر ایران",
    url: "https://www.asriran.com/fa/rss/allnews",
  },
  {
    name: "همشهری آنلاین",
    url: "https://www.hamshahrionline.ir/rss",
  },
  {
    name: "جام جم آنلاین",
    url: "https://jamejamonline.ir/fa/rss/allnews",
  },
  {
    name: "میزان",
    url: "https://www.mizanonline.ir/fa/rss/allnews",
  },
  {
    name: "شبکه خبر",
    url: "https://www.iribnews.ir/fa/rss/allnews",
  },
  { name: "شانا", url: "https://www.shana.ir/rss" },
  { name: "ایکنا", url: "https://iqna.ir/fa/rss" },
  {
    name: "انتخاب",
    url: "https://www.entekhab.ir/fa/rss/allnews",
  },
  {
    name: "تسنیم",
    url: "https://www.tasnimnews.ir/fa/rss",
  },
];

const SPECIAL_SOURCES: SourceConfig[] = [
  {
    name: "تسنیم - ثبت احوال",
    url: "https://www.tasnimnews.ir/fa/keyword/4067",
    kind: "html",
  },
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
  "ثبت احوال",
  "سازمان ثبت احوال",
  "ثبت‌احوال",
  "کارت ملی",
  "کارت هوشمند ملی",
  "شناسنامه",
  "صدور شناسنامه",
  "تعویض شناسنامه",
  "گواهی ولادت",
  "گواهی فوت",
  "پایگاه اطلاعات جمعیت",
  "پایگاه جمعیتی",
  "درگاه هویت",
  "هویت ایرانیان",
  "سامانه هویتی",
  "خدمات هویتی",
  "ثبت وقایع حیاتی",
  "ثبت ولادت",
  "ثبت وفات",
  "ثبت ازدواج",
  "ثبت طلاق",
  "مدیرکل ثبت احوال",
  "رئیس سازمان ثبت احوال",
  "رییس سازمان ثبت احوال",
];

const SECONDARY_TERMS = [
  "کد ملی",
  "شماره ملی",
  "اطلاعات هویتی",
  "اسناد هویتی",
  "احراز هویت",
  "پایگاه جمعیت",
  "جمعیت کشور",
  "آمار ولادت",
  "آمار تولد",
  "آمار فوت",
  "آمار وفات",
  "آمار ازدواج",
  "آمار طلاق",
  "ولادت",
  "وفات",
  "شناسنامه المثنی",
  "شناسنامه نوزاد",
  "کارت ملی هوشمند",
];

const CONTEXT_TERMS = [
  "ثبت احوال",
  "شناسنامه",
  "کارت ملی",
  "کد ملی",
  "ولادت",
  "تولد",
  "وفات",
  "فوت",
  "ازدواج",
  "طلاق",
  "جمعیت",
  "هویت",
  "احراز هویت",
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
];

const NON_REGISTRATION_CONTEXT_TERMS = [
  "هویت بصری",
  "هویت برند",
  "هویت فرهنگی",
  "هویت تاریخی",
  "هویت سیاسی",
  "هویت ملی در سینما",
  "هویت هنری",
  "هویت معماری",
  "هویت شهری",
  "هویت باشگاه",
  "هویت تیم",
  "کارت ملی خودرو",
  "کارت شناسایی خودرو",
  "شناسایی خودرو",
  "هویت دیجیتال برند",
];

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[۰-۹]/g, (d) =>
      String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    )
    .replace(/[٠-٩]/g, (d) =>
      String("٠١٢٣٤٥٦٧٨٩".indexOf(d))
    )
    .replace(/\u200c/g, " ")
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTag(block: string, tag: string): string {
  const escaped = escapeRegExp(tag);

  const re = new RegExp(
    `<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}\\s*>`,
    "i"
  );

  const match = block.match(re);

  return match ? cleanText(match[1]) : "";
}

function extractLink(block: string): string {
  const links =
    block.match(/<link\b[^>]*\/?>/gi) || [];

  for (const tag of links) {
    const href = tag.match(
      /\bhref\s*=\s*["']([^"']+)["']/i
    );

    if (!href?.[1]) continue;

    const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/i);
    const relValue = (rel?.[1] || "").toLowerCase();

    if (relValue && relValue !== "alternate") continue;

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

function isIranianNewsLink(url: string): boolean {
  try {
    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }

    const host = normalizeDomain(parsed.hostname);

    if (isBlockedDomain(url)) return false;

    return (
      host.endsWith(".ir") ||
      host === "tasnimnews.ir" ||
      host === "tasnimnews.com"
    );
  } catch {
    return false;
  }
}

function includesAny(
  text: string,
  terms: string[]
): boolean {
  const normalized = normalizeText(text);

  return terms.some((term) =>
    normalized.includes(normalizeText(term))
  );
}


function isRelevantNews(
  title: string,
  description = ""
): boolean {
  const normalizedTitle = normalizeText(title);
  const normalizedDescription = normalizeText(description);

  if (!normalizedTitle) return false;

  if (includesAny(normalizedTitle, BLOCKED_TITLE_TERMS)) {
    return false;
  }

  const unrelatedTerms = [
    "سازمان امور مالیاتی",
    "مودیان مالیاتی",
    "هویت اقتصادی",
    "فرار مالیاتی",
    "مالیات بر ارزش افزوده",
    "اظهارنامه مالیاتی",
    "درگاه ملی خدمات مالیاتی",
    "هویت بصری",
    "هویت فرهنگی",
    "هویت تاریخی",
    "هویت سیاسی",
    "هویت برند",
    "هویت شهری",
    "هویت باشگاه",
  ];

  if (includesAny(normalizedTitle, unrelatedTerms)) {
    return false;
  }

  const directRegistrationTerms = [
    "ثبت احوال",
    "سازمان ثبت احوال",
    "ثبت‌احوال",
    "کارت ملی",
    "کارت هوشمند ملی",
    "شناسنامه",
    "صدور شناسنامه",
    "تعویض شناسنامه",
    "ثبت ولادت",
    "ثبت وفات",
    "ثبت فوت",
    "ثبت ازدواج",
    "ثبت طلاق",
    "پایگاه اطلاعات جمعیت",
    "سامانه سهیم",
    "درگاه هویت",
    "خدمات هویتی ثبت احوال",
    "رئیس سازمان ثبت احوال",
    "رییس سازمان ثبت احوال",
    "مدیرکل ثبت احوال",
  ];

  // اگر عنوان مستقیماً به ثبت احوال مربوط باشد، خبر پذیرفته می‌شود.
  if (includesAny(normalizedTitle, directRegistrationTerms)) {
    return true;
  }

  // واژه‌های عمومی مثل «جمعیت» و «هویت» به‌تنهایی کافی نیستند.
  const titleHasRegistrationContext = includesAny(
    normalizedTitle,
    [
      "ثبت احوال",
      "شناسنامه",
      "کارت ملی",
      "سامانه سهیم",
      "ثبت ولادت",
      "ثبت وفات",
      "ثبت ازدواج",
      "ثبت طلاق",
    ]
  );

  const descriptionHasDirectContext = includesAny(
    normalizedDescription,
    directRegistrationTerms
  );

  return titleHasRegistrationContext && descriptionHasDirectContext;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*",
        ...(init.headers || {}),
      },
    });
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

  const [, y, m, d, h = "0", min = "0", sec = "0"] =
    match;

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

  let year = jy - 979;
  const month = jm - 1;
  const day = jd - 1;

  let days =
    365 * year +
    Math.floor(year / 33) * 8 +
    Math.floor(((year % 33) + 3) / 4);

  const jalaliMonthDays = [
    31, 31, 31, 31, 31, 31,
    30, 30, 30, 30, 30, 29,
  ];

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
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  let gm = 0;

  while (
    gm < 12 &&
    gDays >= gregorianMonthDays[gm]
  ) {
    gDays -= gregorianMonthDays[gm];
    gm++;
  }

  if (gm >= 12) return null;

  return new Date(Date.UTC(gy, gm, gDays + 1));
}

function parseDate(value: string): Date | null {
  const input = cleanText(value);

  if (!input) return null;

  const gregorian = parseGregorianDate(input);

  if (gregorian) return gregorian;

  const normalized = normalizeText(input);

  const numericJalali = normalized.match(
    /(?:^|\D)(14\d{2})[/-](\d{1,2})[/-](\d{1,2})(?:\D|$)/
  );

  if (numericJalali) {
    return jalaliToGregorian(
      Number(numericJalali[1]),
      Number(numericJalali[2]),
      Number(numericJalali[3])
    );
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

  const textual = normalized.match(
    /(\d{1,2})\s+(فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند)\s+(14\d{2})/
  );

  if (textual) {
    return jalaliToGregorian(
      Number(textual[3]),
      months[textual[2]],
      Number(textual[1])
    );
  }

  return null;
}

function getReportWindow(
  now = new Date()
): { start: Date; end: Date } {
  // ساعت ۲۲:۳۰ ایران، برابر با ۱۹:۰۰ UTC است.
  const iranOffsetMs = 3.5 * 60 * 60 * 1000;
  const iranNow = new Date(
    now.getTime() + iranOffsetMs
  );

  const year = iranNow.getUTCFullYear();
  const month = iranNow.getUTCMonth();
  const day = iranNow.getUTCDate();
  const hour = iranNow.getUTCHours();
  const minute = iranNow.getUTCMinutes();

  let endLocal = Date.UTC(
    year,
    month,
    day,
    22,
    30,
    0
  );

  if (
    hour < 22 ||
    (hour === 22 && minute < 30)
  ) {
    endLocal = Date.UTC(
      year,
      month,
      day - 1,
      22,
      30,
      0
    );
  }

  const startLocal =
    endLocal - 24 * 60 * 60 * 1000;

  return {
    start: new Date(startLocal - iranOffsetMs),
    end: new Date(endLocal - iranOffsetMs),
  };
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

    if (!title || !link) continue;
    if (!isIranianNewsLink(link)) continue;

    result.push({
      title,
      link,
      description,
      publishedAt: published,
    });
  }

  return result;
}

function extractHtmlCandidates(
  html: string,
  baseUrl: string
): Candidate[] {
  const result: Candidate[] = [];
  const seen = new Set<string>();

  const anchors =
    html.match(/<a\b[^>]*>[\s\S]*?<\/a\s*>/gi) || [];

  for (const anchor of anchors) {
    const hrefMatch = anchor.match(
      /\bhref\s*=\s*["']([^"']+)["']/i
    );

    if (!hrefMatch?.[1]) continue;

    let link: string;

    try {
      link = new URL(
        decodeXml(hrefMatch[1]),
        baseUrl
      ).toString();
    } catch {
      continue;
    }

    if (!isIranianNewsLink(link)) continue;

    const title = cleanText(anchor);

    if (!title || title.length < 12) continue;

    const normalizedLink = link.split("#")[0];

    if (seen.has(normalizedLink)) continue;
    seen.add(normalizedLink);

    result.push({
      title,
      link: normalizedLink,
      description: "",
      publishedAt: "",
    });
  }

  return result;
}

function extractArticleDate(html: string): string {
  const metaPatterns = [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:published_time["'][^>]*>/i,
    /<meta[^>]+name=["']datePublished["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']datePublished["'][^>]*>/i,
    /<meta[^>]+property=["']og:updated_time["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  ];

  for (const pattern of metaPatterns) {
    const match = html.match(pattern);

    if (match?.[1]) return cleanText(match[1]);
  }

  const jsonDate = html.match(
    /["']datePublished["']\s*:\s*["']([^"']+)["']/i
  );

  if (jsonDate?.[1]) return cleanText(jsonDate[1]);

  const timeTag = html.match(
    /<time\b[^>]*\bdatetime=["']([^"']+)["'][^>]*>/i
  );

  if (timeTag?.[1]) return cleanText(timeTag[1]);

  const publishedText = html.match(
    /(?:تاریخ انتشار|انتشار)\s*[:：]?\s*([^<\n\r]{5,60})/i
  );

  if (publishedText?.[1]) {
    return cleanText(publishedText[1]);
  }

  return "";
}

async function fetchSpecialSource(
  source: SourceConfig,
  window: { start: Date; end: Date }
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
  };

  try {
    const response = await fetchWithTimeout(
      source.url,
      {},
      REQUEST_TIMEOUT_MS
    );

    diagnostics.status = response.status;

    if (!response.ok) {
      diagnostics.error = `HTTP ${response.status}`;
      return { items: [], diagnostics };
    }

    const html = await response.text();
    const candidates = extractHtmlCandidates(
      html,
      source.url
    );

    diagnostics.rawItems = candidates.length;
    diagnostics.parsedItems = candidates.length;

    const relevant = candidates
      .filter((item) =>
        isRelevantNews(item.title, item.description)
      )
      .slice(0, 15);

    diagnostics.relevantItems = relevant.length;

    const articleResults = await Promise.all(
      relevant.map(async (candidate) => {
        try {
          const articleResponse = await fetchWithTimeout(
            candidate.link,
            {},
            REQUEST_TIMEOUT_MS
          );

          if (!articleResponse.ok) {
            return {
              candidate,
              date: "",
              description: "",
            };
          }

          const articleHtml =
            await articleResponse.text();

          const date = extractArticleDate(articleHtml);

          const description =
            extractTag(articleHtml, "meta") ||
            "";

          return {
            candidate,
            date,
            description,
          };
        } catch {
          return {
            candidate,
            date: "",
            description: "",
          };
        }
      })
    );

    const items: NewsItem[] = [];

    for (const result of articleResults) {
      const parsedDate = parseDate(result.date);

      if (!parsedDate) {
        diagnostics.missingDate++;
        continue;
      }

      if (
        parsedDate < window.start ||
        parsedDate >= window.end
      ) {
        diagnostics.outsideWindow++;
        continue;
      }

      items.push({
        title: result.candidate.title,
        link: result.candidate.link,
        description: result.description,
        source: source.name,
        publishedAt: parsedDate.toISOString(),
      });
    }

    diagnostics.samples = articleResults
      .slice(0, 5)
      .map((result) => ({
        title: result.candidate.title,
        publishedAt: result.date,
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

async function fetchSource(
  source: SourceConfig,
  window: { start: Date; end: Date }
): Promise<{
  items: NewsItem[];
  diagnostics: SourceResult;
}> {
  if (source.kind === "html") {
    return fetchSpecialSource(source, window);
  }

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
  };

  try {
    const response = await fetchWithTimeout(source.url);

    diagnostics.status = response.status;

    if (!response.ok) {
      diagnostics.error = `HTTP ${response.status}`;
      return { items: [], diagnostics };
    }

    const body = await response.text();

    diagnostics.rawItems = (
      body.match(/<(?:item|entry)\b/gi) || []
    ).length;

    const candidates = parseFeed(body);
    diagnostics.parsedItems = candidates.length;

    const items: NewsItem[] = [];

    for (const candidate of candidates) {
      if (
        !isRelevantNews(
          candidate.title,
          candidate.description
        )
      ) {
        continue;
      }

      diagnostics.relevantItems++;

      const parsedDate = parseDate(
        candidate.publishedAt
      );

      if (!parsedDate) {
        diagnostics.missingDate++;
        continue;
      }

      if (
        parsedDate < window.start ||
        parsedDate >= window.end
      ) {
        diagnostics.outsideWindow++;
        continue;
      }

      items.push({
        title: candidate.title,
        link: candidate.link,
        description: candidate.description,
        source: source.name,
        publishedAt: parsedDate.toISOString(),
      });
    }

    diagnostics.samples = candidates
      .slice(0, 5)
      .map((item) => ({
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

function deduplicate(
  items: NewsItem[]
): NewsItem[] {
  const seen = new Set<string>();
  const result: NewsItem[] = [];

  for (const item of items) {
    const key = normalizeText(item.title).replace(
      /[^\p{L}\p{N}]+/gu,
      ""
    );

    if (!key || seen.has(key)) continue;

    seen.add(key);
    result.push(item);
  }

  return result;
}

async function getNews(
  window: { start: Date; end: Date }
): Promise<{
  items: NewsItem[];
  diagnostics: SourceResult[];
}> {
  const sources = [
    ...RSS_SOURCES,
    ...SPECIAL_SOURCES,
  ];

  const results = await Promise.all(
    sources.map((source) =>
      fetchSource(source, window)
    )
  );

  const diagnostics = results.map(
    (result) => result.diagnostics
  );

  const allItems = results.flatMap(
    (result) => result.items
  );

  const items = deduplicate(allItems)
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() -
        new Date(a.publishedAt).getTime()
    )
    .slice(0, MAX_NEWS);

  return { items, diagnostics };
}

async function sendBaleMessage(
  env: CloudflareEnv,
  text: string
): Promise<unknown> {
  const token = env.BALE_SMART_TOKEN;
  const chatId = env.BALE_GROUP_ID;

  if (!token || !chatId) {
    throw new Error(
      "BALE_SMART_TOKEN or BALE_GROUP_ID is missing"
    );
  }

  const response = await fetchWithTimeout(
    `https://tapi.bale.ai/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: false,
      }),
    },
    10000
  );

  const responseText = await response.text();

  let data: unknown;

  try {
    data = JSON.parse(responseText);
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
  window: { start: Date; end: Date }
): string {
  const formatter = new Intl.DateTimeFormat(
    "fa-IR",
    {
      timeZone: "Asia/Tehran",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }
  );

  const lines = [
    "📰 خلاصه اخبار مرتبط با ثبت احوال",
    `📅 بازه گزارش: ${formatter.format(window.start)} تا ${formatter.format(window.end)}`,
    `📌 تعداد خبرها: ${items.length}`,
    "",
  ];

  items.forEach((item, index) => {
    lines.push(
      `${index + 1}. ${item.title}`,
      `🗞 منبع: ${item.source}`,
      `🕒 ${formatter.format(
        new Date(item.publishedAt)
      )}`,
      item.link,
      ""
    );
  });

function noCacheHeaders() {
  return {
    "Cache-Control":
      "no-store, no-cache, must-revalidate",
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const diagnosticsOnly =
      url.searchParams.get("diagnostics") === "1";

    const { env } = await getCloudflareContext();
    const cloudflareEnv = env as CloudflareEnv;

    const window = getReportWindow();
    const { items, diagnostics } =
      await getNews(window);

    const stats = {
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
      mediaCount: new Set(
        items.map((item) => item.source)
      ).size,
      minimumMedia: MIN_MEDIA,
      maximumNews: MAX_NEWS,
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

    if (stats.mediaCount < MIN_MEDIA) {
      return NextResponse.json(
        {
          ok: true,
          sent: false,
          reason: "not_enough_media",
          stats,
        },
        { headers: noCacheHeaders() }
      );
    }

    const message = formatNewsMessage(
      items,
      window
    );

    await sendBaleMessage(
      cloudflareEnv,
      message
    );

    return NextResponse.json(
      {
        ok: true,
        sent: true,
        count: items.length,
        mediaCount: stats.mediaCount,
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

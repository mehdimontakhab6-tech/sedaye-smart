import { NextResponse } from "next/server";

const MAX_NEWS = 20;
const MIN_MEDIA = 1;
const REQUEST_TIMEOUT_MS = 5000;

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

type SourceResult = {
  source: string;
  domain: string;
  url: string;
  httpStatus: number | null;
  rawItems: number;
  parsedItems: number;
  relevantItems: number;
  windowItems: number;
  error: string | null;
};

/*
 * رسانه‌های معتبر ایرانی
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
  "icana.ir": "خانه ملت",
  "shana.ir": "شانا",
  "iqna.ir": "ایکنا",
  "brna.ir": "برنا",
  "entekhab.ir": "انتخاب",
  "fararu.com": "فرارو",
  "aftabnews.ir": "آفتاب نیوز",
  "etemaadonline.com": "اعتماد آنلاین",
  "sharghdaily.com": "شرق",
  "hammihanonline.ir": "هم‌میهن",
  "eghtesadonline.com": "اقتصاد آنلاین",
};

/*
 * منابع RSS
 *
 * تسنیم دو مسیر دارد تا در صورت مشکل یکی،
 * مسیر دوم قابل استفاده باشد.
 */
const RSS_SOURCES = [
  {
    url: "https://www.mehrnews.com/rss",
    domain: "mehrnews.com",
    source: "مهر",
  },
  {
    url: "https://www.isna.ir/rss",
    domain: "isna.ir",
    source: "ایسنا",
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
];

/*
 * عبارات قطعی ثبت احوال
 */
const STRONG_REGISTRATION_TERMS = [
  "ثبت احوال",
  "سازمان ثبت احوال",
  "سازمان ثبت احوال کشور",
  "ثبت احوال کشور",
  "کارت هوشمند ملی",
  "سامانه سهیم",
  "انحصار وراثت",
  "گواهی فوت",
  "گواهی ولادت",
  "گواهی حصر وراثت",
  "تغییر نام خانوادگی",
];

/*
 * عبارات اختصاصی‌تر
 */
const SECONDARY_REGISTRATION_TERMS = [
  "کارت ملی",
  "شناسنامه",
  "مدارک هویتی",
  "مدرک هویتی",
  "خدمات هویتی",
  "اطلاعات هویتی",
  "هویت ایرانی",
  "خدمات ثبت احوال",
  "داده‌های ثبت احوال",
  "داده های ثبت احوال",
  "آمار ثبت احوال",
  "مرکز رصد جمعیت",
  "رصد جمعیت کشور",
  "تغییر نام",
];

/*
 * واژه‌های عمومی
 */
const CONTEXT_ONLY_TERMS = [
  "ولادت",
  "وفات",
  "ازدواج",
  "طلاق",
  "جمعیت",
  "هویتی",
  "تولد",
  "فوت",
  "نام",
];

/*
 * زمینه ثبت احوال
 */
const REGISTRATION_CONTEXT_TERMS = [
  "ثبت احوال",
  "سازمان ثبت احوال",
  "سازمان ثبت احوال کشور",
  "ثبت احوال کشور",
  "مرکز رصد جمعیت",
  "رصد جمعیت",
  "سامانه سهیم",
  "کارت هوشمند ملی",
  "کارت ملی",
  "شناسنامه",
  "مدارک هویتی",
  "مدرک هویتی",
  "خدمات هویتی",
  "اطلاعات هویتی",
  "هویت ایرانی",
  "گواهی ولادت",
  "گواهی فوت",
  "انحصار وراثت",
  "حصر وراثت",
];

/*
 * دامنه‌های خارجی ممنوع
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
  "abcnews.go.com",
  "cbsnews.com",
  "nbcnews.com",
  "yahoo.com",
  "google.com",
]);

function normalizePersianText(value: string): string {
  return value
    .replace(/ي/g, "ی")
    .replace(/ى/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ۀ/g, "ه")
    .replace(/ة/g, "ه")
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeDomain(value: string): string {
  return value
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split(":")[0]
    .trim();
}

function isTrustedIranianMedia(domain: string): boolean {
  const normalized = normalizeDomain(domain);

  if (!normalized) {
    return false;
  }

  if (BLOCKED_DOMAINS.has(normalized)) {
    return false;
  }

  if (TRUSTED_MEDIA[normalized]) {
    return true;
  }

  return Object.keys(TRUSTED_MEDIA).some(
    (trusted) =>
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

  const trusted = Object.keys(TRUSTED_MEDIA).find(
    (item) =>
      normalized.endsWith("." + item)
  );

  if (trusted) {
    return TRUSTED_MEDIA[trusted];
  }

  return source?.trim() || normalized;
}

function cleanText(value: string): string {
  return value
    .replace(
      /<script[\s\S]*?<\/script>/gi,
      " "
    )
    .replace(
      /<style[\s\S]*?<\/style>/gi,
      " "
    )
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[/gi, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(
      /&#(\d+);/g,
      (_, code) =>
        String.fromCharCode(
          Number(code)
        )
    )
    .replace(
      /&#x([0-9a-f]+);/gi,
      (_, code) =>
        String.fromCharCode(
          parseInt(code, 16)
        )
    );
}

function extractTag(
  xml: string,
  tag: string
): string {
  const escapedTag =
    tag.replace(/:/g, "\\:");

  const regex = new RegExp(
    `<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTag}>`,
    "i"
  );

  const match =
    xml.match(regex);

  if (!match) {
    return "";
  }

  return decodeXml(
    cleanText(match[1])
  );
}

function extractLink(xml: string): string {
  const normalLink =
    extractTag(xml, "link");

  if (
    normalLink &&
    /^https?:\/\//i.test(
      normalLink
    )
  ) {
    return normalLink.trim();
  }

  const hrefRegex =
    /<link[^>]+href=["']([^"']+)["'][^>]*>/i;

  const hrefMatch =
    xml.match(hrefRegex);

  if (hrefMatch) {
    return decodeXml(
      hrefMatch[1].trim()
    );
  }

  return "";
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

  const results: Candidate[] = [];

  for (const block of blocks) {
    const title =
      extractTag(
        block,
        "title"
      );

    const link =
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

    if (!title || !link) {
      continue;
    }

    let domain =
      sourceDomain;

    try {
      const linkDomain =
        normalizeDomain(
          new URL(
            link
          ).hostname
        );

      if (
        isTrustedIranianMedia(
          linkDomain
        )
      ) {
        domain =
          linkDomain;
      }
    } catch {
      // دامنه منبع حفظ می‌شود
    }

    if (
      !isTrustedIranianMedia(
        domain
      )
    ) {
      continue;
    }

    results.push({
      title:
        cleanText(title),

      url:
        link.trim(),

      source:
        getMediaName(
          domain,
          sourceName
        ),

      domain:
        normalizeDomain(
          domain
        ),

      publishedAt:
        published || undefined,

      description:
        cleanText(
          description
        ),
    });
  }

  return {
    items: results,
    rawItems: blocks.length,
  };
}

function isRelevantNews(
  title: string,
  description = ""
): boolean {
  const normalizedTitle =
    normalizePersianText(
      title
    );

  const normalizedDescription =
    normalizePersianText(
      description
    );

  const fullText =
    `${normalizedTitle} ${normalizedDescription}`;

  /*
   * عنوان مستقیماً ثبت احوال را دارد.
   */
  if (
    STRONG_REGISTRATION_TERMS.some(
      (term) =>
        normalizedTitle.includes(
          normalizePersianText(
            term
          )
        )
    )
  ) {
    return true;
  }

  /*
   * موضوعات اختصاصی ثبت احوال
   */
  const hasSecondary =
    SECONDARY_REGISTRATION_TERMS.some(
      (term) =>
        normalizedTitle.includes(
          normalizePersianText(
            term
          )
        )
    );

  if (hasSecondary) {
    const clearlyUnrelated = [
      "دلار",
      "ارز",
      "فروش خودرو",
      "خرید خودرو",
      "وام",
      "بانک",
      "سهام",
      "بورس",
      "قیمت طلا",
      "قیمت سکه",
      "قیمت مسکن",
      "سوخت",
      "بنزین",
      "تصادف",
      "فوتبال",
      "ورزش",
      "هواشناسی",
    ];

    if (
      clearlyUnrelated.some(
        (term) =>
          normalizedTitle.includes(
            normalizePersianText(
              term
            )
          )
      )
    ) {
      return false;
    }

    return true;
  }

  /*
   * واژه عمومی بدون زمینه ثبت احوال رد می‌شود.
   */
  const hasContext =
    REGISTRATION_CONTEXT_TERMS.some(
      (term) =>
        fullText.includes(
          normalizePersianText(
            term
          )
        )
    );

  if (!hasContext) {
    return false;
  }

  const hasGeneric =
    CONTEXT_ONLY_TERMS.some(
      (term) =>
        normalizedTitle.includes(
          normalizePersianText(
            term
          )
        ) ||
        normalizedDescription.includes(
          normalizePersianText(
            term
          )
        )
    );

  if (!hasGeneric) {
    return false;
  }

  /*
   * اگر موضوع فقط در توضیحات آمده،
   * باید عبارت مشخص ثبت احوال نیز وجود داشته باشد.
   */
  const descriptionHasRegistration =
    STRONG_REGISTRATION_TERMS.some(
      (term) =>
        normalizedDescription.includes(
          normalizePersianText(
            term
          )
        )
    ) ||
    SECONDARY_REGISTRATION_TERMS.some(
      (term) =>
        normalizedDescription.includes(
          normalizePersianText(
            term
          )
        )
    );

  if (!descriptionHasRegistration) {
    return false;
  }

  const clearlyUnrelatedTitle = [
    "تصادف",
    "زلزله",
    "سیل",
    "آتش‌سوزی",
    "فوتبال",
    "والیبال",
    "بسکتبال",
    "قیمت دلار",
    "قیمت طلا",
    "قیمت سکه",
    "بورس",
    "بازار خودرو",
    "خودرو",
    "پمپ بنزین",
    "سوختگیری",
  ];

  return !clearlyUnrelatedTitle.some(
    (term) =>
      normalizedTitle.includes(
        normalizePersianText(
          term
        )
      )
  );
}

/*
 * تاریخ مقاوم‌تر
 */
function parseDate(
  value?: string
): Date | null {
  if (!value) {
    return null;
  }

  const normalized =
    value.trim();

  if (!normalized) {
    return null;
  }

  /*
   * ISO / RFC / معمولی
   */
  const direct =
    new Date(
      normalized
    );

  if (
    !Number.isNaN(
      direct.getTime()
    )
  ) {
    return direct;
  }

  /*
   * تبدیل اعداد فارسی
   */
  const western =
    normalized
      .replace(
        /[۰-۹]/g,
        (d) =>
          String(
            "۰۱۲۳۴۵۶۷۸۹".indexOf(
              d
            )
          )
      )
      .replace(
        /[٠-٩]/g,
        (d) =>
          String(
            "٠١٢٣٤٥٦٧٨٩".indexOf(
              d
            )
          )
      );

  const second =
    new Date(
      western
    );

  if (
    !Number.isNaN(
      second.getTime()
    )
  ) {
    return second;
  }

  return null;
}

function getReportWindow() {
  const now =
    new Date();

  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Asia/Tehran",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",

        hour:
          "2-digit",

        minute:
          "2-digit",

        second:
          "2-digit",

        hour12:
          false,
      }
    ).formatToParts(
      now
    );

  const getPart =
    (type: string) =>
      Number(
        parts.find(
          (item) =>
            item.type ===
            type
        )?.value || 0
      );

  const year =
    getPart("year");

  const month =
    getPart("month");

  const day =
    getPart("day");

  const hour =
    getPart("hour");

  const minute =
    getPart("minute");

  /*
   * 22:30 تهران = 19:00 UTC
   */
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

  /*
   * اگر هنوز به 22:30 امروز نرسیده‌ایم،
   * آخرین پایان کامل، روز قبل است.
   */
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

  const formatTehran =
    (date: Date) =>
      new Intl.DateTimeFormat(
        "fa-IR-u-ca-persian",
        {
          timeZone:
            "Asia/Tehran",

          year:
            "numeric",

          month:
            "2-digit",

          day:
            "2-digit",

          hour:
            "2-digit",

          minute:
            "2-digit",

          second:
            "2-digit",

          hour12:
            false,
        }
      ).format(
        date
      );

  return {
    start,
    end,
    startTehran:
      formatTehran(
        start
      ),
    endTehran:
      formatTehran(
        end
      ),
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
    time >=
      start.getTime() &&
    time <
      end.getTime()
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

  for (
    const item of items
  ) {
    const key =
      normalizeTitle(
        item.title
      );

    if (!key) {
      continue;
    }

    if (
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);

    result.push(
      item
    );
  }

  return result;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs =
    REQUEST_TIMEOUT_MS
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
    clearTimeout(
      timer
    );
  }
}

async function fetchSource(
  source: {
    url: string;
    domain: string;
    source: string;
  },
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
              "Mozilla/5.0 (compatible; SedayeSmart/2.0)",

            Accept:
              "application/rss+xml, application/xml, text/xml, */*",
          },

          cache:
            "no-store",
        }
      );

    diagnostics.httpStatus =
      response.status;

    if (!response.ok) {
      diagnostics.error =
        `HTTP ${response.status}`;

      return {
        candidates: [],
        diagnostics,
      };
    }

    const xml =
      await response.text();

    if (
      !xml ||
      xml.length < 50
    ) {
      diagnostics.error =
        "empty_or_invalid_response";

      return {
        candidates: [],
        diagnostics,
      };
    }

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
        windowItems,

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
): Promise<{
  news: NewsItem[];
  diagnostics: SourceResult[];
}> {
  const responses =
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

  const candidates:
    Candidate[] = [];

  const diagnostics:
    SourceResult[] = [];

  for (
    const result of responses
  ) {
    candidates.push(
      ...result.candidates
    );

    diagnostics.push(
      result.diagnostics
    );
  }

  const filtered =
    candidates
      .filter(
        (item) =>
          isTrustedIranianMedia(
            item.domain
          )
      )
      .filter(
        (item) =>
          isRelevantNews(
            item.title,
            item.description
          )
      )
      .map(
        (item) => {
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
        }
      )
      .filter(
        (
          item
        ): item is NewsItem =>
          item !== null &&
          !!item.title &&
          !!item.url &&
          !!item.publishedAt
      );

  filtered.sort(
    (a, b) =>
      new Date(
        b.publishedAt
      ).getTime() -
      new Date(
        a.publishedAt
      ).getTime()
  );

  const unique =
    dedupeNews(
      filtered
    );

  return {
    news:
      unique.slice(
        0,
        MAX_NEWS
      ),

    diagnostics,
  };
}

async function sendBaleMessage(
  text: string
) {
  const token =
    process.env
      .BALE_SMART_TOKEN;

  const chatId =
    process.env
      .BALE_GROUP_ID;

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
        method:
          "POST",

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

async function getScheduleState() {
  const supabaseUrl =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL;

  const serviceKey =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    !serviceKey
  ) {
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
          headers: {
            apikey:
              serviceKey,

            Authorization:
              `Bearer ${serviceKey}`,
          },

          cache:
            "no-store",
        }
      );

    if (!response.ok) {
      return true;
    }

    const rows =
      await response.json();

    if (
      !Array.isArray(
        rows
      ) ||
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
  } catch {
    return true;
  }
}

function formatNewsMessage(
  news: NewsItem[],
  sentAt: Date,
  startTehran: string,
  endTehran: string
): string {
  const time =
    new Intl.DateTimeFormat(
      "fa-IR",
      {
        timeZone:
          "Asia/Tehran",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",

        hour:
          "2-digit",

        minute:
          "2-digit",

        second:
          "2-digit",

        hour12:
          false,
      }
    ).format(
      sentAt
    );

  const lines:
    string[] = [];

  lines.push(
    "📰 خلاصه اخبار ثبت احوال در رسانه‌های ایران"
  );

  lines.push(
    `🕐 زمان ارسال: ${time}`
  );

  lines.push(
    `📅 بازه بررسی: ${startTehran} تا ${endTehran}`
  );

  lines.push(
    `📊 تعداد اخبار: ${news.length}`
  );

  lines.push("");

  news.forEach(
    (item, index) => {
      lines.push(
        `${index + 1}. ${item.title}`
      );

      lines.push(
        `📰 منبع: ${item.source}`
      );

      lines.push(
        `🔗 ${item.url}`
      );

      lines.push("");
    }
  );

  lines.push(
    "🇮🇷 منابع فقط از رسانه‌های معتبر داخل ایران انتخاب شده‌اند."
  );

  return lines.join(
    "\n"
  );
}

export async function GET(
  request: Request
) {
  const startedAt =
    Date.now();

  try {
    const scheduleEnabled =
      await getScheduleState();

    if (
      !scheduleEnabled
    ) {
      return NextResponse.json({
        ok:
          true,

        cancelled:
          true,

        sent:
          false,

        reason:
          "schedule_news_disabled",

        runtime_ms:
          Date.now() -
          startedAt,
      });
    }

    const {
      start,
      end,
      startTehran,
      endTehran,
    } =
      getReportWindow();

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
     * اگر خبر مرتبط نداریم:
     * هیچ پیام بله‌ای ارسال نمی‌شود.
     */
    if (
      news.length === 0 ||
      mediaSet.size <
        MIN_MEDIA
    ) {
      return NextResponse.json({
        ok:
          true,

        cancelled:
          false,

        sent:
          false,

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
            0,

          mediaCount:
            mediaSet.size,

          minimumMedia:
            MIN_MEDIA,

          maximumNews:
            MAX_NEWS,
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
      });
    }

    const message =
      formatNewsMessage(
        news,
        new Date(),
        startTehran,
        endTehran
      );

    const bale =
      await sendBaleMessage(
        message
      );

    const actualSentAt =
      new Date();

    const sentAtTehran =
      new Intl.DateTimeFormat(
        "fa-IR",
        {
          timeZone:
            "Asia/Tehran",

          year:
            "numeric",

          month:
            "2-digit",

          day:
            "2-digit",

          hour:
            "2-digit",

          minute:
            "2-digit",

          second:
            "2-digit",

          hour12:
            false,
        }
      ).format(
        actualSentAt
      );

    return NextResponse.json({
      ok:
        true,

      cancelled:
        false,

      sent:
        true,

      sent_at:
        actualSentAt.toISOString(),

      sent_at_tehran:
        sentAtTehran,

      bale_status:
        200,

      bale,

      news: {
        totalFetched:
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
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok:
          false,

        sent:
          false,

        error:
          error instanceof Error
            ? error.message
            : String(error),

        runtime_ms:
          Date.now() -
          startedAt,
      },
      {
        status:
          500,
      }
    );
  }
    }

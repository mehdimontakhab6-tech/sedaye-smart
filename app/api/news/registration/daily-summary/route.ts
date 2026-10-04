import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

/*
============================================================
ثبت احوال در رسانه‌ها
============================================================

قوانین:

1. بازه گزارش دقیقاً 22:30 تا 22:30 به وقت تهران است.
2. حداقل رسانه معتبر: 1
3. حداکثر رسانه مستقل: 20
4. حداکثر خبر منتخب: 20
5. خبر باید واقعاً مرتبط با ثبت احوال باشد.
6. خبرهای تکراری حذف می‌شوند.
7. اگر حداقل 1 رسانه معتبر پیدا شود، گزارش ارسال می‌شود.
8. اگر هیچ رسانه معتبر و خبر مرتبطی پیدا نشود، هیچ پیام
   «0 خبر» به گروه ارسال نمی‌شود.
============================================================
*/

const TIME_ZONE = "Asia/Tehran";
const TEHRAN_OFFSET = "+03:30";

const REPORT_HOUR = 22;
const REPORT_MINUTE = 30;

const MIN_MEDIA = 1;
const MAX_MEDIA = 20;
const MAX_NEWS = 20;

const REQUEST_TIMEOUT_MS = 12000;

/* ============================================================
   رسانه‌های معتبر
   ============================================================ */

const TRUSTED_MEDIA: Record<string, string> = {
  "irna.ir": "ایرنا",
  "isna.ir": "ایسنا",
  "mehrnews.com": "مهر",
  "tasnimnews.com": "تسنیم",
  "tasnimnews.ir": "تسنیم",
  "ilna.ir": "ایلنا",
  "farsnews.ir": "فارس",
  "farsnews.com": "فارس",
  "yjc.ir": "باشگاه خبرنگاران جوان",
  "iribnews.ir": "صداوسیما",
  "hamshahrionline.ir": "همشهری",
  "khabaronline.ir": "خبرآنلاین",
  "tabnak.ir": "تابناک",
  "borna.news": "برنا",
  "ana.ir": "آنا",
  "imna.ir": "ایمنا",
  "shafaqna.com": "شفقنا",
  "iqna.ir": "ایکنا",
  "snn.ir": "دانشجو",
  "mizanonline.ir": "میزان",
  "dana.ir": "دانا",
  "rokna.net": "رکنا",
  "donya-e-eqtesad.com": "دنیای اقتصاد",
  "iran-newspaper.com": "ایران",
  "ettelaat.com": "اطلاعات",
  "khabarfoori.com": "خبرفوری",
  "asriran.com": "عصر ایران",
  "aftabnews.ir": "آفتاب‌نیوز",
};

/* ============================================================
   جست‌وجوهای مرتبط با ثبت احوال
   ============================================================ */

const SEARCH_QUERIES = [
  '"ثبت احوال" when:2d',
  '"سازمان ثبت احوال" when:2d',
  '"رئیس سازمان ثبت احوال" when:2d',
  '"رییس سازمان ثبت احوال" when:2d',
  '"ثبت احوال کشور" when:2d',
  '"اداره ثبت احوال" when:2d',
  '"اداره کل ثبت احوال" when:2d',
  '"کارت ملی" "ثبت احوال" when:2d',
  '"شناسنامه" "ثبت احوال" when:2d',
  '"هویت دیجیتال" "ثبت احوال" when:2d',
  '"خدمات هویتی" "ثبت احوال" when:2d',
  '"سامانه سهیم" "ثبت احوال" when:2d',
  '"سامانه هدا" "ثبت احوال" when:2d',
  '"انحصار وراثت" "ثبت احوال" when:2d',
  '"پایگاه خانوار" "ثبت احوال" when:2d',
  '"آمار جمعیتی" "ثبت احوال" when:2d',
  '"ثبت ولادت" "ثبت احوال" when:2d',
  '"ثبت فوت" "ثبت احوال" when:2d',
  '"ثبت ازدواج" "ثبت احوال" when:2d',
  '"ثبت طلاق" "ثبت احوال" when:2d',
  '"تغییر نام" "ثبت احوال" when:2d',
  '"نام خانوادگی" "ثبت احوال" when:2d',
];

/* ============================================================
   کلمات مرتبط
   ============================================================ */

const STRONG_KEYWORDS = [
  "سازمان ثبت احوال",
  "ثبت احوال کشور",
  "ثبت احوال",
  "رئیس سازمان ثبت احوال",
  "رییس سازمان ثبت احوال",
  "مدیرکل ثبت احوال",
  "اداره کل ثبت احوال",
  "اداره ثبت احوال",
  "سامانه سهیم",
  "سامانه هدا",
  "هویت دیجیتال ایرانیان",
  "پایگاه اطلاعات جمعیت",
  "پایگاه خانوار",
  "ثبت وقایع حیاتی",
];

const RELATED_KEYWORDS = [
  "کارت هوشمند ملی",
  "کارت ملی",
  "شناسنامه",
  "شناسنامه المثنی",
  "صدور شناسنامه",
  "تعویض شناسنامه",
  "احراز هویت",
  "خدمات هویتی",
  "خدمات الکترونیکی ثبت احوال",
  "خدمات غیرحضوری ثبت احوال",
  "انحصار وراثت",
  "گواهی تجرد",
  "تغییر نام",
  "تغییر نام خانوادگی",
  "نام خانوادگی",
  "اطلاعات خانوار",
  "آمار جمعیتی",
  "جمعیت کشور",
  "ولادت",
  "ثبت ولادت",
  "فوت",
  "ثبت فوت",
  "ازدواج",
  "ثبت ازدواج",
  "طلاق",
  "ثبت طلاق",
  "ایرانیان خارج از کشور",
  "اسناد هویتی",
];

/* ============================================================
   نوع خبر
   ============================================================ */

type NewsItem = {
  title: string;
  description: string;
  link: string;
  publishedAt: string;
  sourceDomain: string;
  sourceName: string;
  score: number;
};

/* ============================================================
   نرمال‌سازی فارسی
   ============================================================ */

function normalizeText(value: string): string {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/gi, " ")
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

/* ============================================================
   Decode HTML
   ============================================================ */

function decodeHtml(value: string): string {
  return String(value || "")
    .replace(/<!\[CDATA\[/gi, "")
    .replace(/\]\]>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n)
        ? String.fromCharCode(n)
        : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      const n = parseInt(code, 16);
      return Number.isFinite(n)
        ? String.fromCharCode(n)
        : "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

/* ============================================================
   استخراج تگ XML
   ============================================================ */

function getXmlTag(
  block: string,
  tag: string
): string {
  const escapedTag =
    tag.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const regex = new RegExp(
    `<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTag}>`,
    "i"
  );

  const match =
    block.match(regex);

  return match
    ? decodeHtml(match[1])
    : "";
}

/* ============================================================
   استخراج لینک خبر
   ============================================================ */

function getItemLink(
  block: string
): string {
  const link =
    getXmlTag(
      block,
      "link"
    );

  if (link) {
    return link.trim();
  }

  const hrefMatch =
    block.match(
      /<link[^>]+href=["']([^"']+)["']/i
    );

  return (
    hrefMatch?.[1]?.trim() ||
    ""
  );
}

/* ============================================================
   استخراج دامنه
   ============================================================ */

function getHostname(
  url: string
): string {
  try {
    const parsed =
      new URL(url);

    return parsed.hostname
      .toLowerCase()
      .replace(
        /^www\./,
        ""
      );
  } catch {
    return "";
  }
}

/* ============================================================
   تشخیص رسانه معتبر
   ============================================================ */

function getTrustedSource(
  url: string
): {
  domain: string;
  name: string;
} | null {
  const hostname =
    getHostname(url);

  if (!hostname) {
    return null;
  }

  for (
    const [domain, name]
    of Object.entries(
      TRUSTED_MEDIA
    )
  ) {
    if (
      hostname === domain ||
      hostname.endsWith(
        `.${domain}`
      )
    ) {
      return {
        domain,
        name,
      };
    }
  }

  return null;
}

/* ============================================================
   زمان تهران
   ============================================================ */

function getTehranParts(
  date = new Date()
) {
  const formatter =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }
    );

  const parts =
    formatter.formatToParts(
      date
    );

  const result:
    Record<string, number> = {};

  for (
    const part of parts
  ) {
    if (
      part.type ===
      "literal"
    ) {
      continue;
    }

    result[part.type] =
      Number(
        part.value
      );
  }

  return {
    year: result.year,
    month: result.month,
    day: result.day,
    hour: result.hour,
    minute: result.minute,
    second: result.second,
  };
}

/* ============================================================
   بازه دقیق گزارش
   ============================================================ */

function getReportWindow(
  now = new Date()
) {
  const parts =
    getTehranParts(now);

  const todayAnchorText =
    `${String(parts.year).padStart(4, "0")}-` +
    `${String(parts.month).padStart(2, "0")}-` +
    `${String(parts.day).padStart(2, "0")}T` +
    `${String(REPORT_HOUR).padStart(2, "0")}:` +
    `${String(REPORT_MINUTE).padStart(2, "0")}:00` +
    TEHRAN_OFFSET;

  let end =
    new Date(
      todayAnchorText
    );

  /*
    اگر قبل از 22:30 باشیم،
    آخرین بازه کامل 22:30 روز قبل
    تا 22:30 روز قبل است.
  */

  if (
    now.getTime() <
    end.getTime()
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

  return {
    start,
    end,
    startIso:
      start.toISOString(),
    endIso:
      end.toISOString(),
  };
}

/* ============================================================
   نمایش تاریخ و زمان تهران
   ============================================================ */

function formatTehranDateTime(
  date: Date
): string {
  return new Intl.DateTimeFormat(
    "fa-IR",
    {
      timeZone:
        TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }
  ).format(date);
}

/* ============================================================
   امتیاز ارتباط خبر با ثبت احوال
   ============================================================ */

function calculateRelevance(
  title: string,
  description: string
): number {
  const text =
    normalizeText(
      `${title} ${description}`
    );

  let score = 0;

  for (
    const keyword
    of STRONG_KEYWORDS
  ) {
    if (
      text.includes(
        normalizeText(
          keyword
        )
      )
    ) {
      score += 8;
    }
  }

  for (
    const keyword
    of RELATED_KEYWORDS
  ) {
    if (
      text.includes(
        normalizeText(
          keyword
        )
      )
    ) {
      score += 3;
    }
  }

  const hasStrong =
    STRONG_KEYWORDS.some(
      (keyword) =>
        text.includes(
          normalizeText(
            keyword
          )
        )
    );

  const relatedCount =
    RELATED_KEYWORDS.filter(
      (keyword) =>
        text.includes(
          normalizeText(
            keyword
          )
        )
    ).length;

  /*
    یک کلمه عمومی به تنهایی
    برای قبول خبر کافی نیست.
  */

  if (
    !hasStrong &&
    relatedCount < 2
  ) {
    return 0;
  }

  return score;
}

/* ============================================================
   بررسی بازه انتشار
   ============================================================ */

function isInsideReportWindow(
  publishedAt: string,
  window: ReturnType<
    typeof getReportWindow
  >
): boolean {
  const timestamp =
    Date.parse(
      publishedAt
    );

  if (
    !Number.isFinite(
      timestamp
    )
  ) {
    return false;
  }

  return (
    timestamp >=
      window.start.getTime() &&
    timestamp <
      window.end.getTime()
  );
}

/* ============================================================
   استخراج source از RSS
   ============================================================ */

function getSourceFromRss(
  block: string
): string {
  const sourceMatch =
    block.match(
      /<source\b[^>]*url=["']([^"']+)["'][^>]*>/i
    );

  return (
    sourceMatch?.[1]
      ?.trim() || ""
  );
}

/* ============================================================
   پارس RSS
   ============================================================ */

function parseRss(
  xml: string
): NewsItem[] {
  const items:
    NewsItem[] = [];

  const blocks =
    xml.match(
      /<item\b[\s\S]*?<\/item>/gi
    ) || [];

  for (
    const block
    of blocks
  ) {
    const title =
      getXmlTag(
        block,
        "title"
      );

    const description =
      getXmlTag(
        block,
        "description"
      ) ||
      getXmlTag(
        block,
        "content:encoded"
      );

    const link =
      getItemLink(
        block
      );

    const publishedAt =
      getXmlTag(
        block,
        "pubDate"
      ) ||
      getXmlTag(
        block,
        "published"
      ) ||
      getXmlTag(
        block,
        "updated"
      );

    if (
      !title ||
      !link ||
      !publishedAt
    ) {
      continue;
    }

    /*
      Google News معمولاً لینک را
      به news.google.com می‌دهد.
      بنابراین رسانه را از source
      استخراج می‌کنیم.
    */

    const sourceUrl =
      getSourceFromRss(
        block
      );

    let source =
      getTrustedSource(
        sourceUrl
      );

    /*
      اگر source وجود نداشت،
      خود لینک را نیز امتحان می‌کنیم.
    */

    if (!source) {
      source =
        getTrustedSource(
          link
        );
    }

    if (!source) {
      continue;
    }

    const score =
      calculateRelevance(
        title,
        description
      );

    if (
      score <= 0
    ) {
      continue;
    }

    items.push({
      title,
      description,
      link,
      publishedAt,
      sourceDomain:
        source.domain,
      sourceName:
        source.name,
      score,
    });
  }

  return items;
}

/* ============================================================
   Fetch با Timeout
   ============================================================ */

async function fetchWithTimeout(
  url: string
): Promise<Response> {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      REQUEST_TIMEOUT_MS
    );

  try {
    return await fetch(
      url,
      {
        method: "GET",
        signal:
          controller.signal,
        headers: {
          Accept:
            "application/rss+xml, application/xml, text/xml, */*",
          "User-Agent":
            "sedaye-smart-news-bot/1.0",
        },
        cache:
          "no-store",
      }
    );
  } finally {
    clearTimeout(
      timer
    );
  }
}

/* ============================================================
   Google News RSS
   ============================================================ */

async function searchGoogleNews(
  query: string
): Promise<string> {
  const url =
    `https://news.google.com/rss/search?` +
    `q=${encodeURIComponent(
      query
    )}` +
    `&hl=fa&gl=IR&ceid=IR:fa`;

  const response =
    await fetchWithTimeout(
      url
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `Google News HTTP ${response.status}`
    );
  }

  return await response.text();
}

/* ============================================================
   حذف خبرهای تکراری
   ============================================================ */

function normalizeTitle(
  title: string
): string {
  return normalizeText(
    title
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

function deduplicateNews(
  items: NewsItem[]
): NewsItem[] {
  const seenTitles =
    new Set<string>();

  const seenLinks =
    new Set<string>();

  const result:
    NewsItem[] = [];

  for (
    const item
    of items
  ) {
    const titleKey =
      normalizeTitle(
        item.title
      );

    const linkKey =
      item.link
        .split("#")[0]
        .trim();

    if (
      seenTitles.has(
        titleKey
      ) ||
      seenLinks.has(
        linkKey
      )
    ) {
      continue;
    }

    seenTitles.add(
      titleKey
    );

    seenLinks.add(
      linkKey
    );

    result.push(item);
  }

  return result;
}

/* ============================================================
   انتخاب حداکثر 20 رسانه مستقل
   ============================================================ */

function selectNews(
  items: NewsItem[]
): NewsItem[] {
  const sorted =
    [...items].sort(
      (a, b) => {
        const scoreDifference =
          b.score -
          a.score;

        if (
          scoreDifference !==
          0
        ) {
          return scoreDifference;
        }

        return (
          Date.parse(
            b.publishedAt
          ) -
          Date.parse(
            a.publishedAt
          )
        );
      }
    );

  const usedMedia =
    new Set<string>();

  const selected:
    NewsItem[] = [];

  /*
    مرحله اول:
    اولویت با یک خبر از هر رسانه
    برای افزایش تنوع منابع.
  */

  for (
    const item
    of sorted
  ) {
    if (
      usedMedia.has(
        item.sourceDomain
      )
    ) {
      continue;
    }

    if (
      usedMedia.size >=
      MAX_MEDIA
    ) {
      break;
    }

    usedMedia.add(
      item.sourceDomain
    );

    selected.push(
      item
    );

    if (
      selected.length >=
      MAX_NEWS
    ) {
      break;
    }
  }

  /*
    اگر کمتر از 20 خبر داشتیم،
    از رسانه‌هایی که قبلاً انتخاب شده‌اند
    خبرهای مرتبط بعدی را اضافه می‌کنیم.
  */

  if (
    selected.length <
    MAX_NEWS
  ) {
    for (
      const item
      of sorted
    ) {
      if (
        selected.some(
          (selectedItem) =>
            selectedItem.link ===
            item.link
        )
      ) {
        continue;
      }

      if (
        !usedMedia.has(
          item.sourceDomain
        )
      ) {
        continue;
      }

      selected.push(
        item
      );

      if (
        selected.length >=
        MAX_NEWS
      ) {
        break;
      }
    }
  }

  return selected;
}

/* ============================================================
   جمع‌آوری اخبار
   ============================================================ */

async function collectNews() {
  const now =
    new Date();

  const window =
    getReportWindow(
      now
    );

  const allItems:
    NewsItem[] = [];

  const queryResults =
    await Promise.allSettled(
      SEARCH_QUERIES.map(
        async (query) => {
          try {
            const xml =
              await searchGoogleNews(
                query
              );

            return parseRss(
              xml
            );
          } catch (error) {
            console.error(
              "[news] query failed:",
              query,
              error
            );

            return [];
          }
        }
      )
    );

  for (
    const result
    of queryResults
  ) {
    if (
      result.status ===
      "fulfilled"
    ) {
      allItems.push(
        ...result.value
      );
    }
  }

  const insideWindow =
    allItems.filter(
      (item) =>
        isInsideReportWindow(
          item.publishedAt,
          window
        )
    );

  const unique =
    deduplicateNews(
      insideWindow
    );

  const selected =
    selectNews(
      unique
    );

  const mediaSet =
    new Set(
      selected.map(
        (item) =>
          item.sourceDomain
      )
    );

  return {
    selected,
    mediaCount:
      mediaSet.size,
    totalFetched:
      allItems.length,
    insideWindow:
      insideWindow.length,
    unique:
      unique.length,
    minimumReached:
      mediaSet.size >=
      MIN_MEDIA,
    window,
  };
}

/* ============================================================
   Supabase
   ============================================================ */

function getSupabaseConfig(
  env: CloudflareEnv
) {
  return {
    url:
      env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey:
      env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

/* ============================================================
   بررسی فعال بودن ارسال اخبار
   ============================================================ */

async function isNewsEnabled(
  env: CloudflareEnv
): Promise<boolean> {
  const {
    url,
    serviceKey,
  } =
    getSupabaseConfig(
      env
    );

  if (
    !url ||
    !serviceKey
  ) {
    console.warn(
      "[news] Supabase config missing; schedule assumed enabled."
    );

    return true;
  }

  try {
    const response =
      await fetch(
        `${url}/rest/v1/settings?select=key,value&key=eq.schedule_news&limit=1`,
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
      console.warn(
        "[news] settings read failed:",
        response.status
      );

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

    return (
      rows[0]?.value !==
      "false"
    );
  } catch (error) {
    console.error(
      "[news] settings error:",
      error
    );

    return true;
  }
}

/* ============================================================
   تاریخ شمسی
   ============================================================ */

function toPersianDate(
  date: Date
): string {
  try {
    return new Intl.DateTimeFormat(
      "fa-IR-u-ca-persian",
      {
        timeZone:
          TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).format(date);
  } catch {
    return "نامشخص";
  }
}

/* ============================================================
   Escape HTML
   ============================================================ */

function escapeHtml(
  value: string
): string {
  return String(value || "")
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    );
}

/* ============================================================
   ساخت پیام
   ============================================================ */

function buildBaleMessage(
  news: NewsItem[],
  mediaCount: number,
  reportWindow: ReturnType<
    typeof getReportWindow
  >,
  actualSendTime: string
): string {
  const reportDate =
    toPersianDate(
      reportWindow.end
    );

  const startText =
    formatTehranDateTime(
      reportWindow.start
    );

  const endText =
    formatTehranDateTime(
      reportWindow.end
    );

  let message =
    `📰 <b>ثبت احوال در رسانه‌ها</b>\n\n`;

  message +=
    `📅 <b>تاریخ گزارش:</b> ${reportDate}\n`;

  message +=
    `🕐 <b>زمان تهیه گزارش:</b> ${actualSendTime}\n`;

  message +=
    `⏱ <b>بازه بررسی:</b>\n`;

  message +=
    `${startText} تا ${endText}\n`;

  message +=
    `📰 <b>تعداد خبرهای منتخب:</b> ${news.length}\n`;

  message +=
    `🏛 <b>تعداد رسانه‌های مستقل:</b> ${mediaCount}\n`;

  message +=
    `━━━━━━━━━━━━━━━━━━\n\n`;

  news.forEach(
    (item, index) => {
      message +=
        `<b>${index + 1}. ${escapeHtml(
          item.title
        )}</b>\n`;

      message +=
        `🏛 رسانه: <b>${escapeHtml(
          item.sourceName
        )}</b>\n`;

      if (
        item.description
      ) {
        const cleanDescription =
          item.description
            .replace(
              /\s+/g,
              " "
            )
            .trim()
            .slice(
              0,
              400
            );

        if (
          cleanDescription
        ) {
          message +=
            `${escapeHtml(
              cleanDescription
            )}\n`;
        }
      }

      message +=
        `🔗 <a href="${escapeHtml(
          item.link
        )}">متن کامل خبر</a>\n\n`;
    }
  );

  message +=
    `━━━━━━━━━━━━━━━━━━\n`;

  message +=
    `🤖 <b>مدیر هوشمند گروه</b>`;

  return message;
}

/* ============================================================
   ارسال به بله
   ============================================================ */

async function sendToBale(
  token: string,
  chatId: string,
  message: string
) {
  const response =
    await fetch(
      `https://tapi.bale.ai/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          chat_id:
            chatId,
          text:
            message,
          parse_mode:
            "HTML",
          disable_web_page_preview:
            true,
        }),
      }
    );

  const text =
    await response.text();

  let data: unknown;

  try {
    data =
      JSON.parse(
        text
      );
  } catch {
    data = text;
  }

  return {
    httpStatus:
      response.status,
    ok:
      response.ok,
    data,
  };
}

/* ============================================================
   GET
   ============================================================ */

export async function GET() {
  try {
    const {
      env,
    } =
      await getCloudflareContext(
        {
          async: true,
        }
      );

    const token =
      env.BALE_SMART_TOKEN;

    const groupId =
      env.BALE_GROUP_ID;

    if (
      !token ||
      !groupId
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "تنظیمات ربات بله کامل نیست.",
        },
        {
          status: 500,
        }
      );
    }

    /*
      بررسی وضعیت schedule_news
    */

    const enabled =
      await isNewsEnabled(
        env
      );

    if (!enabled) {
      return NextResponse.json(
        {
          ok: true,
          cancelled:
            true,
          sent:
            false,
          message:
            "ارسال اخبار ثبت احوال لغو شده است.",
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
      جمع‌آوری اخبار
    */

    const result =
      await collectNews();

    /*
      اگر حتی یک رسانه معتبر
      پیدا نشد، هیچ پیام بله‌ای
      ارسال نمی‌شود.
    */

    if (
      result.mediaCount <
      MIN_MEDIA
    ) {
      console.log(
        "[news] no relevant trusted media found; nothing will be sent."
      );

      return NextResponse.json(
        {
          ok: true,
          cancelled:
            false,
          sent:
            false,
          reason:
            "no_relevant_media",
          news: {
            totalFetched:
              result.totalFetched,
            insideWindow:
              result.insideWindow,
            unique:
              result.unique,
            selected:
              result.selected.length,
            mediaCount:
              result.mediaCount,
            minimumMedia:
              MIN_MEDIA,
            maximumMedia:
              MAX_MEDIA,
            maximumNews:
              MAX_NEWS,
            minimumReached:
              false,
          },
          report_window: {
            start:
              result.window.startIso,
            end:
              result.window.endIso,
            start_tehran:
              formatTehranDateTime(
                result.window.start
              ),
            end_tehran:
              formatTehranDateTime(
                result.window.end
              ),
          },
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
      زمان واقعی ارسال
    */

    const actualSendTime =
      formatTehranDateTime(
        new Date()
      );

    const message =
      buildBaleMessage(
        result.selected,
        result.mediaCount,
        result.window,
        actualSendTime
      );

    const bale =
      await sendToBale(
        token,
        groupId,
        message
      );

    if (
      !bale.ok
    ) {
      return NextResponse.json(
        {
          ok: false,
          cancelled:
            false,
          sent:
            false,
          actual_send_time:
            actualSendTime,
          news: {
            totalFetched:
              result.totalFetched,
            insideWindow:
              result.insideWindow,
            unique:
              result.unique,
            selected:
              result.selected.length,
            mediaCount:
              result.mediaCount,
            minimumMedia:
              MIN_MEDIA,
            maximumMedia:
              MAX_MEDIA,
            maximumNews:
              MAX_NEWS,
            minimumReached:
              result.minimumReached,
          },
          report_window: {
            start:
              result.window.startIso,
            end:
              result.window.endIso,
            start_tehran:
              formatTehranDateTime(
                result.window.start
              ),
            end_tehran:
              formatTehranDateTime(
                result.window.end
              ),
          },
          bale,
        },
        {
          status: 502,
        }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        cancelled:
          false,
        sent:
          true,
        actual_send_time:
          actualSendTime,
        news: {
          totalFetched:
            result.totalFetched,
          insideWindow:
            result.insideWindow,
          unique:
            result.unique,
          selected:
            result.selected.length,
          mediaCount:
            result.mediaCount,
          minimumMedia:
            MIN_MEDIA,
          maximumMedia:
            MAX_MEDIA,
          maximumNews:
            MAX_NEWS,
          minimumReached:
            result.minimumReached,
        },
        report_window: {
          start:
            result.window.startIso,
          end:
            result.window.endIso,
          start_tehran:
            formatTehranDateTime(
              result.window.start
            ),
          end_tehran:
            formatTehranDateTime(
              result.window.end
            ),
        },
        bale,
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
      "[news/registration/daily-summary] error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "تهیه گزارش اخبار ثبت احوال انجام نشد.",
      },
      {
        status: 500,
      }
    );
  }
      }

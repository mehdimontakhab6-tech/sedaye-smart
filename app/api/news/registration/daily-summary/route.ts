import { NextResponse } from "next/server";

const MAX_NEWS = 20;
const MIN_MEDIA = 1;
const REQUEST_TIMEOUT_MS = 8000;

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
};

/*
 * فقط رسانه‌های معتبر داخلی ایران
 */
const TRUSTED_MEDIA: Record<string, string> = {
  "irna.ir": "ایرنا",
  "irna.news": "ایرنا",

  "isna.ir": "ایسنا",

  "mehrnews.com": "مهر",

  "tasnimnews.com": "تسنیم",
  "tasnimnews.ir": "تسنیم",

  "farsnews.ir": "فارس",
  "farsnews.com": "فارس",

  "ilna.ir": "ایلنا",

  "yjc.ir": "باشگاه خبرنگاران جوان",

  "iribnews.ir": "صداوسیما",
  "irinn.ir": "شبکه خبر",

  "snn.ir": "خبرگزاری دانشجو",

  "ana.ir": "خبرگزاری آنا",

  "khabaronline.ir": "خبرآنلاین",

  "hamshahrionline.ir": "همشهری آنلاین",

  "jamejamonline.ir": "جام جم آنلاین",

  "mizanonline.ir": "میزان",

  "defapress.ir": "دفاع پرس",

  "icana.ir": "خانه ملت",

  "shana.ir": "شانا",

  "iqna.ir": "ایکنا",

  "brna.ir": "برنا",

  "tabnak.ir": "تابناک",

  "asriran.com": "عصر ایران",

  "entekhab.ir": "انتخاب",

  "fararu.com": "فرارو",

  "aftabnews.ir": "آفتاب نیوز",

  "etemaadonline.com": "اعتماد آنلاین",

  "sharghdaily.com": "شرق",

  "hammihanonline.ir": "هم‌میهن",

  "donya-e-eqtesad.com": "دنیای اقتصاد",

  "eghtesadonline.com": "اقتصاد آنلاین",
};

/*
 * منابع خارجی که نباید وارد خروجی شوند
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

  const trusted = Object.keys(
    TRUSTED_MEDIA
  ).find(
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
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(Number(code))
    );
}

function extractTag(
  xml: string,
  tag: string
): string {
  const regex = new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
    "i"
  );

  const match = xml.match(regex);

  return match
    ? decodeXml(cleanText(match[1]))
    : "";
}

function extractAttribute(
  xml: string,
  tag: string,
  attribute: string
): string {
  const regex = new RegExp(
    `<${tag}[^>]*\\b${attribute}=["']([^"']+)["'][^>]*>`,
    "i"
  );

  const match = xml.match(regex);

  return match
    ? decodeXml(match[1].trim())
    : "";
}

/*
 * درخواست خارجی با Timeout
 */
async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

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
 * استخراج RSS
 */
function parseRss(
  xml: string
): Candidate[] {
  const items: Candidate[] = [];

  const matches =
    xml.match(
      /<item[\s\S]*?<\/item>/gi
    ) || [];

  for (const item of matches) {
    const title =
      extractTag(
        item,
        "title"
      );

    const link =
      extractTag(
        item,
        "link"
      );

    const pubDate =
      extractTag(
        item,
        "pubDate"
      ) ||
      extractTag(
        item,
        "published"
      ) ||
      extractTag(
        item,
        "updated"
      );

    const source =
      extractTag(
        item,
        "source"
      );

    const sourceUrl =
      extractAttribute(
        item,
        "source",
        "url"
      );

    if (!title || !link) {
      continue;
    }

    let domain = "";

    try {
      domain =
        normalizeDomain(
          new URL(
            sourceUrl || link
          ).hostname
        );
    } catch {
      continue;
    }

    if (
      !isTrustedIranianMedia(
        domain
      )
    ) {
      continue;
    }

    items.push({
      title,
      url: link,
      source:
        getMediaName(
          domain,
          source
        ),
      domain,
      publishedAt:
        pubDate || undefined,
    });
  }

  return items;
}

function parseDate(
  value?: string
): Date | null {
  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date;
}

/*
 * بازه دقیق:
 *
 * ۲۲:۳۰ تهران روز قبل
 * تا
 * ۲۲:۳۰ تهران روز جاری
 *
 * ۲۲:۳۰ تهران = ۱۹:۰۰ UTC
 */
function getReportWindow(): {
  start: Date;
  end: Date;
  startTehran: string;
  endTehran: string;
} {
  const now =
    new Date();

  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Asia/Tehran",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).formatToParts(
      now
    );

  const year =
    Number(
      parts.find(
        (x) =>
          x.type === "year"
      )?.value
    );

  const month =
    Number(
      parts.find(
        (x) =>
          x.type === "month"
      )?.value
    );

  const day =
    Number(
      parts.find(
        (x) =>
          x.type === "day"
      )?.value
    );

  const end =
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
      formatTehran(start),
    endTehran:
      formatTehran(end),
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
  return title
    .toLowerCase()
    .replace(
      /[\u064B-\u065F\u0670]/g,
      ""
    )
    .replace(
      /ي/g,
      "ی"
    )
    .replace(
      /ك/g,
      "ک"
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
    result.push(item);
  }

  return result;
}

/*
 * GDELT
 */
async function fetchGdelt(
  start: Date,
  end: Date
): Promise<Candidate[]> {
  const query =
    '("ثبت احوال" OR "سازمان ثبت احوال" OR "ثبت احوال کشور" OR "کارت ملی" OR "شناسنامه")';

  const results:
    Candidate[] = [];

  const url =
    "https://api.gdeltproject.org/api/v2/doc/doc" +
    "?query=" +
    encodeURIComponent(
      query
    ) +
    "&mode=artlist" +
    "&maxrecords=100" +
    "&format=json" +
    "&sort=HybridRel";

  try {
    const response =
      await fetchWithTimeout(
        url,
        {
          headers: {
            "User-Agent":
              "sedaye-smart/1.0",
          },
          cache:
            "no-store",
        }
      );

    if (
      !response.ok
    ) {
      return [];
    }

    const data =
      await response.json();

    const articles =
      Array.isArray(
        data?.articles
      )
        ? data.articles
        : [];

    for (
      const article of articles
    ) {
      const title =
        String(
          article?.title ||
            ""
        ).trim();

      const articleUrl =
        String(
          article?.url ||
            ""
        ).trim();

      if (
        !title ||
        !articleUrl
      ) {
        continue;
      }

      let domain =
        "";

      try {
        domain =
          normalizeDomain(
            new URL(
              articleUrl
            ).hostname
          );
      } catch {
        continue;
      }

      if (
        !isTrustedIranianMedia(
          domain
        )
      ) {
        continue;
      }

      const seendate =
        String(
          article?.seendate ||
            ""
        );

      if (
        !/^\d{14}$/.test(
          seendate
        )
      ) {
        continue;
      }

      const parsed =
        new Date(
          Date.UTC(
            Number(
              seendate.slice(
                0,
                4
              )
            ),
            Number(
              seendate.slice(
                4,
                6
              )
            ) - 1,
            Number(
              seendate.slice(
                6,
                8
              )
            ),
            Number(
              seendate.slice(
                8,
                10
              )
            ),
            Number(
              seendate.slice(
                10,
                12
              )
            ),
            Number(
              seendate.slice(
                12,
                14
              )
            )
          )
        );

      if (
        !isInsideWindow(
          parsed,
          start,
          end
        )
      ) {
        continue;
      }

      results.push({
        title,
        url:
          articleUrl,
        source:
          getMediaName(
            domain
          ),
        domain,
        publishedAt:
          parsed.toISOString(),
      });

      if (
        results.length >=
        MAX_NEWS
      ) {
        break;
      }
    }
  } catch {
    return [];
  }

  return results;
}

/*
 * Google News RSS
 */
async function fetchGoogleNews(
  start: Date,
  end: Date
): Promise<Candidate[]> {
  const query =
    '("ثبت احوال" OR "سازمان ثبت احوال" OR "ثبت احوال کشور" OR "کارت ملی" OR "شناسنامه")';

  const results:
    Candidate[] = [];

  const rssUrl =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(
      query
    ) +
    "&hl=fa&gl=IR&ceid=IR:fa";

  try {
    const response =
      await fetchWithTimeout(
        rssUrl,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 sedaye-smart/1.0",
          },
          cache:
            "no-store",
        }
      );

    if (
      !response.ok
    ) {
      return [];
    }

    const xml =
      await response.text();

    const candidates =
      parseRss(xml);

    for (
      const candidate of candidates
    ) {
      const date =
        parseDate(
          candidate.publishedAt
        );

      if (
        !isInsideWindow(
          date,
          start,
          end
        )
      ) {
        continue;
      }

      results.push(
        candidate
      );

      if (
        results.length >=
        MAX_NEWS
      ) {
        break;
      }
    }
  } catch {
    return [];
  }

  return results;
}

/*
 * Bing News RSS
 *
 * پشتیبان دوم
 */
async function fetchBingNews(
  start: Date,
  end: Date
): Promise<Candidate[]> {
  const query =
    '("ثبت احوال" OR "سازمان ثبت احوال" OR "ثبت احوال کشور" OR "کارت ملی" OR "شناسنامه")';

  const results:
    Candidate[] = [];

  const rssUrl =
    "https://www.bing.com/news/search?q=" +
    encodeURIComponent(
      query
    ) +
    "&format=rss&mkt=fa-IR";

  try {
    const response =
      await fetchWithTimeout(
        rssUrl,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 sedaye-smart/1.0",
          },
          cache:
            "no-store",
        }
      );

    if (
      !response.ok
    ) {
      return [];
    }

    const xml =
      await response.text();

    const candidates =
      parseRss(xml);

    for (
      const candidate of candidates
    ) {
      const date =
        parseDate(
          candidate.publishedAt
        );

      if (
        !isInsideWindow(
          date,
          start,
          end
        )
      ) {
        continue;
      }

      results.push(
        candidate
      );

      if (
        results.length >=
        MAX_NEWS
      ) {
        break;
      }
    }
  } catch {
    return [];
  }

  return results;
}

/*
 * دریافت اخبار
 */
async function getNews(
  start: Date,
  end: Date
): Promise<NewsItem[]> {
  /*
   * منبع اول
   */
  let candidates =
    await fetchGdelt(
      start,
      end
    );

  /*
   * منبع دوم
   */
  if (
    candidates.length <
    MIN_MEDIA
  ) {
    const fallback =
      await fetchGoogleNews(
        start,
        end
      );

    candidates = [
      ...candidates,
      ...fallback,
    ];
  }

  /*
   * منبع سوم
   */
  if (
    candidates.length <
    MIN_MEDIA
  ) {
    const fallback =
      await fetchBingNews(
        start,
        end
      );

    candidates = [
      ...candidates,
      ...fallback,
    ];
  }

  /*
   * فیلتر نهایی
   */
  const filtered =
    candidates
      .filter(
        (item) =>
          isTrustedIranianMedia(
            item.domain
          )
      )
      .map(
        (item) => {
          const date =
            parseDate(
              item.publishedAt
            );

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
              date
                ? date.toISOString()
                : "",
          };
        }
      )
      .filter(
        (item) =>
          item.title &&
          item.url &&
          item.publishedAt
      );

  const unique =
    dedupeNews(
      filtered
    );

  return unique.slice(
    0,
    MAX_NEWS
  );
}

/*
 * ارسال به بله
 */
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

/*
 * بررسی فعال بودن زمان‌بندی اخبار
 */
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

    if (
      !response.ok
    ) {
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

/*
 * ساخت پیام
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
    `📊 تعداد اخبار: ${news.length}`
  );

  lines.push("");

  news.forEach(
    (item, index) => {
      lines.push(
        `${index + 1}. ${item.title}`
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
    "🇮🇷 منابع انتخاب‌شده فقط از رسانه‌های معتبر داخل ایران هستند."
  );

  return lines.join(
    "\n"
  );
}

/*
 * API
 */
export async function GET(
  request: Request
) {
  const startedAt =
    new Date();

  try {
    /*
     * بررسی فعال بودن ارسال
     */
    const scheduleEnabled =
      await getScheduleState();

    if (
      !scheduleEnabled
    ) {
      return NextResponse.json({
        ok: true,

        cancelled:
          true,

        sent:
          false,

        reason:
          "schedule_news_disabled",
      });
    }

    /*
     * بازه گزارش
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
    const news =
      await getNews(
        start,
        end
      );

    /*
     * تعداد رسانه‌های مستقل
     */
    const mediaSet =
      new Set(
        news.map(
          (item) =>
            item.domain
        )
      );

    /*
     * اگر خبر معتبر وجود ندارد،
     * هیچ پیام «۰ خبر» ارسال نمی‌شود.
     */
    if (
      news.length === 0 ||
      mediaSet.size <
        MIN_MEDIA
    ) {
      return NextResponse.json({
        ok: true,

        cancelled:
          false,

        sent:
          false,

        reason:
          "no_relevant_iranian_media",

        news: {
          totalFetched:
            news.length,

          selected:
            0,

          mediaCount:
            mediaSet.size,

          minimumMedia:
            MIN_MEDIA,

          maximumMedia:
            MAX_NEWS,

          maximumNews:
            MAX_NEWS,

          minimumReached:
            false,
        },

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
          startedAt.getTime(),
      });
    }

    /*
     * زمان ارسال
     */
    const sendTime =
      new Date();

    const message =
      formatNewsMessage(
        news,
        sendTime
      );

    /*
     * ارسال به بله
     */
    const bale =
      await sendBaleMessage(
        message
      );

    /*
     * زمان واقعی موفقیت
     */
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
      ok: true,

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
          news.length,

        selected:
          news.length,

        mediaCount:
          mediaSet.size,

        minimumMedia:
          MIN_MEDIA,

        maximumMedia:
          MAX_NEWS,

        maximumNews:
          MAX_NEWS,

        minimumReached:
          mediaSet.size >=
          MIN_MEDIA,
      },

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
        startedAt.getTime(),
    });
  } catch (
    error
  ) {
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
          startedAt.getTime(),
      },
      {
        status:
          500,
      }
    );
  }
      }

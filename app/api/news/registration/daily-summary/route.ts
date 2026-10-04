import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

const TIME_ZONE = "Asia/Tehran";
const BALE_API = "https://tapi.bale.ai";

const SEARCH_QUERIES = [
  '"ثبت احوال" when:2d',
  '"سازمان ثبت احوال" when:2d',
  '"کارت ملی" "ثبت احوال" when:2d',
  '"شناسنامه" "ثبت احوال" when:2d',
  '"هویت دیجیتال" "ثبت احوال" when:2d',
  '"خدمات هویتی" "ثبت احوال" when:2d',
];

const MAX_NEWS = 12;
const MIN_MEDIA = 10;
const MAX_AGE_HOURS = 36;

/*
 * رسانه‌هایی که معمولاً برای خبرهای عمومی و رسمی
 * قابل اتکاتر هستند.
 *
 * این فهرست مانع استفاده از خبر رسانه‌های دیگر نمی‌شود،
 * اما در اولویت‌بندی کمک می‌کند.
 */
const TRUSTED_MEDIA_DOMAINS = [
  "irna.ir",
  "isna.ir",
  "mehrnews.com",
  "tasnimnews.com",
  "ilna.ir",
  "farsnews.ir",
  "yjc.ir",
  "hamshahrionline.ir",
  "khabaronline.ir",
  "tabnak.ir",
  "borna.news",
  "ana.ir",
  "imna.ir",
  "shafaqna.com",
  "iqna.ir",
  "snn.ir",
  "mizanonline.ir",
  "dana.ir",
  "rokna.net",
  "donya-e-eqtesad.com",
  "irannewspaper.ir",
  "ettelaat.com",
  "khabarfoori.com",
  "aftabnews.ir",
  "asriran.com",
];

/* -------------------- ابزارها -------------------- */

function normalizeText(value: string): string {
  return value
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(Number(code))
    )
    .trim();
}

function stripHtml(value: string): string {
  return normalizeText(
    value
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/p>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function escapeBaleHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getTehranDate(): Date {
  return new Date(
    new Date().toLocaleString("en-US", {
      timeZone: TIME_ZONE,
    })
  );
}

function getTehranDateText(): string {
  const date = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return date;
}

function getTehranTimeText(): string {
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

function getDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname
      .toLowerCase()
      .replace(/^www\./, "");

    return hostname;
  } catch {
    return "";
  }
}

function isTrustedDomain(domain: string): boolean {
  if (!domain) return false;

  return TRUSTED_MEDIA_DOMAINS.some(
    (trusted) =>
      domain === trusted ||
      domain.endsWith("." + trusted)
  );
}

function mediaPriority(domain: string): number {
  if (isTrustedDomain(domain)) {
    return 2;
  }

  return 1;
}

function cleanTitle(title: string): string {
  let result = stripHtml(decodeXml(title));

  result = result
    .replace(/\s*-\s*[^-]+$/, "")
    .trim();

  return result;
}

function cleanDescription(description: string): string {
  const text = stripHtml(
    decodeXml(description)
  );

  if (!text) {
    return "";
  }

  if (text.length <= 420) {
    return text;
  }

  return text.slice(0, 417).trimEnd() + "...";
}

function getXmlTag(
  block: string,
  tag: string
): string {
  const regex = new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
    "i"
  );

  const match = block.match(regex);

  return match?.[1]
    ? decodeXml(match[1])
    : "";
}

function parseRssItems(xml: string) {
  const items: Array<{
    title: string;
    link: string;
    description: string;
    pubDate: string;
    source: string;
    sourceUrl: string;
  }> = [];

  const matches = xml.match(
    /<item\b[\s\S]*?<\/item>/gi
  );

  if (!matches) {
    return items;
  }

  for (const block of matches) {
    const title = cleanTitle(
      getXmlTag(block, "title")
    );

    const link = getXmlTag(
      block,
      "link"
    );

    const description = cleanDescription(
      getXmlTag(block, "description")
    );

    const pubDate = getXmlTag(
      block,
      "pubDate"
    );

    const sourceMatch = block.match(
      /<source([^>]*)>([\s\S]*?)<\/source>/i
    );

    let source = "";
    let sourceUrl = "";

    if (sourceMatch) {
      source = normalizeText(
        decodeXml(sourceMatch[2])
      );

      const attributes =
        sourceMatch[1] || "";

      const urlMatch =
        attributes.match(
          /url=["']([^"']+)["']/i
        );

      sourceUrl = urlMatch?.[1] || "";
    }

    if (
      !title ||
      !link ||
      !pubDate
    ) {
      continue;
    }

    items.push({
      title,
      link,
      description,
      pubDate,
      source,
      sourceUrl,
    });
  }

  return items;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 12000
): Promise<Response> {
  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGoogleNews(
  query: string
) {
  const url =
    "https://news.google.com/rss/search?" +
    new URLSearchParams({
      q: query,
      hl: "fa",
      gl: "IR",
      ceid: "IR:fa",
    }).toString();

  try {
    const response =
      await fetchWithTimeout(url, {
        headers: {
          Accept:
            "application/rss+xml, application/xml, text/xml",
          "User-Agent":
            "sedaye-smart-news-bot/1.0",
        },
        cache: "no-store",
      });

    if (!response.ok) {
      console.error(
        "[news] Google News HTTP error:",
        response.status,
        query
      );

      return [];
    }

    const xml =
      await response.text();

    return parseRssItems(xml);
  } catch (error) {
    console.error(
      "[news] Google News fetch error:",
      query,
      error
    );

    return [];
  }
}

function isRecent(
  pubDate: string
): boolean {
  const timestamp =
    Date.parse(pubDate);

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const age =
    Date.now() - timestamp;

  return (
    age >= -2 * 60 * 60 * 1000 &&
    age <=
      MAX_AGE_HOURS *
        60 *
        60 *
        1000
  );
}

function normalizeForDuplicate(
  text: string
): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .slice(0, 180);
}

function similarityKey(
  title: string
): string {
  return normalizeForDuplicate(
    title
  );
}

function deduplicateNews(
  items: any[]
) {
  const seenTitles =
    new Set<string>();

  const seenUrls =
    new Set<string>();

  const result: any[] = [];

  for (const item of items) {
    const titleKey =
      similarityKey(item.title);

    const domain =
      getDomain(item.sourceUrl) ||
      getDomain(item.link);

    const urlKey =
      normalizeForDuplicate(
        item.link
      );

    if (
      seenTitles.has(titleKey) ||
      seenUrls.has(urlKey)
    ) {
      continue;
    }

    seenTitles.add(titleKey);
    seenUrls.add(urlKey);

    result.push({
      ...item,
      domain,
    });
  }

  return result;
}

function selectDiverseNews(
  items: any[]
) {
  /*
   * ابتدا رسانه‌های معتبر و مستقل انتخاب می‌شوند.
   * سپس در صورت کمبود، سایر رسانه‌های واقعی اضافه می‌شوند.
   */

  const sorted =
    [...items].sort(
      (a, b) =>
        mediaPriority(b.domain) -
        mediaPriority(a.domain)
    );

  const selected: any[] = [];

  const mediaUsed =
    new Set<string>();

  /*
   * مرحله اول:
   * تا حد امکان یک خبر از هر رسانه
   */
  for (const item of sorted) {
    const mediaKey =
      item.domain ||
      item.source ||
      "unknown";

    if (
      !mediaUsed.has(mediaKey)
    ) {
      selected.push(item);
      mediaUsed.add(mediaKey);
    }

    if (
      selected.length >=
      MAX_NEWS
    ) {
      break;
    }
  }

  /*
   * مرحله دوم:
   * اگر کمتر از ۱۲ خبر داریم،
   * خبرهای واقعی دیگر اضافه شوند.
   */
  if (
    selected.length <
    MAX_NEWS
  ) {
    for (const item of sorted) {
      if (
        selected.includes(item)
      ) {
        continue;
      }

      selected.push(item);

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

async function resolveFinalUrl(
  url: string
): Promise<string> {
  /*
   * لینک Google News ممکن است به لینک واقعی
   * رسانه Redirect شود.
   */
  if (
    !url.includes(
      "news.google.com"
    )
  ) {
    return url;
  }

  try {
    const response =
      await fetchWithTimeout(
        url,
        {
          method: "GET",
          redirect: "follow",
          headers: {
            "User-Agent":
              "Mozilla/5.0 sedaye-smart",
          },
        },
        10000
      );

    if (
      response.url &&
      !response.url.includes(
        "news.google.com"
      )
    ) {
      return response.url;
    }

    return url;
  } catch (error) {
    console.warn(
      "[news] resolve URL failed:",
      error
    );

    return url;
  }
}

async function sendBaleMessage(
  token: string,
  chatId: string,
  html: string
) {
  const url =
    `${BALE_API}/bot${token}/sendMessage`;

  const response =
    await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: html,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      },
      15000
    );

  const text =
    await response.text();

  let data: any;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      raw: text,
    };
  }

  return {
    httpStatus: response.status,
    ok: response.ok,
    data,
  };
}

/* -------------------- تولید گزارش -------------------- */

async function collectNews() {
  const allNews: any[] = [];

  for (
    const query of SEARCH_QUERIES
  ) {
    const items =
      await fetchGoogleNews(
        query
      );

    allNews.push(
      ...items
    );
  }

  /*
   * فقط خبرهای ۳۶ ساعت اخیر
   */
  const recent =
    allNews.filter(
      (item) =>
        isRecent(
          item.pubDate
        )
    );

  /*
   * رسانه و دامنه را تکمیل می‌کنیم.
   */
  const enriched =
    recent.map((item) => {
      const domain =
        getDomain(
          item.sourceUrl
        ) ||
        getDomain(
          item.link
        );

      return {
        ...item,
        domain,
        source:
          item.source ||
          domain ||
          "رسانه نامشخص",
      };
    });

  /*
   * حذف تکراری‌ها
   */
  const unique =
    deduplicateNews(
      enriched
    );

  /*
   * انتخاب متنوع
   */
  const selected =
    selectDiverseNews(
      unique
    );

  /*
   * لینک واقعی رسانه را resolve می‌کنیم.
   */
  const resolved = [];

  for (
    const item of selected
  ) {
    const finalUrl =
      await resolveFinalUrl(
        item.link
      );

    resolved.push({
      ...item,
      finalUrl,
    });
  }

  return {
    allCount: allNews.length,
    recentCount:
      recent.length,
    uniqueCount:
      unique.length,
    items: resolved,
  };
}

/* -------------------- پیام بله -------------------- */

function buildBaleMessage(
  newsItems: any[]
) {
  const date =
    getTehranDateText();

  const time =
    getTehranTimeText();

  const mediaSet =
    new Set(
      newsItems.map(
        (item) =>
          item.domain ||
          item.source
      )
    );

  const mediaCount =
    mediaSet.size;

  let message =
    `📰 <b>ثبت احوال در رسانه‌ها</b>\n\n`;

  message +=
    `📅 تاریخ گزارش: ${escapeBaleHtml(
      date
    )}\n`;

  message +=
    `🕐 زمان تهیه گزارش: ${escapeBaleHtml(
      time
    )}\n`;

  message +=
    `📰 تعداد خبرهای منتخب: ${newsItems.length}\n`;

  message +=
    `🏛 تعداد رسانه‌های مستقل: ${mediaCount}\n`;

  message +=
    `━━━━━━━━━━━━━━\n\n`;

  if (
    newsItems.length === 0
  ) {
    message +=
      `ℹ️ در بازه بررسی‌شده، خبر معتبر و قابل استناد کافی درباره ثبت احوال پیدا نشد.\n\n`;

    message +=
      `سامانه از ارائه خبر حدسی یا ساختگی خودداری می‌کند.`;

    return message;
  }

  newsItems.forEach(
    (item, index) => {
      const source =
        item.source ||
        item.domain ||
        "رسانه";

      const title =
        item.title ||
        "بدون عنوان";

      const description =
        item.description ||
        "";

      const url =
        item.finalUrl ||
        item.link;

      message +=
        `<b>${index + 1}. ${escapeBaleHtml(
          source
        )}</b>\n`;

      message +=
        `🔹 ${escapeBaleHtml(
          title
        )}\n`;

      if (
        description
      ) {
        message +=
          `📝 ${escapeBaleHtml(
            description
          )}\n`;
      }

      message +=
        `🔗 <a href="${escapeBaleHtml(
          url
        )}">مشاهده خبر</a>\n\n`;

      message +=
        `━━━━━━━━━━━━━━\n\n`;
    }
  );

  message +=
    `🤖 <b>مدیر هوشمند گروه</b>\n`;

  message +=
    `این گزارش بر اساس اخبار منتشرشده در رسانه‌ها تهیه شده و خبرهای تکراری تا حد امکان حذف شده‌اند.`;

  return message;
}

/* -------------------- GET -------------------- */

export async function GET() {
  const startedAt =
    new Date().toISOString();

  try {
    const { env } =
      await getCloudflareContext({
        async: true,
      });

    const token =
      env.BALE_SMART_TOKEN;

    const chatId =
      env.BALE_GROUP_ID;

    if (
      !token ||
      !chatId
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "تنظیمات ربات بله کامل نیست.",
        },
        { status: 500 }
      );
    }

    /*
     * کنترل لغو ارسال
     *
     * اگر schedule_news=false باشد،
     * Cron اجرا می‌شود ولی ارسال خبر انجام نمی‌شود.
     */
    let newsEnabled = true;

    try {
      const supabaseUrl =
        env.NEXT_PUBLIC_SUPABASE_URL;

      const serviceKey =
        env.SUPABASE_SERVICE_ROLE_KEY;

      if (
        supabaseUrl &&
        serviceKey
      ) {
        const settingsResponse =
          await fetch(
            `${supabaseUrl}/rest/v1/settings?select=key,value&key=eq.schedule_news&limit=1`,
            {
              method: "GET",
              cache: "no-store",
              headers: {
                apikey:
                  serviceKey,
                Authorization:
                  `Bearer ${serviceKey}`,
                Accept:
                  "application/json",
              },
            }
          );

        if (
          settingsResponse.ok
        ) {
          const rows =
            await settingsResponse.json();

          if (
            Array.isArray(
              rows
            ) &&
            rows.length > 0
          ) {
            newsEnabled =
              rows[0]?.value !==
              "false";
          }
        }
      }
    } catch (error) {
      /*
       * در صورت خطا در خواندن تنظیمات،
       * ارسال را متوقف نمی‌کنیم.
       */
      console.warn(
        "[news] schedule setting read failed:",
        error
      );
    }

    if (!newsEnabled) {
      return Response.json(
        {
          ok: true,
          cancelled: true,
          sent: false,
          message:
            "ارسال خلاصه اخبار ثبت احوال لغو شده است.",
          startedAt,
        },
        {
          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    /*
     * جمع‌آوری اخبار
     */
    const result =
      await collectNews();

    const newsItems =
      result.items;

    /*
     * ساخت پیام
     */
    const message =
      buildBaleMessage(
        newsItems
      );

    /*
     * ارسال به بله
     */
    const bale =
      await sendBaleMessage(
        token,
        chatId,
        message
      );

    const actualSendTime =
      getTehranTimeText();

    if (
      !bale.ok ||
      !bale.data?.ok
    ) {
      return Response.json(
        {
          ok: false,
          cancelled: false,
          sent: false,
          actual_send_time:
            actualSendTime,
          news: {
            totalFetched:
              result.allCount,
            recent:
              result.recentCount,
            unique:
              result.uniqueCount,
            selected:
              newsItems.length,
          },
          bale,
        },
        { status: 502 }
      );
    }

    const mediaCount =
      new Set(
        newsItems.map(
          (item) =>
            item.domain ||
            item.source
        )
      ).size;

    return Response.json(
      {
        ok: true,
        cancelled: false,
        sent: true,

        actual_send_time:
          actualSendTime,

        news: {
          totalFetched:
            result.allCount,
          recent:
            result.recentCount,
          unique:
            result.uniqueCount,
          selected:
            newsItems.length,
          mediaCount,
          minimumMedia:
            MIN_MEDIA,
          minimumReached:
            mediaCount >=
            MIN_MEDIA,
        },

        bale,
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
          "X-News-Media-Count":
            String(mediaCount),
        },
      }
    );
  } catch (error) {
    console.error(
      "[news/daily-summary] error:",
      error
    );

    return Response.json(
      {
        ok: false,
        cancelled: false,
        sent: false,
        error:
          error instanceof Error
            ? error.message
            : "تهیه خلاصه اخبار انجام نشد.",
        startedAt,
        actual_time:
          getTehranTimeText(),
      },
      { status: 500 }
    );
  }
    }

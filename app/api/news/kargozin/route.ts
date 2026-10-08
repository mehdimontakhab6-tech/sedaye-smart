import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

const SOURCE_URL = "https://kargozin.com/";
const SETTINGS_KEY = "kargozin_seen_urls";

const MAX_ARTICLES_PER_RUN = 3;
const MAX_CONTENT_LENGTH = 12000;
const REQUEST_TIMEOUT_MS = 10000;

const NOTICE =
  "🤖 این مطلب به صورت اتوماتیک از مجله کارگزینی ارسال شده است.";

type Article = {
  url: string;
  title: string;
  content: string;
  imageUrl?: string;
  videoUrl?: string;
};

type MediaResult = {
  sent: boolean;
  type: "video" | "photo" | "text";
};

function cleanText(value: string): string {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value: string): string {
  return String(value || "")
    .replace(/<!\[CDATA\[/gi, "")
    .replace(/\]\]>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCharCode(Number(n))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCharCode(parseInt(n, 16))
    );
}

function absoluteUrl(value: string): string {
  try {
    return new URL(value, SOURCE_URL).toString();
  } catch {
    return "";
  }
}

function isKargozinUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      (url.hostname === "kargozin.com" ||
        url.hostname === "www.kargozin.com")
    );
  } catch {
    return false;
  }
}

function isClearlyNonArticleUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const path = url.pathname.toLowerCase();

    const blockedPaths = [
      "/wp-admin",
      "/wp-login",
      "/feed",
      "/tag/",
      "/category/",
      "/author/",
      "/page/",
      "/search/",
      "/cart",
      "/checkout",
      "/my-account",
      "/shop/",
      "/product/",
      "/products/",
      "/download/",
      "/downloads/",
    ];

    if (
      blockedPaths.some((item) =>
        path.includes(item)
      )
    ) {
      return true;
    }

    const blockedExtensions = [
      ".pdf",
      ".zip",
      ".rar",
      ".7z",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".apk",
      ".exe",
    ];

    return blockedExtensions.some((ext) =>
      path.endsWith(ext)
    );
  } catch {
    return true;
  }
}

function isAdvertisingText(value: string): boolean {
  const text = cleanText(value).toLowerCase();

  const blockedTerms = [
    "sponsored",
    "sponsored content",
    "advertorial",
    "advertisement",
    "advertising",
    "تبلیغات",
    "تبلیغاتی",
    "رپورتاژ",
    "رپورتاژ آگهی",
    "اسپانسر",
    "اسپانسری",
    "خرید کنید",
    "خرید آنلاین",
    "فروشگاه",
    "فروش ویژه",
    "تخفیف ویژه",
    "کد تخفیف",
    "ثبت سفارش",
    "سفارش آنلاین",
    "همین حالا بخرید",
  ];

  return blockedTerms.some((term) =>
    text.includes(term)
  );
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(timeout);
  }
}

function extractAttribute(
  tag: string,
  attribute: string
): string {
  const regex = new RegExp(
    `${attribute}\\s*=\\s*["']([^"']+)["']`,
    "i"
  );

  const match = tag.match(regex);

  return match?.[1]
    ? decodeHtml(match[1])
    : "";
}

function extractMeta(
  html: string,
  attribute: string,
  value: string
): string {
  const regex = new RegExp(
    `<meta[^>]+${attribute}\\s*=\\s*["']${value}["'][^>]*>`,
    "i"
  );

  const match = html.match(regex);

  if (!match) {
    return "";
  }

  return (
    extractAttribute(match[0], "content") ||
    extractAttribute(match[0], "value")
  );
}

function extractTitle(html: string): string {
  const ogTitle = extractMeta(
    html,
    "property",
    "og:title"
  );

  if (ogTitle) {
    return cleanText(ogTitle);
  }

  const h1 = html.match(
    /<h1[^>]*>([\s\S]*?)<\/h1>/i
  );

  if (h1?.[1]) {
    return cleanText(decodeHtml(h1[1]));
  }

  const title = html.match(
    /<title[^>]*>([\s\S]*?)<\/title>/i
  );

  return title?.[1]
    ? cleanText(decodeHtml(title[1]))
    : "";
}

function extractMainContent(html: string): string {
  const candidates: string[] = [];

  const articleMatches =
    html.match(
      /<article\b[^>]*>[\s\S]*?<\/article>/gi
    ) || [];

  const mainMatches =
    html.match(
      /<main\b[^>]*>[\s\S]*?<\/main>/gi
    ) || [];

  candidates.push(
    ...articleMatches,
    ...mainMatches
  );

  const classMatches =
    html.match(
      /<(?:div|section)[^>]+class=["'][^"']*(?:entry-content|post-content|article-content|single-content|content-area)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section)>/gi
    ) || [];

  candidates.push(...classMatches);

  candidates.sort(
    (a, b) => b.length - a.length
  );

  const source =
    candidates[0] || html;

  const paragraphs: string[] = [];

  const paragraphRegex =
    /<p\b[^>]*>([\s\S]*?)<\/p>/gi;

  let match: RegExpExecArray | null;

  while (
    (match = paragraphRegex.exec(source)) !== null
  ) {
    const paragraph = cleanText(
      decodeHtml(match[1])
    );

    if (
      paragraph.length >= 20 &&
      !isAdvertisingText(paragraph)
    ) {
      paragraphs.push(paragraph);
    }
  }

  const uniqueParagraphs = [
    ...new Set(paragraphs),
  ];

  if (uniqueParagraphs.length > 0) {
    return uniqueParagraphs.join("\n\n");
  }

  return cleanText(source);
}

function extractImageUrl(html: string): string {
  const ogImage = extractMeta(
    html,
    "property",
    "og:image"
  );

  if (ogImage) {
    return absoluteUrl(ogImage);
  }

  const twitterImage = extractMeta(
    html,
    "name",
    "twitter:image"
  );

  if (twitterImage) {
    return absoluteUrl(twitterImage);
  }

  const imageMatch = html.match(
    /<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/i
  );

  return imageMatch?.[1]
    ? absoluteUrl(
        decodeHtml(imageMatch[1])
      )
    : "";
}

function extractVideoUrl(html: string): string {
  const ogVideo = extractMeta(
    html,
    "property",
    "og:video"
  );

  if (ogVideo) {
    return absoluteUrl(ogVideo);
  }

  const videoTag = html.match(
    /<video[^>]*>[\s\S]*?<source[^>]+src=["']([^"']+)["']/i
  );

  if (videoTag?.[1]) {
    return absoluteUrl(
      decodeHtml(videoTag[1])
    );
  }

  const sourceTag = html.match(
    /<source[^>]+src=["']([^"']+)["'][^>]*>/i
  );

  return sourceTag?.[1]
    ? absoluteUrl(
        decodeHtml(sourceTag[1])
      )
    : "";
}

function extractCandidateLinks(
  html: string
): string[] {
  const links: string[] = [];

  const regex =
    /<a\b[^>]+href\s*=\s*["']([^"']+)["'][^>]*>/gi;

  let match: RegExpExecArray | null;

  while (
    (match = regex.exec(html)) !== null
  ) {
    const url = absoluteUrl(
      decodeHtml(match[1])
    );

    if (!url) {
      continue;
    }

    if (!isKargozinUrl(url)) {
      continue;
    }

    if (isClearlyNonArticleUrl(url)) {
      continue;
    }

    links.push(url);
  }

  return [
    ...new Set(links),
  ];
}

function looksLikeArticleLink(
  urlString: string,
  html: string
): boolean {
  try {
    const url = new URL(urlString);
    const path = url.pathname;

    if (path === "/" || path.length < 5) {
      return false;
    }

    if (
      path.match(
        /^\/(?:category|tag|author|page|search)\b/i
      )
    ) {
      return false;
    }

    if (
      path.match(
        /\.(?:jpg|jpeg|png|gif|webp|mp4|webm|pdf|zip)$/i
      )
    ) {
      return false;
    }

    const escaped = urlString.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    const linkRegex = new RegExp(
      `<a\\b[^>]+href=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/a>`,
      "i"
    );

    const match = html.match(
      linkRegex
    );

    const linkText = match?.[1]
      ? cleanText(
          decodeHtml(match[1])
        )
      : "";

    if (
      isAdvertisingText(linkText)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function fetchArticle(
  url: string
): Promise<Article | null> {
  try {
    const response =
      await fetchWithTimeout(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; SedayeSmart-Kargozin/1.0)",
          Accept:
            "text/html,application/xhtml+xml",
        },
        cache: "no-store",
      });

    if (!response.ok) {
      return null;
    }

    const html =
      await response.text();

    const title =
      extractTitle(html);

    if (
      !title ||
      isAdvertisingText(title)
    ) {
      return null;
    }

    const content =
      extractMainContent(html);

    if (
      !content ||
      content.length < 40 ||
      isAdvertisingText(
        `${title} ${content.slice(0, 1500)}`
      )
    ) {
      return null;
    }

    const imageUrl =
      extractImageUrl(html);

    const videoUrl =
      extractVideoUrl(html);

    return {
      url,
      title,
      content:
        content.slice(
          0,
          MAX_CONTENT_LENGTH
        ),
      imageUrl:
        imageUrl || undefined,
      videoUrl:
        videoUrl || undefined,
    };
  } catch (error) {
    console.error(
      "[kargozin] article fetch error:",
      url,
      error
    );

    return null;
  }
}

function getSupabaseConfig(
  env: CloudflareEnv
) {
  return {
    url:
      env.NEXT_PUBLIC_SUPABASE_URL,
    key:
      env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function getScheduleEnabled(
  env: CloudflareEnv
): Promise<boolean> {
  const { url, key } =
    getSupabaseConfig(env);

  if (!url || !key) {
    throw new Error(
      "Supabase configuration is missing"
    );
  }

  const endpoint =
    `${url}/rest/v1/settings` +
    `?key=eq.${encodeURIComponent(
      "schedule_kargozin"
    )}` +
    "&select=value" +
    "&limit=1";

  const response =
    await fetchWithTimeout(
      endpoint,
      {
        headers: {
          apikey: key,
          Authorization:
            `Bearer ${key}`,
          Accept:
            "application/json",
        },
        cache: "no-store",
      }
    );

  if (!response.ok) {
    throw new Error(
      `Supabase schedule GET failed: HTTP ${response.status}`
    );
  }

  const rows =
    await response.json();

  if (
    !Array.isArray(rows) ||
    rows.length === 0
  ) {
    return true;
  }

  return rows[0]?.value !== "false";
}

async function getSeenUrls(
  env: CloudflareEnv
): Promise<string[]> {
  const { url, key } =
    getSupabaseConfig(env);

  if (!url || !key) {
    throw new Error(
      "Supabase configuration is missing"
    );
  }

  const endpoint =
    `${url}/rest/v1/settings` +
    `?key=eq.${encodeURIComponent(
      SETTINGS_KEY
    )}` +
    "&select=value" +
    "&limit=1";

  const response =
    await fetchWithTimeout(
      endpoint,
      {
        headers: {
          apikey: key,
          Authorization:
            `Bearer ${key}`,
          Accept:
            "application/json",
        },
        cache: "no-store",
      }
    );

  if (!response.ok) {
    throw new Error(
      `Supabase GET failed: HTTP ${response.status}`
    );
  }

  const rows =
    await response.json();

  if (
    !Array.isArray(rows) ||
    rows.length === 0
  ) {
    return [];
  }

  const value =
    rows[0]?.value;

  if (
    Array.isArray(value)
  ) {
    return value.filter(
      (item) =>
        typeof item === "string"
    );
  }

  if (
    typeof value === "string"
  ) {
    try {
      const parsed =
        JSON.parse(value);

      if (
        Array.isArray(parsed)
      ) {
        return parsed.filter(
          (item) =>
            typeof item === "string"
        );
      }
    } catch {
      return value
        ? [value]
        : [];
    }
  }

  return [];
}

async function saveSeenUrls(
  env: CloudflareEnv,
  urls: string[]
): Promise<void> {
  const { url, key } =
    getSupabaseConfig(env);

  if (!url || !key) {
    throw new Error(
      "Supabase configuration is missing"
    );
  }

  const uniqueUrls = [
    ...new Set(urls),
  ];

  const endpoint =
    `${url}/rest/v1/settings`;

  const response =
    await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization:
            `Bearer ${key}`,
          "Content-Type":
            "application/json",
          Prefer:
            "resolution=merge-duplicates,return=minimal",
        },
        body:
          JSON.stringify({
            key: SETTINGS_KEY,
            value: uniqueUrls,
          }),
      }
    );

  if (!response.ok) {
    throw new Error(
      `Supabase UPSERT failed: HTTP ${response.status}`
    );
  }
}

function buildMessage(
  article: Article
): string {
  return [
    NOTICE,
    "",
    `📰 ${article.title}`,
    "",
    article.content,
    "",
    "🔗 منبع:",
    article.url,
  ].join("\n");
}

function buildMediaCaption(
  article: Article
): string {
  const title =
    `📰 ${article.title}`;

  return [
    NOTICE,
    "",
    title,
    "",
    `🔗 ${article.url}`,
  ].join("\n").slice(0, 1000);
}

async function baleRequest(
  env: CloudflareEnv,
  method: string,
  payload: Record<string, unknown>
): Promise<unknown> {
  const token =
    env.BALE_SMART_TOKEN;

  if (!token) {
    throw new Error(
      "BALE_SMART_TOKEN is missing"
    );
  }

  const response =
    await fetch(
      `https://tapi.bale.ai/bot${token}/${method}`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body:
          JSON.stringify(payload),
      }
    );

  const data =
    await response.json();

  if (
    !response.ok ||
    data?.ok === false
  ) {
    throw new Error(
      `Bale ${method} failed: ${JSON.stringify(
        data
      )}`
    );
  }

  return data;
}

async function sendText(
  env: CloudflareEnv,
  text: string
): Promise<void> {
  const chatId =
    env.BALE_GROUP_ID;

  if (!chatId) {
    throw new Error(
      "BALE_GROUP_ID is missing"
    );
  }

  await baleRequest(
    env,
    "sendMessage",
    {
      chat_id: chatId,
      text,
      disable_web_page_preview:
        false,
    }
  );
}

async function sendPhoto(
  env: CloudflareEnv,
  photoUrl: string,
  caption: string
): Promise<void> {
  const chatId =
    env.BALE_GROUP_ID;

  if (!chatId) {
    throw new Error(
      "BALE_GROUP_ID is missing"
    );
  }

  await baleRequest(
    env,
    "sendPhoto",
    {
      chat_id: chatId,
      photo: photoUrl,
      caption,
    }
  );
}

async function sendVideo(
  env: CloudflareEnv,
  videoUrl: string,
  caption: string
): Promise<void> {
  const chatId =
    env.BALE_GROUP_ID;

  if (!chatId) {
    throw new Error(
      "BALE_GROUP_ID is missing"
    );
  }

  await baleRequest(
    env,
    "sendVideo",
    {
      chat_id: chatId,
      video: videoUrl,
      caption,
    }
  );
}

async function sendArticle(
  env: CloudflareEnv,
  article: Article
): Promise<MediaResult> {
  /*
   * اگر ویدئو وجود داشته باشد،
   * ابتدا ویدئو با پیام آغازین ارسال می‌شود
   * و سپس متن کامل مقاله ارسال می‌شود.
   */
  if (article.videoUrl) {
    try {
      await sendVideo(
        env,
        article.videoUrl,
        buildMediaCaption(article)
      );

      await sendText(
        env,
        buildMessage(article)
      );

      return {
        sent: true,
        type: "video",
      };
    } catch (error) {
      console.error(
        "[kargozin] video send failed, falling back:",
        error
      );
    }
  }

  /*
   * اگر تصویر وجود داشته باشد،
   * ابتدا تصویر و سپس متن کامل مقاله ارسال می‌شود.
   */
  if (article.imageUrl) {
    try {
      await sendPhoto(
        env,
        article.imageUrl,
        buildMediaCaption(article)
      );

      await sendText(
        env,
        buildMessage(article)
      );

      return {
        sent: true,
        type: "photo",
      };
    } catch (error) {
      console.error(
        "[kargozin] photo send failed, falling back:",
        error
      );
    }
  }

  await sendText(
    env,
    buildMessage(article)
  );

  return {
    sent: true,
    type: "text",
  };
}

async function discoverArticles(): Promise<{
  links: string[];
  html: string;
}> {
  const response =
    await fetchWithTimeout(
      SOURCE_URL,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; SedayeSmart-Kargozin/1.0)",
          Accept:
            "text/html,application/xhtml+xml",
        },
        cache: "no-store",
      }
    );

  if (!response.ok) {
    throw new Error(
      `Kargozin homepage failed: HTTP ${response.status}`
    );
  }

  const html =
    await response.text();

  const rawLinks =
    extractCandidateLinks(html);

  const links =
    rawLinks.filter(
      (url) =>
        looksLikeArticleLink(
          url,
          html
        )
    );

  return {
    links: [
      ...new Set(links),
    ],
    html,
  };
}

async function initializeBaseline(
  env: CloudflareEnv,
  links: string[]
): Promise<void> {
  /*
   * اولین اجرا فقط وضعیت فعلی سایت را ثبت می‌کند.
   * بنابراین مطالب قدیمی یکباره وارد گروه نمی‌شوند.
   */
  const limited =
    links.slice(0, 200);

  await saveSeenUrls(
    env,
    limited
  );
}

export async function GET(
  _request: Request
) {
  const startedAt =
    Date.now();

  try {
    const { env } =
      await getCloudflareContext({
        async: true,
      });

    /*
     * وضعیت روشن/خاموش مجله کارگزینی
     * از تنظیمات Supabase خوانده می‌شود.
     *
     * اگر این تنظیم وجود نداشته باشد،
     * مقدار پیش‌فرض true است تا قابلیت فعلی
     * بدون تغییر ادامه پیدا کند.
     *
     * وقتی خاموش باشد، Cron همچنان اجرا می‌شود
     * اما هیچ مطلبی بررسی یا ارسال نمی‌شود.
     */
    const scheduleEnabled =
      await getScheduleEnabled(env);

    if (!scheduleEnabled) {
      return NextResponse.json({
        ok: true,
        enabled: false,
        sent: 0,
        reason:
          "kargozin_disabled",
        runtime_ms:
          Date.now() -
          startedAt,
      });
    }

    const seen =
      await getSeenUrls(env);

    const seenSet =
      new Set(seen);

    const discovered =
      await discoverArticles();

    const links =
      discovered.links;

    /*
     * اولین اجرا:
     * فقط baseline ذخیره می‌شود.
     */
    if (seen.length === 0) {
      await initializeBaseline(
        env,
        links
      );

      return NextResponse.json({
        ok: true,
        initialized: true,
        sent: 0,
        reason:
          "baseline_created",
        discovered: links.length,
        runtime_ms:
          Date.now() -
          startedAt,
      });
    }

    /*
     * فقط لینک‌هایی که قبلاً ارسال نشده‌اند.
     */
    const newLinks =
      links.filter(
        (url) =>
          !seenSet.has(url)
      );

    /*
     * جدیدترین لینک‌های پیدا شده
     * بررسی می‌شوند.
     */
    const candidates =
      newLinks.slice(
        0,
        MAX_ARTICLES_PER_RUN
      );

    const sentArticles: string[] = [];
    const failedArticles: string[] = [];

    for (const url of candidates) {
      const article =
        await fetchArticle(url);

      /*
       * اگر صفحه تبلیغاتی یا نامعتبر باشد،
       * آن را ارسال نمی‌کنیم.
       */
      if (!article) {
        continue;
      }

      try {
        await sendArticle(
          env,
          article
        );

        sentArticles.push(
          article.url
        );
      } catch (error) {
        console.error(
          "[kargozin] send failed:",
          article.url,
          error
        );

        /*
         * در صورت شکست، URL در seen ثبت نمی‌شود
         * تا اجرای دقیقه بعد دوباره تلاش کند.
         */
        failedArticles.push(
          article.url
        );
      }
    }

    /*
     * فقط مواردی که با موفقیت ارسال شده‌اند
     * به لیست seen اضافه می‌شوند.
     */
    const updatedSeen = [
      ...seen,
      ...sentArticles,
    ];

    /*
     * برای جلوگیری از رشد بی‌نهایت تنظیمات،
     * آخرین 1000 لینک نگهداری می‌شود.
     */
    const compactSeen =
      updatedSeen.slice(-1000);

    if (
      sentArticles.length > 0
    ) {
      await saveSeenUrls(
        env,
        compactSeen
      );
    }

    return NextResponse.json({
      ok: true,
      initialized: false,
      sent:
        sentArticles.length,
      failed:
        failedArticles.length,
      discovered:
        links.length,
      new_candidates:
        newLinks.length,
      sent_urls:
        sentArticles,
      failed_urls:
        failedArticles,
      checked:
        candidates.length,
      runtime_ms:
        Date.now() -
        startedAt,
    });
  } catch (error) {
    console.error(
      "[kargozin] route error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        sent: 0,
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

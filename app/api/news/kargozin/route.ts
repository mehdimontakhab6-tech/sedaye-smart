
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

function decodeHtml(value: string): string {
  return String(value || "")
    .replace(/<!\[CDATA\[/gi, "")
    .replace(/\]\]>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCharCode(Number(n))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCharCode(parseInt(n, 16))
    );
}

function cleanText(value: string): string {
  return decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(value: string): string {
  try {
    return new URL(value, SOURCE_URL).toString();
  } catch {
    return "";
  }
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();

    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "ref",
    ];

    for (const param of trackingParams) {
      url.searchParams.delete(param);
    }

    if (
      url.pathname.length > 1 &&
      url.pathname.endsWith("/")
    ) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    url.searchParams.sort();

    return url.toString();
  } catch {
    return value;
  }
}

function isKargozinUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (
        url.hostname === "kargozin.com" ||
        url.hostname === "www.kargozin.com"
      )
    );
  } catch {
    return false;
  }
}

function isClearlyNonArticleUrl(value: string): boolean {
  try {
    const url = new URL(value);
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

    if (blockedPaths.some((item) => path.includes(item))) {
      return true;
    }

    return /\.(jpg|jpeg|png|gif|webp|svg|mp4|webm|pdf|zip|rar|docx?|xlsx?)$/i.test(path);
  } catch {
    return true;
  }
}

function isAdvertisingText(value: string): boolean {
  const text = cleanText(value).toLowerCase();

  const blockedTerms = [
    "sponsored",
    "advertorial",
    "advertisement",
    "تبلیغات",
    "تبلیغاتی",
    "رپورتاژ",
    "رپورتاژ آگهی",
    "اسپانسر",
    "خرید آنلاین",
    "فروشگاه",
    "فروش ویژه",
    "کد تخفیف",
    "ثبت سفارش",
    "سفارش آنلاین",
    "همین حالا بخرید",
  ];

  return blockedTerms.some((term) => text.includes(term));
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
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SedayeSmart-Kargozin/2.0)",
        Accept:
          "text/html,application/xhtml+xml,application/xml,text/xml,application/rss+xml,*/*",
        ...init.headers,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function extractAttribute(
  tag: string,
  attribute: string
): string {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `${escaped}\\s*=\\s*["']([^"']+)["']`,
    "i"
  );
  const match = tag.match(regex);
  return match?.[1] ? decodeHtml(match[1]) : "";
}

function extractMeta(
  html: string,
  attribute: string,
  value: string
): string {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `<meta\\b[^>]*${attribute}\\s*=\\s*["']${escaped}["'][^>]*>`,
    "i"
  );
  const match = html.match(regex);
  return match ? extractAttribute(match[0], "content") : "";
}

function extractTitle(html: string): string {
  const ogTitle = extractMeta(html, "property", "og:title");
  if (ogTitle) return cleanText(ogTitle);

  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1?.[1]) return cleanText(h1[1]);

  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return title?.[1] ? cleanText(title[1]) : "";
}

function extractMainContent(html: string): string {
  const candidates: string[] = [];

  candidates.push(
    ...(html.match(/<article\b[^>]*>[\s\S]*?<\/article>/gi) || [])
  );

  candidates.push(
    ...(html.match(/<main\b[^>]*>[\s\S]*?<\/main>/gi) || [])
  );

  candidates.push(
    ...(html.match(
      /<(?:div|section)\b[^>]+class=["'][^"']*(?:entry-content|post-content|article-content|single-content|content-area)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section)>/gi
    ) || [])
  );

  candidates.sort((a, b) => b.length - a.length);
  const source = candidates[0] || html;

  const paragraphs: string[] = [];
  const paragraphRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;

  while ((match = paragraphRegex.exec(source)) !== null) {
    const paragraph = cleanText(match[1]);

    if (
      paragraph.length >= 20 &&
      !isAdvertisingText(paragraph)
    ) {
      paragraphs.push(paragraph);
    }
  }

  const uniqueParagraphs = [...new Set(paragraphs)];

  if (uniqueParagraphs.length > 0) {
    return uniqueParagraphs.join("\n\n");
  }

  return cleanText(source);
}

function extractImageUrl(html: string): string {
  const ogImage = extractMeta(html, "property", "og:image");
  if (ogImage) return absoluteUrl(ogImage);

  const twitterImage = extractMeta(html, "name", "twitter:image");
  if (twitterImage) return absoluteUrl(twitterImage);

  const imageMatch = html.match(
    /<img\b[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/i
  );

  return imageMatch?.[1] ? absoluteUrl(imageMatch[1]) : "";
}

function extractVideoUrl(html: string): string {
  const ogVideo = extractMeta(html, "property", "og:video");
  if (ogVideo) return absoluteUrl(ogVideo);

  const videoMatch = html.match(
    /<video\b[^>]*>[\s\S]*?<source\b[^>]+src=["']([^"']+)["']/i
  );

  if (videoMatch?.[1]) return absoluteUrl(videoMatch[1]);

  const sourceMatch = html.match(
    /<source\b[^>]+src=["']([^"']+)["'][^>]*>/i
  );

  return sourceMatch?.[1] ? absoluteUrl(sourceMatch[1]) : "";
}

function looksLikeArticleLink(value: string): boolean {
  try {
    const url = new URL(value);
    const path = url.pathname;

    if (path === "/" || path.length < 5) return false;
    if (!isKargozinUrl(url.toString())) return false;
    if (isClearlyNonArticleUrl(url.toString())) return false;

    if (
      /^\/(?:category|tag|author|page|search|wp-json)\b/i.test(path)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function extractHomepageLinks(html: string): string[] {
  const links: string[] = [];
  const regex = /<a\b[^>]+href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    const url = absoluteUrl(match[1]);

    if (url && looksLikeArticleLink(url)) {
      links.push(normalizeUrl(url));
    }
  }

  return [...new Set(links)];
}

function extractFeedLinks(xml: string): string[] {
  const links: string[] = [];
  const itemRegex =
    /<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;

  let item: RegExpExecArray | null;

  while ((item = itemRegex.exec(xml)) !== null) {
    const block = item[1];
    const linkTag = block.match(/<link\b[^>]*\/?>/i);
    let link = "";

    if (linkTag) {
      link =
        extractAttribute(linkTag[0], "href") ||
        cleanText(
          linkTag[0].replace(/<\/?link\b[^>]*>/gi, "")
        );
    }

    if (!link) {
      const guid = block.match(
        /<guid\b[^>]*>([\s\S]*?)<\/guid>/i
      );

      if (
        guid?.[1] &&
        /^https?:\/\//i.test(cleanText(guid[1]))
      ) {
        link = cleanText(guid[1]);
      }
    }

    const url = absoluteUrl(link);

    if (url && looksLikeArticleLink(url)) {
      links.push(normalizeUrl(url));
    }
  }

  return [...new Set(links)];
}

function extractSitemapLinks(xml: string): string[] {
  const links: string[] = [];
  const regex = /<loc\b[^>]*>([\s\S]*?)<\/loc>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(xml)) !== null) {
    const url = absoluteUrl(cleanText(match[1]));

    if (url && looksLikeArticleLink(url)) {
      links.push(normalizeUrl(url));
    }
  }

  return [...new Set(links)];
}

async function fetchOptionalText(url: string): Promise<string> {
  try {
    const response = await fetchWithTimeout(url);

    if (!response.ok) return "";

    return await response.text();
  } catch (error) {
    console.warn(
      "[kargozin] optional source unavailable:",
      url,
      error
    );
    return "";
  }
}

async function discoverArticles(): Promise<string[]> {
  const homepageResponse = await fetchWithTimeout(SOURCE_URL);

  if (!homepageResponse.ok) {
    throw new Error(
      `Kargozin homepage failed: HTTP ${homepageResponse.status}`
    );
  }

  const homepageHtml = await homepageResponse.text();

  const [feedXml, sitemapXml, wpSitemapXml] = await Promise.all([
    fetchOptionalText("https://kargozin.com/feed/"),
    fetchOptionalText("https://kargozin.com/sitemap.xml"),
    fetchOptionalText(
      "https://kargozin.com/wp-sitemap-posts-post-1.xml"
    ),
  ]);

  const feedLinks = extractFeedLinks(feedXml);
  const sitemapLinks = extractSitemapLinks(sitemapXml);
  const wpSitemapLinks = extractSitemapLinks(wpSitemapXml);
  const homepageLinks = extractHomepageLinks(homepageHtml);

  return [
    ...new Set([
      ...feedLinks,
      ...wpSitemapLinks,
      ...sitemapLinks,
      ...homepageLinks,
    ]),
  ];
}

async function fetchArticle(url: string): Promise<Article | null> {
  try {
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      console.warn(
        "[kargozin] article HTTP error:",
        url,
        response.status
      );
      return null;
    }

    const html = await response.text();
    const title = extractTitle(html);

    if (!title || isAdvertisingText(title)) return null;

    const content = extractMainContent(html);

    if (
      !content ||
      content.length < 40 ||
      isAdvertisingText(`${title} ${content.slice(0, 1500)}`)
    ) {
      return null;
    }

    return {
      url,
      title,
      content: content.slice(0, MAX_CONTENT_LENGTH),
      imageUrl: extractImageUrl(html) || undefined,
      videoUrl: extractVideoUrl(html) || undefined,
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

function getSupabaseConfig(env: CloudflareEnv) {
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, ""),
    key: env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  };
}

/**
 * برای کلیدهای جدید sb_secret_ فقط apikey ارسال می‌شود.
 * درخواست‌های Supabase از User-Agent اختصاصی Worker استفاده می‌کنند.
 */
async function getSetting(
  env: CloudflareEnv,
  settingKey: string
): Promise<unknown> {
  const { url, key } = getSupabaseConfig(env);

  if (!url || !key) {
    throw new Error("Supabase configuration is missing");
  }

  const endpoint =
    `${url}/rest/v1/settings` +
    `?key=eq.${encodeURIComponent(settingKey)}` +
    "&select=value&limit=1";

  const response = await fetchWithTimeout(endpoint, {
    headers: {
      apikey: key,
      Accept: "application/json",
      "User-Agent": "sedaye-smart-worker/1.0",
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(
      "[kargozin] Supabase GET error:",
      response.status,
      detail.slice(0, 500)
    );

    throw new Error(
      `Supabase GET failed: HTTP ${response.status}`
    );
  }

  const rows: unknown = await response.json();

  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return rows[0]?.value ?? null;
}

async function getScheduleEnabled(
  env: CloudflareEnv
): Promise<boolean> {
  const value = await getSetting(env, "schedule_kargozin");

  if (value === false || value === "false") return false;

  if (typeof value === "string") {
    try {
      if (JSON.parse(value) === false) return false;
    } catch {
      // اگر مقدار رشته‌ای دیگری باشد، فعال فرض می‌شود.
    }
  }

  return true;
}

async function getSeenUrls(
  env: CloudflareEnv
): Promise<string[]> {
  const value = await getSetting(env, SETTINGS_KEY);

  let parsed: unknown = value;

  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = value ? [value] : [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed.filter(
    (item): item is string => typeof item === "string"
  );
}

async function saveSeenUrls(
  env: CloudflareEnv,
  urls: string[]
): Promise<void> {
  const { url, key } = getSupabaseConfig(env);

  if (!url || !key) {
    throw new Error("Supabase configuration is missing");
  }

  const uniqueUrls = [...new Set(urls)].slice(-1000);

  const response = await fetchWithTimeout(
    `${url}/rest/v1/settings`,
    {
      method: "POST",
      headers: {
        apikey: key,
        "User-Agent": "sedaye-smart-worker/1.0",
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        key: SETTINGS_KEY,
        value: uniqueUrls,
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(
      "[kargozin] Supabase UPSERT error:",
      response.status,
      detail.slice(0, 500)
    );

    throw new Error(
      `Supabase UPSERT failed: HTTP ${response.status}`
    );
  }
}

function buildMessage(article: Article): string {
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

function buildMediaCaption(article: Article): string {
  return [
    NOTICE,
    "",
    `📰 ${article.title}`,
    "",
    `🔗 ${article.url}`,
  ].join("\n").slice(0, 1000);
}

async function baleRequest(
  env: CloudflareEnv,
  method: string,
  payload: Record<string, unknown>
): Promise<unknown> {
  const token = env.BALE_SMART_TOKEN;

  if (!token) {
    throw new Error("BALE_SMART_TOKEN is missing");
  }

  const response = await fetch(
    `https://tapi.bale.ai/bot${token}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json();

  if (
    !response.ok ||
    (data as { ok?: boolean })?.ok === false
  ) {
    throw new Error(
      `Bale ${method} failed: ${JSON.stringify(data)}`
    );
  }

  return data;
}

async function sendText(
  env: CloudflareEnv,
  text: string
): Promise<void> {
  const chatId = env.BALE_GROUP_ID;

  if (!chatId) {
    throw new Error("BALE_GROUP_ID is missing");
  }

  const chunks: string[] = [];
  const maxLength = 3500;

  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.slice(i, i + maxLength));
  }

  for (const chunk of chunks) {
    await baleRequest(env, "sendMessage", {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: false,
    });
  }
}

async function sendPhoto(
  env: CloudflareEnv,
  photoUrl: string,
  caption: string
): Promise<void> {
  const chatId = env.BALE_GROUP_ID;

  if (!chatId) {
    throw new Error("BALE_GROUP_ID is missing");
  }

  await baleRequest(env, "sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    caption,
  });
}

async function sendVideo(
  env: CloudflareEnv,
  videoUrl: string,
  caption: string
): Promise<void> {
  const chatId = env.BALE_GROUP_ID;

  if (!chatId) {
    throw new Error("BALE_GROUP_ID is missing");
  }

  await baleRequest(env, "sendVideo", {
    chat_id: chatId,
    video: videoUrl,
    caption,
  });
}

async function sendArticle(
  env: CloudflareEnv,
  article: Article
): Promise<void> {
  const caption = buildMediaCaption(article);
  const message = buildMessage(article);

  if (article.videoUrl) {
    try {
      await sendVideo(env, article.videoUrl, caption);
      await sendText(env, message);
      return;
    } catch (error) {
      console.warn("[kargozin] video send failed:", error);
    }
  }

  if (article.imageUrl) {
    try {
      await sendPhoto(env, article.imageUrl, caption);
      await sendText(env, message);
      return;
    } catch (error) {
      console.warn("[kargozin] photo send failed:", error);
    }
  }

  await sendText(env, message);
}

async function initializeBaseline(
  env: CloudflareEnv,
  links: string[]
): Promise<void> {
  // در اولین اجرا، خبرهای فعلی فقط ثبت می‌شوند و ارسال نمی‌شوند.
  await saveSeenUrls(env, links.slice(0, 200));
}

export async function GET(_request: Request) {
  const startedAt = Date.now();

  try {
    const { env } = await getCloudflareContext({ async: true });

    const scheduleEnabled = await getScheduleEnabled(env);

    if (!scheduleEnabled) {
      return NextResponse.json({
        ok: true,
        enabled: false,
        sent: 0,
        reason: "kargozin_disabled",
        runtime_ms: Date.now() - startedAt,
      });
    }

    const [seen, links] = await Promise.all([
      getSeenUrls(env),
      discoverArticles(),
    ]);

    if (seen.length === 0) {
      await initializeBaseline(env, links);

      return NextResponse.json({
        ok: true,
        initialized: true,
        sent: 0,
        reason: "baseline_created",
        discovered: links.length,
        runtime_ms: Date.now() - startedAt,
      });
    }

    const seenKeys = new Set(seen.map(normalizeUrl));

    const newLinks = links.filter(
      (url) => !seenKeys.has(normalizeUrl(url))
    );

    const candidates = newLinks.slice(0, MAX_ARTICLES_PER_RUN);
    const sentArticles: string[] = [];
    const failedArticles: string[] = [];
    const skippedArticles: string[] = [];

    for (const url of candidates) {
      const article = await fetchArticle(url);

      if (!article) {
        skippedArticles.push(url);
        continue;
      }

      try {
        await sendArticle(env, article);
        sentArticles.push(normalizeUrl(article.url));
      } catch (error) {
        console.error(
          "[kargozin] send failed:",
          article.url,
          error
        );
        failedArticles.push(article.url);
      }
    }

    if (sentArticles.length > 0) {
      await saveSeenUrls(env, [...seen, ...sentArticles]);
    }

    return NextResponse.json({
      ok: true,
      initialized: false,
      sent: sentArticles.length,
      failed: failedArticles.length,
      skipped: skippedArticles.length,
      discovered: links.length,
      new_candidates: newLinks.length,
      sent_urls: sentArticles,
      failed_urls: failedArticles,
      skipped_urls: skippedArticles,
      checked: candidates.length,
      sources_checked: [
        "https://kargozin.com/feed/",
        "https://kargozin.com/sitemap.xml",
        "https://kargozin.com/wp-sitemap-posts-post-1.xml",
        SOURCE_URL,
      ],
      runtime_ms: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("[kargozin] route error:", error);

    return NextResponse.json(
      {
        ok: false,
        sent: 0,
        error:
          error instanceof Error
            ? error.message
            : String(error),
        runtime_ms: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}

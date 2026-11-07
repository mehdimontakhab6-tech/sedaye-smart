import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createElement as h } from "react";
import { satori } from "@cf-wasm/satori";
import { Resvg } from "@cf-wasm/resvg";

export const dynamic = "force-dynamic";

const SOURCE_URL = "https://t.me/s/kargozinonline";

const SETTINGS_KEY = "kargozin_telegram_seen_posts";
const SCHEDULE_KEY = "schedule_kargozin";
const STATE_KEY = "kargozin_telegram_state";

const MAX_SEEN_IDS = 1500;
const MIN_SEND_INTERVAL_MS = 20 * 60 * 1000;

const TEHRAN_TIME_ZONE = "Asia/Tehran";
const SEND_START_MINUTES = 8 * 60 + 5;
const SEND_END_MINUTES = 23 * 60;

const NOTICE = "🔴 نبض خبر";

// محدودیت‌های محافظه‌کارانه برای ارسال
const PHOTO_CAPTION_LIMIT = 1024;
const TEXT_MESSAGE_LIMIT = 4000;

// ابعاد قالب ثابت تصویر
const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 630;

// فونت فارسی
const FONT_URL =
  "https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/fonts/ttf/Vazirmatn[wght].ttf";

type TelegramPost = {
  id: string;
  url: string;
  text: string;
};

type QueuedPost = TelegramPost;

type KargozinState = {
  version: 1;
  initialized: boolean;
  seenIds: string[];
  queue: QueuedPost[];
  lastSentAt: string | null;
};

type Env = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  BALE_SMART_TOKEN?: string;
  BALE_GROUP_ID?: string;
};

let cachedFont: ArrayBuffer | null = null;
let fontPromise: Promise<ArrayBuffer> | null = null;

// --------------------------------------------------
// HTML helpers
// --------------------------------------------------

function decodeHtml(value: string): string {
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    zwnj: "\u200c",
    ndash: "–",
    mdash: "—",
    hellip: "…",
    laquo: "«",
    raquo: "»",
  };

  return value.replace(
    /&(#x[\da-f]+|#\d+|[a-z]+);/gi,
    (match, entity: string) => {
      if (entity.startsWith("#")) {
        const hex = entity[1]?.toLowerCase() === "x";
        const code = parseInt(
          entity.slice(hex ? 2 : 1),
          hex ? 16 : 10,
        );

        if (
          !Number.isFinite(code) ||
          code < 0 ||
          code > 0x10ffff ||
          (code >= 0xd800 && code <= 0xdfff)
        ) {
          return match;
        }

        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }

      return entities[entity.toLowerCase()] ?? match;
    },
  );
}

function hasClass(tag: string, className: string): boolean {
  const match = tag.match(/\bclass\s*=\s*(["'])(.*?)\1/i);

  if (!match) return false;

  return match[2]
    .split(/\s+/)
    .some((name) => name === className);
}

function findDivEnd(
  html: string,
  contentStart: number,
): number {
  const tags = /<\/?div\b[^>]*>/gi;
  tags.lastIndex = contentStart;

  let depth = 1;
  let match: RegExpExecArray | null;

  while ((match = tags.exec(html)) !== null) {
    if (/^<\/div/i.test(match[0])) {
      depth--;

      if (depth === 0) {
        return tags.lastIndex;
      }
    } else if (!/\/\s*>$/.test(match[0])) {
      depth++;
    }
  }

  return -1;
}

function extractDivInnerByClass(
  html: string,
  className: string,
): string | null {
  const tags = /<div\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = tags.exec(html)) !== null) {
    if (!hasClass(match[0], className)) continue;

    const contentStart = tags.lastIndex;
    const end = findDivEnd(html, contentStart);

    if (end < 0) return null;

    return html
      .slice(contentStart, end)
      .replace(/<\/div>\s*$/i, "");
  }

  return null;
}

function removeDivElementsByClass(
  html: string,
  classNames: string[],
): string {
  let result = html;

  for (const className of classNames) {
    for (let attempt = 0; attempt < 50; attempt++) {
      const tags = /<div\b[^>]*>/gi;
      let match: RegExpExecArray | null;
      let removed = false;

      while ((match = tags.exec(result)) !== null) {
        if (!hasClass(match[0], className)) continue;

        const start = match.index;
        const contentStart = tags.lastIndex;
        const end = findDivEnd(result, contentStart);

        if (end < 0) {
          return result;
        }

        result =
          result.slice(0, start) +
          result.slice(end);

        removed = true;
        break;
      }

      if (!removed) break;
    }
  }

  return result;
}

const REPLY_CLASSES = [
  "tgme_widget_message_reply",
  "tgme_widget_message_text_reply",
  "tgme_widget_message_reply_text",
  "tgme_widget_message_reply_quote",
];

function removeReplyElements(html: string): string {
  return removeDivElementsByClass(html, REPLY_CLASSES);
}

function isReplyPost(block: string): boolean {
  const tags = /<[a-z][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = tags.exec(block)) !== null) {
    for (const className of REPLY_CLASSES) {
      if (hasClass(match[0], className)) {
        return true;
      }
    }
  }

  return false;
}

function isServicePost(block: string): boolean {
  const tags = /<[a-z][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = tags.exec(block)) !== null) {
    if (hasClass(match[0], "service_message")) {
      return true;
    }
  }

  return false;
}

function htmlToText(html: string): string {
  return decodeHtml(
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(
        /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
        (match, attributes: string, inner: string) => {
          const hrefMatch = attributes.match(
            /\bhref\s*=\s*(["'])(.*?)\1/i,
          );

          if (!hrefMatch) return inner;

          const href = decodeHtml(hrefMatch[2]).trim();
          const linkText = decodeHtml(
            inner.replace(/<[^>]*>/g, ""),
          ).trim();

          if (!/^https?:\/\//i.test(href)) {
            return inner;
          }

          if (linkText.includes(href)) {
            return inner;
          }

          return `${inner}\n${href}`;
        },
      )
      .replace(/<br\b[^>]*>/gi, "\n")
      .replace(/<\/(?:p|div|li|blockquote|h[1-6])\s*>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanPostText(input: string): string {
  let text = input
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .trim();

  const separatorIndex = text.indexOf("🔹🔸🔹🔸");

  if (separatorIndex !== -1) {
    text = text.slice(0, separatorIndex);
  }

  const footerMarkers = [
    /با\s*[\(（]?\s*کانال\s*[\)）]?\s*کارگزین\s*آنلاین\s*به\s*روز\s*باشید/i,
    /برای\s+سفارش\s+تبلیغات/i,
    /جهت\s+تبلیغات/i,
    /تبلیغات\s+در\s+کانال/i,
    /عضویت\s+در\s+کانال/i,
    /کانال\s+کارگزین\s+آنلاین\s+را\s+دنبال\s+کنید/i,
    /اخبار\s+بیشتر\s+در/i,
    /ما\s+را\s+در\s+(?:تلگرام|بله|ایتا|روبیکا)\s+دنبال\s+کنید/i,
    /تلگرام\s*📍/i,
    /بله\s*📍/i,
    /ایتا\s*📍/i,
    /روبیکا\s*📍/i,
  ];

  let cutAt = text.length;

  for (const marker of footerMarkers) {
    const match = marker.exec(text);

    if (match && match.index < cutAt) {
      cutAt = match.index;
    }
  }

  text = text.slice(0, cutAt);

  text = text
    .replace(
      /(?:^|\n)[ \t\u200c]*(?:(?:🔹|🔸|🔷|🔶|🔴|🔵|⚫️?|⚪️?|♦️?|◆|◇|💠)[ \t\u200c]*)+(?=\n|$)/gu,
      "\n",
    )
    .replace(/(?:^|\n)[ \t\u200c]+(?=\n|$)/g, "\n");

  text = text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

function hasUsefulText(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

function containsMedia(block: string): boolean {
  const mediaPatterns = [
    /\btgme_widget_message_photo_wrap\b/i,
    /\btgme_widget_message_video_player\b/i,
    /\btgme_widget_message_document_wrap\b/i,
    /\btgme_widget_message_voice_player\b/i,
    /\btgme_widget_message_sticker_wrap\b/i,
    /\btgme_widget_message_roundvideo\b/i,
    /\btgme_widget_message_audio_player\b/i,
    /\btgme_widget_message_poll\b/i,
    /<video\b/i,
    /<audio\b/i,
    /<source\b[^>]*\bsrc=/i,
    /\bdata-roundvideo=/i,
    /\bvideo_player\b/i,
    /\bphoto_wrap\b/i,
    /\bsticker_wrap\b/i,
  ];

  return mediaPatterns.some((pattern) => pattern.test(block));
}

function compareIds(
  a: TelegramPost,
  b: TelegramPost,
): number {
  const first = BigInt(a.id);
  const second = BigInt(b.id);

  return first < second ? -1 : first > second ? 1 : 0;
}

function parseTelegramPosts(html: string): TelegramPost[] {
  const posts: TelegramPost[] = [];
  const seenIds = new Set<string>();

  const wrapRegex =
    /<div\b(?=[^>]*\bclass=["'][^"']*\btgme_widget_message_wrap\b)[^>]*>[\s\S]*?(?=<div\b(?=[^>]*\bclass=["'][^"']*\btgme_widget_message_wrap\b)|$)/gi;

  const blocks = html.match(wrapRegex) ?? [];

  for (const block of blocks) {
    const postMatch = block.match(
      /\bdata-post=["']kargozinonline\/(\d+)["']/i,
    );

    if (!postMatch) continue;

    const id = postMatch[1];

    if (isServicePost(block)) continue;
    if (isReplyPost(block)) continue;
    if (seenIds.has(id)) continue;

    seenIds.add(id);

    if (containsMedia(block)) continue;

    const messageHtml = extractDivInnerByClass(
      block,
      "tgme_widget_message_text",
    );

    if (messageHtml === null) continue;

    const mainHtml = removeReplyElements(messageHtml);
    const text = cleanPostText(htmlToText(mainHtml));

    if (!hasUsefulText(text)) continue;

    posts.push({
      id,
      url: `https://t.me/kargozinonline/${id}`,
      text,
    });
  }

  return posts.sort(compareIds);
}

// --------------------------------------------------
// Telegram fetch
// --------------------------------------------------

async function fetchTelegramPosts(): Promise<TelegramPost[]> {
  let response: Response;

  try {
    response = await fetch(SOURCE_URL, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "fa,en-US;q=0.9,en;q=0.8",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : String(error);

    throw new Error(`Telegram fetch failed: ${detail}`);
  }

  if (!response.ok) {
    throw new Error(`Telegram HTTP ${response.status}`);
  }

  const html = await response.text();

  if (!html.trim()) {
    throw new Error("Telegram returned an empty HTML response.");
  }

  const posts = parseTelegramPosts(html);

  if (posts.length === 0) {
    const hasPostIds =
      /\bdata-post=["']kargozinonline\/\d+["']/i.test(html);

    const hasMessageText =
      /\btgme_widget_message_text\b/i.test(html);

    const looksBlocked =
      /captcha|too many requests|access denied|please enable javascript/i.test(
        html,
      );

    throw new Error(
      `No valid text-only posts found. HTTP ${response.status}; ` +
        `htmlLength=${html.length}; ` +
        `hasPostIds=${hasPostIds}; ` +
        `hasMessageText=${hasMessageText}; ` +
        `looksBlocked=${looksBlocked}`,
    );
  }

  return posts;
}

// --------------------------------------------------
// Supabase
// --------------------------------------------------

function getEnv(): Env {
  return getCloudflareContext().env as Env;
}

function getSupabaseConfig(env: Env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment variables are missing.");
  }

  return { url, key };
}

async function supabaseRequest(
  env: Env,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { url, key } = getSupabaseConfig(env);

  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(15000),
  });
}

async function getSetting(
  env: Env,
  key: string,
): Promise<unknown | null> {
  const response = await supabaseRequest(
    env,
    `settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
  );

  if (!response.ok) {
    throw new Error(`Supabase read failed: ${response.status}`);
  }

  const rows = (await response.json()) as Array<{
    value: unknown;
  }>;

  return rows.length ? rows[0].value : null;
}

async function saveSetting(
  env: Env,
  key: string,
  value: unknown,
): Promise<void> {
  const response = await supabaseRequest(
    env,
    "settings?on_conflict=key",
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ key, value }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Supabase write failed: ${response.status} ${await response.text()}`,
    );
  }
}

function isEnabled(value: unknown): boolean {
  if (value === false || value === 0) return false;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (
      ["false", "off", "0", "disabled"].includes(normalized)
    ) {
      return false;
    }

    try {
      const parsed = JSON.parse(normalized);

      if (parsed === false || parsed === 0) return false;
    } catch {
      // مقدار متنی عادی تنظیمات
    }
  }

  return true;
}

async function isScheduleEnabled(env: Env): Promise<boolean> {
  return isEnabled(await getSetting(env, SCHEDULE_KEY));
}

// --------------------------------------------------
// State validation
// --------------------------------------------------

function parseSeenIds(value: unknown): string[] {
  let parsed = value;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw new Error("Stored seen IDs contain invalid JSON.");
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Stored seen IDs are not an array.");
  }

  const ids = parsed.map(String);

  if (ids.some((id) => !/^\d+$/.test(id))) {
    throw new Error("Stored seen IDs contain an invalid ID.");
  }

  return [...new Set(ids)].slice(-MAX_SEEN_IDS);
}

function parseQueue(value: unknown): QueuedPost[] {
  let parsed = value;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw new Error("Stored queue contains invalid JSON.");
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Stored queue is not an array.");
  }

  const queue: QueuedPost[] = [];

  for (const item of parsed) {
    if (
      item === null ||
      typeof item !== "object" ||
      !/^\d+$/.test(String(item.id ?? "")) ||
      typeof item.url !== "string" ||
      typeof item.text !== "string"
    ) {
      throw new Error(
        "Stored queue contains an invalid post; queue was not modified.",
      );
    }

    queue.push({
      id: String(item.id),
      url: item.url,
      text: item.text,
    });
  }

  return [
    ...new Map(queue.map((post) => [post.id, post])).values(),
  ].sort(compareIds);
}

function parseState(value: unknown): KargozinState {
  let parsed = value;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw new Error("Stored Kargozin state contains invalid JSON.");
    }
  }

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    (parsed as { version?: unknown }).version !== 1
  ) {
    throw new Error(
      "Stored Kargozin state is invalid; refusing to overwrite it.",
    );
  }

  const record = parsed as Record<string, unknown>;

  if (typeof record.initialized !== "boolean") {
    throw new Error("Stored Kargozin initialization flag is invalid.");
  }

  if (
    record.lastSentAt !== null &&
    typeof record.lastSentAt !== "string"
  ) {
    throw new Error("Stored last-send timestamp is invalid.");
  }

  const lastSentAt = record.lastSentAt as string | null;

  if (
    lastSentAt !== null &&
    !Number.isFinite(Date.parse(lastSentAt))
  ) {
    throw new Error("Stored last-send timestamp cannot be parsed.");
  }

  return {
    version: 1,
    initialized: record.initialized,
    seenIds: parseSeenIds(record.seenIds),
    queue: parseQueue(record.queue),
    lastSentAt,
  };
}

// --------------------------------------------------
// Tehran time
// --------------------------------------------------

function getTehranMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TEHRAN_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const hour = Number(
    parts.find((part) => part.type === "hour")?.value,
  );

  const minute = Number(
    parts.find((part) => part.type === "minute")?.value,
  );

  return hour * 60 + minute;
}

function isWithinSendingHours(date: Date): boolean {
  const minutes = getTehranMinutes(date);

  return (
    minutes >= SEND_START_MINUTES &&
    minutes < SEND_END_MINUTES
  );
}

function getNextSendingWindow(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TEHRAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const getPart = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const year = Number(getPart("year"));
  const month = Number(getPart("month"));
  const day = Number(getPart("day"));

  const localMinutes = getTehranMinutes(date);
  const addDay = localMinutes >= SEND_END_MINUTES;

  // ساعت هدف: ۰۸:۰۵ به وقت تهران
  const targetDate = new Date(
    Date.UTC(
      year,
      month - 1,
      day + (addDay ? 1 : 0),
      8,
      5,
      0,
    ),
  );

  // اختلاف زمانی تهران با UTC
  targetDate.setUTCMinutes(
    targetDate.getUTCMinutes() - 210,
  );

  return targetDate.toISOString();
}

// --------------------------------------------------
// Text splitting
// --------------------------------------------------

/**
 * متن را بدون حذف فاصله، خط جدید یا هیچ کاراکتری تقسیم می‌کند.
 * Array.from مانع شکستن زوج‌های surrogate ایموجی می‌شود.
 */
function splitTextSafely(
  text: string,
  maxLength: number,
): string[] {
  if (!text) return [];

  const characters = Array.from(text);
  const chunks: string[] = [];

  let position = 0;

  while (position < characters.length) {
    const remaining = characters.length - position;

    if (remaining <= maxLength) {
      chunks.push(characters.slice(position).join(""));
      break;
    }

    let end = position + maxLength;

    // اگر نزدیک انتهای بخش، فاصله یا خط جدید وجود دارد،
    // تقسیم را در همان نقطه انجام می‌دهیم.
    const minimumPreferredEnd = position + Math.floor(maxLength * 0.65);

    for (let i = end - 1; i >= minimumPreferredEnd; i--) {
      if (
        characters[i] === "\n" ||
        characters[i] === " " ||
        characters[i] === "\t"
      ) {
        end = i + 1;
        break;
      }
    }

    if (end <= position) {
      end = position + maxLength;
    }

    chunks.push(
      characters.slice(position, end).join(""),
    );

    position = end;
  }

  return chunks;
}

// --------------------------------------------------
// Image generation
// --------------------------------------------------

async function getVazirmatnFont(): Promise<ArrayBuffer> {
  if (cachedFont) {
    return cachedFont;
  }

  if (!fontPromise) {
    fontPromise = (async () => {
      const response = await fetch(FONT_URL, {
        method: "GET",
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(
          `Font download failed: HTTP ${response.status}`,
        );
      }

      const buffer = await response.arrayBuffer();

      if (buffer.byteLength < 1000) {
        throw new Error("Downloaded font file is invalid.");
      }

      cachedFont = buffer;
      return buffer;
    })();
  }

  try {
    return await fontPromise;
  } catch (error) {
    fontPromise = null;
    throw error;
  }
}

function buildImageHeadline(text: string): string {
  const cleaned = text
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[ \t]+/g, " ")
    .trim();

  if (!cleaned) {
    return "خبر جدید کارگزین آنلاین";
  }

  // اولین خط یا پاراگراف به عنوان تیتر تصویری
  const firstPart =
    cleaned
      .split(/\n+/)
      .map((part) => part.trim())
      .find((part) => part.length > 0) ?? cleaned;

  const characters = Array.from(firstPart);

  if (characters.length <= 115) {
    return firstPart;
  }

  return `${characters.slice(0, 112).join("").trim()}…`;
}

async function generateKargozinImage(
  post: TelegramPost,
): Promise<Uint8Array> {
  const font = await getVazirmatnFont();
  const headline = buildImageHeadline(post.text);

  const element = h(
    "div",
    {
      style: {
        width: `${IMAGE_WIDTH}px`,
        height: `${IMAGE_HEIGHT}px`,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#071b36",
        color: "#ffffff",
        fontFamily: "Vazirmatn",
        direction: "rtl",
        padding: "52px 64px",
      },
      children: [
        // نوار بالایی
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
              height: "72px",
            },
            children: [
              h(
                "div",
                {
                  style: {
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    fontSize: "31px",
                    fontWeight: 800,
                    color: "#ffffff",
                  },
                  children: [
                    h(
                      "span",
                      {
                        style: {
                          color: "#ff4545",
                          marginLeft: "12px",
                        },
                        children: "●",
                      },
                    ),
                    h("span", {
                      children: "نبض خبر",
                    }),
                  ],
                },
              ),
              h(
                "div",
                {
                  style: {
                    display: "flex",
                    fontSize: "25px",
                    color: "#b9c9dc",
                    fontWeight: 500,
                  },
                  children: "کارگزین آنلاین",
                },
              ),
            ],
          },
        ),

        // خط قرمز جداکننده
        h("div", {
          style: {
            width: "100%",
            height: "5px",
            backgroundColor: "#e63946",
            marginTop: "22px",
            marginBottom: "32px",
            borderRadius: "4px",
          },
        }),

        // عنوان خبر
        h(
          "div",
          {
            style: {
              display: "flex",
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              padding: "8px 22px",
              textAlign: "right",
              direction: "rtl",
              fontSize: "48px",
              lineHeight: 1.65,
              fontWeight: 800,
              color: "#ffffff",
              overflow: "hidden",
            },
            children: headline,
          },
        ),

        // خط پایینی
        h("div", {
          style: {
            width: "100%",
            height: "1px",
            backgroundColor: "#36516f",
            marginTop: "22px",
            marginBottom: "20px",
          },
        }),

        // فوتر
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
              color: "#b9c9dc",
              fontSize: "21px",
              fontWeight: 500,
            },
            children: [
              h("span", {
                children: "منبع: کارگزین آنلاین",
              }),
              h("span", {
                children: "اخبار و اطلاع‌رسانی",
              }),
            ],
          },
        ),
      ],
    },
  );

  const svg = await satori(element, {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    fonts: [
      {
        name: "Vazirmatn",
        data: font,
        weight: 400,
        style: "normal",
      },
      {
        name: "Vazirmatn",
        data: font,
        weight: 700,
        style: "normal",
      },
      {
        name: "Vazirmatn",
        data: font,
        weight: 800,
        style: "normal",
      },
    ],
  });

  const renderer = await Resvg.async(svg, {
    fitTo: {
      mode: "width",
      value: IMAGE_WIDTH,
    },
  });

  const png = renderer.render().asPng();

  if (!png || png.byteLength === 0) {
    throw new Error("Generated image is empty.");
  }

  return png;
}

// --------------------------------------------------
// Bale API
// --------------------------------------------------

function getBaleCredentials(env: Env): {
  token: string;
  chatId: string;
} {
  const token = env.BALE_SMART_TOKEN;
  const chatId = env.BALE_GROUP_ID;

  if (!token || !chatId) {
    throw new Error("Bale bot token or group ID is missing.");
  }

  return { token, chatId };
}

async function sendBaleMessage(
  env: Env,
  text: string,
): Promise<void> {
  const { token, chatId } = getBaleCredentials(env);

  if (!text) return;

  const chunks = splitTextSafely(
    text,
    TEXT_MESSAGE_LIMIT,
  );

  for (let index = 0; index < chunks.length; index++) {
    const response = await fetch(
      `https://tapi.bale.ai/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunks[index],
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(15000),
      },
    );

    let result: {
      ok?: boolean;
      description?: string;
    };

    try {
      result = (await response.json()) as {
        ok?: boolean;
        description?: string;
      };
    } catch {
      throw new Error(
        `Bale sendMessage returned non-JSON response; HTTP ${response.status}.`,
      );
    }

    if (!response.ok || result.ok !== true) {
      throw new Error(
        `Bale sendMessage failed on chunk ${index + 1}/${chunks.length}: ${
          result.description ?? `HTTP ${response.status}`
        }`,
      );
    }
  }
}

async function sendBalePhoto(
  env: Env,
  photo: Uint8Array,
  caption: string,
): Promise<void> {
  const { token, chatId } = getBaleCredentials(env);

  const form = new FormData();

  form.append("chat_id", chatId);
  form.append("caption", caption);
  const photoBuffer = new ArrayBuffer(photo.byteLength);
new Uint8Array(photoBuffer).set(photo);
form.append(
  "photo",
  new Blob([photoBuffer], {
    type: "image/png",
  }),
  "kargozin-news.png",
);

  const response = await fetch(
    `https://tapi.bale.ai/bot${token}/sendPhoto`,
    {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(30000),
    },
  );

  let result: {
    ok?: boolean;
    description?: string;
  };

  try {
    result = (await response.json()) as {
      ok?: boolean;
      description?: string;
    };
  } catch {
    throw new Error(
      `Bale sendPhoto returned non-JSON response; HTTP ${response.status}.`,
    );
  }

  if (!response.ok || result.ok !== true) {
    throw new Error(
      `Bale sendPhoto failed: ${
        result.description ?? `HTTP ${response.status}`
      }`,
    );
  }
}

function buildMessage(post: TelegramPost): string {
  return `${NOTICE}\n\n${post.text}`;
}

// --------------------------------------------------
// Post delivery
// --------------------------------------------------

type DeliveryMode = "image" | "text-fallback";

async function sendKargozinPost(
  env: Env,
  post: TelegramPost,
): Promise<DeliveryMode> {
  const fullMessage = buildMessage(post);

  // کپشن از ابتدای پیام ساخته می‌شود.
  // هیچ بخشی از متن خبر حذف نمی‌شود.
  const captionParts = splitTextSafely(
    fullMessage,
    PHOTO_CAPTION_LIMIT,
  );

  const caption = captionParts[0] ?? "";
  const continuation = fullMessage.slice(caption.length);

  let photo: Uint8Array;

  // فقط خطای ساخت تصویر یا ارسال عکس باعث fallback می‌شود.
  try {
    photo = await generateKargozinImage(post);

    await sendBalePhoto(
      env,
      photo,
      caption,
    );
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : String(error);

    console.error(
      "Kargozin image delivery failed; switching to text:",
      detail,
    );

    // مسیر جایگزین: ارسال کل خبر به صورت متن
    await sendBaleMessage(
      env,
      fullMessage,
    );

    return "text-fallback";
  }

  // این قسمت عمداً بیرون try/catch تصویر است.
  // اگر عکس ارسال شده باشد و ادامه متن خطا بدهد،
  // کل خبر دوباره به صورت متنی ارسال نمی‌شود.
  if (continuation.length > 0) {
    await sendBaleMessage(
      env,
      continuation,
    );
  }

  return "image";
}

// --------------------------------------------------
// Main route
// --------------------------------------------------

export async function GET(): Promise<Response> {
  try {
    const env = getEnv();

    if (!(await isScheduleEnabled(env))) {
      return Response.json({
        ok: true,
        skipped: true,
        reason: "schedule_kargozin is disabled",
      });
    }

    const now = new Date();
    const posts = await fetchTelegramPosts();

    const savedState = await getSetting(
      env,
      STATE_KEY,
    );

    let state: KargozinState;

    if (savedState !== null) {
      state = parseState(savedState);
    } else {
      // سازگاری با نسخه قبلی
      const legacySeen = await getSetting(
        env,
        SETTINGS_KEY,
      );

      if (legacySeen === null) {
        // اجرای اولیه: پست‌های موجود فقط ثبت می‌شوند.
        state = {
          version: 1,
          initialized: true,
          seenIds: posts
            .map((post) => post.id)
            .slice(-MAX_SEEN_IDS),
          queue: [],
          lastSentAt: null,
        };

        await saveSetting(
          env,
          STATE_KEY,
          state,
        );

        return Response.json({
          ok: true,
          initialized: true,
          baselineCount: state.seenIds.length,
          sent: 0,
          reason: "Existing posts recorded as baseline",
        });
      }

      // نسخه قدیمی قبلاً فعال بوده است.
      state = {
        version: 1,
        initialized: true,
        seenIds: parseSeenIds(legacySeen),
        queue: [],
        lastSentAt: null,
      };
    }

    const seen = new Set(state.seenIds);
    const queued = new Set(
      state.queue.map((post) => post.id),
    );

    const discovered = posts
      .filter(
        (post) =>
          !seen.has(post.id) &&
          !queued.has(post.id),
      )
      .sort(compareIds);

    const mergedQueue = [
      ...state.queue,
      ...discovered,
    ].sort(compareIds);

    // صف جدید پیش از ارسال ذخیره می‌شود.
    if (
      discovered.length > 0 ||
      savedState === null
    ) {
      state = {
        ...state,
        queue: mergedQueue,
      };

      await saveSetting(
        env,
        STATE_KEY,
        state,
      );
    }

    if (state.queue.length === 0) {
      return Response.json({
        ok: true,
        foundNew: discovered.length,
        queued: 0,
        sent: 0,
        reason: "No posts waiting",
      });
    }

    if (!isWithinSendingHours(now)) {
      return Response.json({
        ok: true,
        foundNew: discovered.length,
        queued: state.queue.length,
        sent: 0,
        reason: "Outside Tehran sending hours",
        nextSendingWindow: getNextSendingWindow(now),
      });
    }

    if (state.lastSentAt !== null) {
      const lastSentTime = Date.parse(
        state.lastSentAt,
      );

      const nextEligibleTime =
        lastSentTime + MIN_SEND_INTERVAL_MS;

      if (now.getTime() < nextEligibleTime) {
        return Response.json({
          ok: true,
          foundNew: discovered.length,
          queued: state.queue.length,
          sent: 0,
          reason: "Waiting for 20-minute interval",
          nextEligibleAt: new Date(
            nextEligibleTime,
          ).toISOString(),
        });
      }
    }

    const nextPost = state.queue[0];

    // ارسال تصویر و کپشن؛ در صورت شکست، ارسال متنی کامل
    const deliveryMode = await sendKargozinPost(
      env,
      nextPost,
    );

    // فقط بعد از تکمیل مسیر ارسال، پست از صف خارج می‌شود.
    const sentAt = new Date().toISOString();

    const updatedState: KargozinState = {
      version: 1,
      initialized: true,
      seenIds: [
        ...new Set([
          ...state.seenIds,
          nextPost.id,
        ]),
      ].slice(-MAX_SEEN_IDS),
      queue: state.queue.slice(1),
      lastSentAt: sentAt,
    };

    await saveSetting(
      env,
      STATE_KEY,
      updatedState,
    );

    return Response.json({
      ok: true,
      foundNew: discovered.length,
      sent: 1,
      sentIds: [nextPost.id],
      deliveryMode,
      queued: updatedState.queue.length,
      lastSentAt: sentAt,
      nextEligibleAt: new Date(
        Date.parse(sentAt) + MIN_SEND_INTERVAL_MS,
      ).toISOString(),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 },
    );
  }
}

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createElement as h } from "react";

export const dynamic = "force-dynamic";

const SOURCE_URL = "https://t.me/s/kargozinonline";

const SETTINGS_KEY = "kargozin_telegram_seen_posts";
const SCHEDULE_KEY = "schedule_kargozin";
const STATE_KEY = "kargozin_telegram_state";

const MAX_SEEN_IDS = 1500;
const MIN_SEND_INTERVAL_MS = 10 * 60 * 1000;

const TEHRAN_TIME_ZONE = "Asia/Tehran";
const SEND_START_MINUTES = 8 * 60 + 5;
const SEND_END_MINUTES = 23 * 60;

const NOTICE = "🔴 نبض خبر";

const PHOTO_CAPTION_LIMIT = 1024;
const TEXT_MESSAGE_LIMIT = 4000;

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 630;

const FONT_URL =
  "https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/fonts/ttf/Vazirmatn-Regular.ttf";

type TelegramPost = {
  id: string;
  url: string;
  text: string;
};

type QueuedPost = TelegramPost;

type ParsedTelegramFeed = {
  posts: TelegramPost[];
  videoIds: string[];
};

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

// --------------------------------------------------
// Telegram reply, service and video detection
// --------------------------------------------------

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

/**
 * تشخیص ویدئو مستقل از متن کپشن انجام می‌شود.
 * عکس معمولی با این تابع فیلتر نمی‌شود.
 */
function isVideoPost(block: string): boolean {
  // تگ واقعی ویدئو یا منبع ویدئویی
  if (/<video\b/i.test(block)) {
    return true;
  }

  if (
    /<source\b[^>]*\btype\s*=\s*["']video\//i.test(block)
  ) {
    return true;
  }

  if (/\bvideo\/(?:mp4|webm|ogg|quicktime)\b/i.test(block)) {
    return true;
  }

  // کلاس‌های رایج ویدئوی تلگرام
  const videoClassPatterns = [
    /\btgme_widget_message_video(?:_player|_wrap|_thumb)?\b/i,
    /\btgme_widget_message_roundvideo\b/i,
    /\btgme_widget_message_video_player\b/i,
    /\btgme_widget_message_video_wrap\b/i,
    /\btgme_widget_message_video_thumb\b/i,
  ];

  for (const pattern of videoClassPatterns) {
    if (pattern.test(block)) {
      return true;
    }
  }

  // نشانه‌های ویدئو در عناصر HTML
  const tags = /<[a-z][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = tags.exec(block)) !== null) {
    const tag = match[0];

    if (
      /\bdata-media-type\s*=\s*["']video["']/i.test(tag) ||
      /\bdata-video\b/i.test(tag)
    ) {
      return true;
    }
  }

  return false;
}

// --------------------------------------------------
// HTML to text
// --------------------------------------------------

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

// --------------------------------------------------
// Advertisement and empty-content filtering
// --------------------------------------------------

function isAdvertisementText(text: string): boolean {
  const advertisementPatterns = [
    /برای\s+سفارش\s+تبلیغات/i,
    /جهت\s+سفارش\s+تبلیغات/i,
    /جهت\s+تبلیغات/i,
    /سفارش\s+تبلیغات/i,
    /پذیرش\s+تبلیغات/i,
    /تبلیغات\s+در\s+کانال/i,
    /تعرفه\s+تبلیغات/i,
    /تبلیغ\s+در\s+کانال/i,
    /جهت\s+هماهنگی\s+تبلیغات/i,
    /ارتباط\s+با\s+واحد\s+تبلیغات/i,
    /ثبت\s+سفارش\s+تبلیغات/i,
  ];

  return advertisementPatterns.some((pattern) =>
    pattern.test(text),
  );
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

  // حذف خطوطی که فقط از علائم تزئینی تشکیل شده‌اند.
  text = text
    .replace(
      /(?:^|\n)[ \t\u200c]*(?:(?:🔹|🔸|🔷|🔶|🔴|🔵|⚫️?|⚪️?|♦️?|◆|◇|💠|▪️?|▫️?|◾️?|◽️?|➖|➕|⭐️?|✨|❤️|♥️|⬛️?|⬜️?)[ \t\u200c]*)+(?=\n|$)/gu,
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
  return /\p{L}/u.test(
    text.replace(/https?:\/\/\S+/gi, ""),
  );
}

function isValidNewsText(text: string): boolean {
  if (!text || !text.trim()) {
    return false;
  }

  if (!hasUsefulText(text)) {
    return false;
  }

  if (isAdvertisementText(text)) {
    return false;
  }

  return true;
}

// --------------------------------------------------
// Telegram post parsing
// --------------------------------------------------

function compareIds(
  a: TelegramPost,
  b: TelegramPost,
): number {
  const first = BigInt(a.id);
  const second = BigInt(b.id);

  return first < second ? -1 : first > second ? 1 : 0;
}

function parseTelegramPosts(
  html: string,
): ParsedTelegramFeed {
  const posts: TelegramPost[] = [];
  const videoIds = new Set<string>();
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

    if (seenIds.has(id)) continue;

    // پست‌های سیستمی و پاسخ‌ها پردازش نمی‌شوند.
    if (isServicePost(block)) continue;
    if (isReplyPost(block)) continue;

    /*
     * ویدئو پیش از استخراج کپشن شناسایی می‌شود.
     * بنابراین متن همراه ویدئو نیز هرگز وارد صف نمی‌شود.
     */
    if (isVideoPost(block)) {
      videoIds.add(id);
      seenIds.add(id);
      continue;
    }

    // عکس‌ها فیلتر نمی‌شوند.
    const messageHtml = extractDivInnerByClass(
      block,
      "tgme_widget_message_text",
    );

    if (messageHtml === null) continue;

    const mainHtml = removeReplyElements(messageHtml);

    const text = cleanPostText(
      htmlToText(mainHtml),
    );

    if (!isValidNewsText(text)) continue;

    seenIds.add(id);

    posts.push({
      id,
      url: `https://t.me/kargozinonline/${id}`,
      text,
    });
  }

  return {
    posts: posts.sort(compareIds),
    videoIds: [...videoIds],
  };
}

// --------------------------------------------------
// Telegram fetch
// --------------------------------------------------

async function fetchTelegramPosts(): Promise<ParsedTelegramFeed> {
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

  const feed = parseTelegramPosts(html);

  // صفحه‌ای که فقط ویدئو دارد نیز پاسخ معتبر محسوب می‌شود.
  if (
    feed.posts.length === 0 &&
    feed.videoIds.length === 0
  ) {
    const hasPostIds =
      /\bdata-post=["']kargozinonline\/\d+["']/i.test(html);

    const hasMessageText =
      /\btgme_widget_message_text\b/i.test(html);

    const looksBlocked =
      /captcha|too many requests|access denied|please enable javascript/i.test(
        html,
      );

    throw new Error(
      `No valid news posts found. HTTP ${response.status}; ` +
        `htmlLength=${html.length}; ` +
        `hasPostIds=${hasPostIds}; ` +
        `hasMessageText=${hasMessageText}; ` +
        `looksBlocked=${looksBlocked}`,
    );
  }

  return feed;
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
  return isEnabled(
    await getSetting(env, SCHEDULE_KEY),
  );
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

    const cleanedText = cleanPostText(item.text);

    if (!isValidNewsText(cleanedText)) {
      continue;
    }

    queue.push({
      id: String(item.id),
      url: item.url,
      text: cleanedText,
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

  targetDate.setUTCMinutes(
    targetDate.getUTCMinutes() - 210,
  );

  return targetDate.toISOString();
}

// --------------------------------------------------
// Text splitting
// --------------------------------------------------

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

    const minimumPreferredEnd =
      position + Math.floor(maxLength * 0.65);

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
    return "خبر جدید";
  }

  const firstPart =
    cleaned
      .split(/\n+/)
      .map((part) => part.trim())
      .find((part) => part.length > 0) ?? cleaned;

  const characters = Array.from(firstPart);

  if (characters.length <= 100) {
    return firstPart;
  }

  return `${characters.slice(0, 97).join("").trim()}…`;
}

/**
 * نقاط تزئینی برای ساخت نقشه نقطه‌ای جهان.
 * این نقاط فقط گرافیکی هستند و متن یا منبعی نمایش نمی‌دهند.
 */
function buildWorldMapDots(): ReturnType<typeof h>[] {
  const dots: ReturnType<typeof h>[] = [];

  const continentRows: Array<Array<[number, number]>> = [
    [[7, 18], [26, 31], [45, 58], [62, 80]],
    [[5, 22], [25, 31], [43, 86]],
    [[4, 23], [42, 88]],
    [[5, 24], [42, 91]],
    [[8, 25], [43, 90]],
    [[12, 25], [43, 89]],
    [[16, 27], [45, 86]],
    [[20, 29], [47, 83]],
    [[24, 31], [49, 78]],
    [[27, 34], [50, 70]],
    [[29, 36], [51, 65]],
    [[31, 37], [52, 63]],
    [[32, 38], [53, 64]],
    [[33, 38], [54, 66]],
    [[34, 38], [55, 68]],
    [[35, 39], [56, 70]],
    [[36, 40], [57, 72]],
    [[37, 41], [59, 74]],
    [[38, 42], [62, 76]],
    [[39, 43], [67, 80]],
    [[40, 44], [72, 84]],
    [[41, 45], [77, 88]],
    [[42, 46], [80, 91]],
    [[43, 47], [82, 94]],
  ];

  const dotSize = 9;
  const stepX = 12;
  const stepY = 12;
  const startX = 35;
  const startY = 8;

  for (let row = 0; row < continentRows.length; row++) {
    const ranges = continentRows[row];

    for (const [start, end] of ranges) {
      for (let col = start; col <= end; col++) {
        // خلوت‌سازی منظم برای جلوگیری از شلوغی تصویر
        if ((row + col) % 5 === 0) continue;

        dots.push(
          h("div", {
            key: `dot-${row}-${col}`,
            style: {
              position: "absolute",
              left: `${startX + col * stepX}px`,
              top: `${startY + row * stepY}px`,
              width: `${dotSize}px`,
              height: `${dotSize}px`,
              borderRadius: "50%",
              backgroundColor: "#168de0",
              opacity: 0.27,
            },
          }),
        );
      }
    }
  }

  return dots;
}

async function generateKargozinImage(
  post: TelegramPost,
): Promise<Uint8Array> {
  const [{ satori }, { Resvg }] = await Promise.all([
  import("@cf-wasm/satori"),
  import("@cf-wasm/resvg"),
]);

  const font = await getVazirmatnFont();
  const headline = buildImageHeadline(post.text);

  const headlineLength = Array.from(headline).length;

  const headlineFontSize =
    headlineLength <= 45
      ? 68
      : headlineLength <= 75
        ? 58
        : 48;

  const dots = buildWorldMapDots();

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
        backgroundColor: "#eaf8ff",
        color: "#102b65",
        fontFamily: "Vazirmatn",
        direction: "rtl",
      },

      children: [
        // پس‌زمینه روشن و نقشه نقطه‌ای
        ...dots,

        // قوس‌های تزئینی بالای سمت چپ
        h("div", {
          style: {
            position: "absolute",
            left: "-520px",
            top: "-555px",
            width: "1000px",
            height: "850px",
            borderRadius: "50%",
            border: "25px solid #0878e8",
            opacity: 0.95,
          },
        }),

        h("div", {
          style: {
            position: "absolute",
            left: "-550px",
            top: "-575px",
            width: "1060px",
            height: "900px",
            borderRadius: "50%",
            border: "12px solid #073cae",
            opacity: 0.9,
          },
        }),

        // هاله آبی روشن بالای تصویر
        h("div", {
          style: {
            position: "absolute",
            left: "0px",
            top: "0px",
            width: "100%",
            height: "100px",
            backgroundColor: "#d9f2ff",
            opacity: 0.2,
          },
        }),

        // پلاک قرمز براق عنوان
        h(
          "div",
          {
            style: {
              position: "absolute",
              top: "38px",
              left: "290px",
              width: "620px",
              height: "145px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#e51b16",
              borderRadius: "38px",
              border: "5px solid #ffb3a5",
              boxShadow: "0px 9px 22px rgba(110, 20, 20, 0.35)",
            },
            children: [
              h("div", {
                style: {
                  position: "absolute",
                  top: "8px",
                  left: "28px",
                  right: "28px",
                  height: "3px",
                  backgroundColor: "#ffaaa0",
                  opacity: 0.8,
                },
              }),
              h("span", {
                style: {
                  color: "#ffffff",
                  fontSize: "82px",
                  fontWeight: 800,
                  textAlign: "center",
                  textShadow: "0px 4px 4px rgba(80, 0, 0, 0.35)",
                },
                children: "نبض خبر",
              }),
            ],
          },
        ),

        // درخشش زیر پلاک
        h("div", {
          style: {
            position: "absolute",
            top: "185px",
            left: "0px",
            width: "100%",
            height: "5px",
            backgroundColor: "#ff6550",
            opacity: 0.85,
          },
        }),

        // فضای مرکزی تیتر
        h(
          "div",
          {
            style: {
              position: "absolute",
              left: "45px",
              top: "215px",
              width: "1110px",
              height: "295px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px 45px",
              backgroundColor: "#f8fdff",
              borderRadius: "35px",
              border: "3px solid #b7e6ff",
              boxShadow: "0px 7px 20px rgba(0, 90, 180, 0.14)",
              opacity: 0.96,
            },
            children: [
              h("div", {
                style: {
                  width: "100%",
                  color: "#092b70",
                  fontSize: `${headlineFontSize}px`,
                  fontWeight: 800,
                  lineHeight: 1.55,
                  textAlign: "center",
                  direction: "rtl",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textShadow: "0px 2px 1px rgba(0, 40, 100, 0.12)",
                },
                children: headline,
              }),
            ],
          },
        ),

        // قوس‌های موجی پایین تصویر
        h("div", {
          style: {
            position: "absolute",
            left: "-120px",
            bottom: "-205px",
            width: "1440px",
            height: "350px",
            borderRadius: "50%",
            backgroundColor: "#0646b9",
            transform: "rotate(-3deg)",
          },
        }),

        h("div", {
          style: {
            position: "absolute",
            left: "-100px",
            bottom: "-175px",
            width: "1400px",
            height: "315px",
            borderRadius: "50%",
            backgroundColor: "#0878e8",
            transform: "rotate(-3deg)",
          },
        }),

        h("div", {
          style: {
            position: "absolute",
            left: "-80px",
            bottom: "-155px",
            width: "1360px",
            height: "280px",
            borderRadius: "50%",
            border: "9px solid #32b5ff",
            backgroundColor: "#0a5ed0",
            transform: "rotate(-3deg)",
          },
        }),

        // نوار قرمز پایین، مشابه نمونه ارسالی
        h("div", {
          style: {
            position: "absolute",
            left: "-50px",
            bottom: "47px",
            width: "1320px",
            height: "9px",
            backgroundColor: "#ed2727",
            transform: "rotate(5deg)",
            boxShadow: "0px 2px 5px rgba(100, 0, 0, 0.25)",
          },
        }),

        // خط روشن بالای قوس پایین
        h("div", {
          style: {
            position: "absolute",
            left: "-40px",
            bottom: "68px",
            width: "1300px",
            height: "4px",
            backgroundColor: "#d8f5ff",
            transform: "rotate(5deg)",
            opacity: 0.9,
          },
        }),
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

  if (!text || !text.trim()) return;

  const chunks = splitTextSafely(
    text,
    TEXT_MESSAGE_LIMIT,
  );

  for (let index = 0; index < chunks.length; index++) {
    if (!chunks[index].trim()) continue;

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

  // تبدیل امن Uint8Array به ArrayBuffer برای Blob
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

  const captionParts = splitTextSafely(
    fullMessage,
    PHOTO_CAPTION_LIMIT,
  );

  const caption = captionParts[0] ?? "";

  // محاسبه ادامه متن بر اساس Unicode code points
  const fullCharacters = Array.from(fullMessage);

  const continuation = fullCharacters
    .slice(Array.from(caption).length)
    .join("");

  try {
    const photo = await generateKargozinImage(post);

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

    // اگر تولید یا ارسال عکس شکست خورد، کل خبر متنی ارسال می‌شود.
    await sendBaleMessage(
      env,
      fullMessage,
    );

    return "text-fallback";
  }

  // ادامه خبر فقط پس از ارسال موفق عکس فرستاده می‌شود.
  if (continuation.trim()) {
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

    const feed = await fetchTelegramPosts();
    const posts = feed.posts;
    const videoIds = feed.videoIds;

    const videoIdSet = new Set(videoIds);

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
        // اجرای اولیه: خبرهای موجود و ویدئوهای موجود ثبت می‌شوند.
        // هیچ‌کدام از پست‌های قبلی ارسال نمی‌شوند.
        state = {
          version: 1,
          initialized: true,
          seenIds: [
            ...new Set([
              ...posts.map((post) => post.id),
              ...videoIds,
            ]),
          ].slice(-MAX_SEEN_IDS),
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
          ignoredVideoCount: videoIds.length,
          sent: 0,
          reason: "Existing posts and videos recorded as baseline",
        });
      }

      // نسخه قدیمی قبلاً فعال بوده است.
      state = {
        version: 1,
        initialized: true,
        seenIds: [
          ...new Set([
            ...parseSeenIds(legacySeen),
            ...videoIds,
          ]),
        ].slice(-MAX_SEEN_IDS),
        queue: [],
        lastSentAt: null,
      };
    }

    // ویدئوهایی که قبلاً وارد صف شده‌اند نیز حذف می‌شوند،
    // به شرط آنکه هنوز در صفحه فعلی تلگرام قابل شناسایی باشند.
    const previousQueueLength = state.queue.length;

    const filteredQueue = state.queue.filter(
      (post) => !videoIdSet.has(post.id),
    );

    const removedVideoQueueCount =
      previousQueueLength - filteredQueue.length;

    const updatedSeenIds = [
      ...new Set([
        ...state.seenIds,
        ...videoIds,
      ]),
    ].slice(-MAX_SEEN_IDS);

    const seenChanged =
      updatedSeenIds.length !== state.seenIds.length ||
      updatedSeenIds.some(
        (id, index) => id !== state.seenIds[index],
      );

    state = {
      ...state,
      seenIds: updatedSeenIds,
      queue: filteredQueue,
    };

    const seen = new Set(state.seenIds);

    const queued = new Set(
      state.queue.map((post) => post.id),
    );

    const discovered = posts
      .filter(
        (post) =>
          !seen.has(post.id) &&
          !queued.has(post.id) &&
          !videoIdSet.has(post.id),
      )
      .sort(compareIds);

    const mergedQueue = [
      ...state.queue,
      ...discovered,
    ].sort(compareIds);

    // صف جدید و حذف ویدئوها پیش از ارسال ذخیره می‌شود.
    if (
      discovered.length > 0 ||
      savedState === null ||
      removedVideoQueueCount > 0 ||
      seenChanged
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
        ignoredVideos: videoIds.length,
        removedQueuedVideos: removedVideoQueueCount,
        queued: 0,
        sent: 0,
        reason: "No posts waiting",
      });
    }

    if (!isWithinSendingHours(now)) {
      return Response.json({
        ok: true,
        foundNew: discovered.length,
        ignoredVideos: videoIds.length,
        removedQueuedVideos: removedVideoQueueCount,
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
          ignoredVideos: videoIds.length,
          removedQueuedVideos: removedVideoQueueCount,
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

    // بررسی نهایی متن قبل از ارسال
    if (!isValidNewsText(nextPost.text)) {
      const invalidState: KargozinState = {
        ...state,
        seenIds: [
          ...new Set([
            ...state.seenIds,
            nextPost.id,
          ]),
        ].slice(-MAX_SEEN_IDS),
        queue: state.queue.slice(1),
      };

      await saveSetting(
        env,
        STATE_KEY,
        invalidState,
      );

      return Response.json({
        ok: true,
        skipped: true,
        reason: "Invalid, empty or advertising post removed",
        skippedId: nextPost.id,
        queued: invalidState.queue.length,
      });
    }

    // ارسال عکس و کپشن؛ در صورت شکست، ارسال متنی کامل
    const deliveryMode = await sendKargozinPost(
      env,
      nextPost,
    );

    const sentAt = new Date().toISOString();

    // فقط پس از تکمیل ارسال، خبر از صف خارج می‌شود.
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
      ignoredVideos: videoIds.length,
      removedQueuedVideos: removedVideoQueueCount,
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
    console.error(
      "Kargozin route failed:",
      error,
    );

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

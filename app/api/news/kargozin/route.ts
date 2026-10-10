
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const SOURCE_URL = "https://t.me/s/kargozinonline";
const SETTINGS_KEY = "kargozin_telegram_seen_posts";
const SCHEDULE_KEY = "schedule_kargozin";
const MAX_POSTS_PER_RUN = 3;
const MAX_SEEN_IDS = 1500;

const NOTICE =
  "((این مطلب به صورت اتوماتیک از کانال کارگزین آنلاین ارسال شده است))";

type TelegramPost = {
  id: string;
  url: string;
  text: string;
};

type Env = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  BALE_SMART_TOKEN?: string;
  BALE_GROUP_ID?: string;
};

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
        const code = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);

        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) {
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

function htmlToText(html: string): string {
  return decodeHtml(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|blockquote|h[1-6])\s*>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * پست‌هایی که نشانه‌های تبلیغاتی دارند رد می‌شوند.
 * لینک‌ها و تبلیغات انتهای متن نیز حذف می‌شوند.
 */
function cleanPostText(input: string): string {
  let text = input
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .trim();

  const adMarkers = [
    /با\s+کانال\s+کارگزین\s+آنلاین\s+به\s+روز\s+باشید/i,
    /برای\s+سفارش\s+تبلیغات/i,
    /جهت\s+تبلیغات/i,
    /تبلیغات\s+در\s+کانال/i,
    /عضویت\s+در\s+کانال/i,
    /کانال\s+کارگزین\s+آنلاین\s+را\s+دنبال\s+کنید/i,
    /تلگرام\s*📍/i,
    /بله\s*📍/i,
    /ایتا\s*📍/i,
    /روبیکا\s*📍/i,
    /https?:\/\/t\.me\//i,
    /https?:\/\/ble\.ir\//i,
    /https?:\/\/eitaa\.com\//i,
    /https?:\/\/rubika\.ir\//i,
    /https?:\/\/www\./i,
    /https?:\/\//i,
  ];

  let cutAt = text.length;

  for (const marker of adMarkers) {
    const match = marker.exec(text);
    if (match && match.index < cutAt) {
      cutAt = match.index;
    }
  }

  text = text.slice(0, cutAt);

  // لینک‌های متنی رایج، حتی بدون http، حذف شوند.
  text = text
    .replace(/\b(?:t\.me|telegram\.me|ble\.ir|eitaa\.com|rubika\.ir)\/\S*/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

/**
 * حداقل یک حرف یا عدد باید وجود داشته باشد.
 * متن‌های صرفاً ایموجی و علائم ارسال نمی‌شوند.
 */
function hasUsefulText(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

/**
 * هر پست دارای عکس، ویدئو، گیف یا محتوای رسانه‌ای رد می‌شود،
 * حتی اگر کپشن متنی داشته باشد.
 */
function containsMedia(block: string): boolean {
  const mediaPatterns = [
    /tgme_widget_message_photo_wrap/i,
    /tgme_widget_message_video_player/i,
    /tgme_widget_message_document_wrap/i,
    /tgme_widget_message_voice_player/i,
    /tgme_widget_message_sticker_wrap/i,
    /tgme_widget_message_roundvideo/i,
    /<video\b/i,
    /<audio\b/i,
    /<img\b/i,
    /class=["'][^"']*\bvideo_player\b/i,
    /class=["'][^"']*\bphoto_wrap\b/i,
    /class=["'][^"']*\bsticker_wrap\b/i,
    /data-roundvideo=/i,
  ];

  return mediaPatterns.some((pattern) => pattern.test(block));
}

function parseTelegramPosts(html: string): TelegramPost[] {
  const posts: TelegramPost[] = [];
  const ids = new Set<string>();

  const blocks =
    html.match(
      /<div class="tgme_widget_message_wrap\b[\s\S]*?(?=<div class="tgme_widget_message_wrap\b|$)/gi,
    ) ?? [];

  for (const block of blocks) {
    const postMatch = block.match(
      /data-post=["']kargozinonline\/(\d+)["']/i,
    );

    if (!postMatch) continue;

    const id = postMatch[1];

    if (ids.has(id)) continue;
    ids.add(id);

    // هر نوع پست رسانه‌ای، حتی دارای کپشن، رد می‌شود.
    if (containsMedia(block)) continue;

    const textMatch = block.match(
      /<div class="tgme_widget_message_text\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    );

    // پست فاقد متن رد می‌شود.
    if (!textMatch) continue;

    const text = cleanPostText(htmlToText(textMatch[1]));

    if (!hasUsefulText(text)) continue;

    posts.push({
      id,
      url: `https://t.me/kargozinonline/${id}`,
      text,
    });
  }

  return posts;
}

async function fetchTelegramPosts(): Promise<TelegramPost[]> {
  const response = await fetch(SOURCE_URL, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; KargozinForwarder/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Telegram HTTP ${response.status}`);
  }

  const html = await response.text();
  const posts = parseTelegramPosts(html);

  if (posts.length === 0) {
    throw new Error("No valid text-only posts found on Telegram preview.");
  }

  return posts;
}

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

  const rows = (await response.json()) as Array<{ value: unknown }>;
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

    if (["false", "off", "0", "disabled"].includes(normalized)) {
      return false;
    }

    try {
      const parsed = JSON.parse(normalized);
      if (parsed === false || parsed === 0) return false;
    } catch {
      // مقدار رشته‌ای معمولی تنظیمات
    }
  }

  return true;
}

async function isScheduleEnabled(env: Env): Promise<boolean> {
  return isEnabled(await getSetting(env, SCHEDULE_KEY));
}

function parseSeenIds(value: unknown): string[] {
  let parsed = value;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return [
    ...new Set(
      parsed.map(String).filter((id) => /^\d+$/.test(id)),
    ),
  ].slice(-MAX_SEEN_IDS);
}

async function sendBaleMessage(
  env: Env,
  text: string,
): Promise<void> {
  const token = env.BALE_SMART_TOKEN;
  const chatId = env.BALE_GROUP_ID;

  if (!token || !chatId) {
    throw new Error("Bale bot token or group ID is missing.");
  }

  const response = await fetch(
    `https://tapi.bale.ai/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15000),
    },
  );

  const result = (await response.json()) as {
    ok?: boolean;
    description?: string;
  };

  if (!response.ok || result.ok === false) {
    throw new Error(
      `Bale sendMessage failed: ${result.description ?? response.status}`,
    );
  }
}

function buildMessage(post: TelegramPost): string {
  // فقط متن خبر؛ هیچ لینک منبعی به گروه ارسال نمی‌شود.
  return `${NOTICE}\n\n${post.text}`;
}

function compareIds(a: TelegramPost, b: TelegramPost): number {
  const first = BigInt(a.id);
  const second = BigInt(b.id);

  return first < second ? -1 : first > second ? 1 : 0;
}

export async function GET(): Promise<Response> {
  try {
    const env = getEnv();

    // فقط تنظیم مجله کارگزینی بررسی می‌شود.
    if (!(await isScheduleEnabled(env))) {
      return Response.json({
        ok: true,
        skipped: true,
        reason: "schedule_kargozin is disabled",
      });
    }

    const posts = await fetchTelegramPosts();
    const saved = await getSetting(env, SETTINGS_KEY);

    // اجرای اول: سابقه‌سازی بدون ارسال پست‌های قدیمی
    if (saved === null) {
      const baseline = posts
        .map((post) => post.id)
        .slice(-MAX_SEEN_IDS);

      await saveSetting(env, SETTINGS_KEY, baseline);

      return Response.json({
        ok: true,
        initialized: true,
        baselineCount: baseline.length,
        sent: 0,
      });
    }

    const seenIds = parseSeenIds(saved);
    const seen = new Set(seenIds);

    const newPosts = posts
      .filter((post) => !seen.has(post.id))
      .sort(compareIds);

    const batch = newPosts.slice(0, MAX_POSTS_PER_RUN);
    const sentIds: string[] = [];
    const errors: Array<{ id: string; error: string }> = [];

    for (const post of batch) {
      try {
        await sendBaleMessage(env, buildMessage(post));
        sentIds.push(post.id);
      } catch (error) {
        errors.push({
          id: post.id,
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }

    if (sentIds.length > 0) {
      await saveSetting(
        env,
        SETTINGS_KEY,
        [...new Set([...seenIds, ...sentIds])].slice(-MAX_SEEN_IDS),
      );
    }

    return Response.json({
      ok: errors.length === 0,
      foundNew: newPosts.length,
      attempted: batch.length,
      sent: sentIds.length,
      sentIds,
      errors,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

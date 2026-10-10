
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

const CHANNEL_URL = "https://t.me/s/kargozinonline";
const SEEN_KEY = "kargozin_telegram_seen_ids";
const NOTICE =
  "🤖 این مطلب به صورت اتوماتیک از کانال کارگزین آنلاین ارسال شده است";

const MAX_POSTS_PER_RUN = 10;
const MAX_SEEN = 2000;
const TIMEOUT_MS = 12000;
const MAX_MESSAGE_LENGTH = 3500;

type TelegramPost = {
  id: string;
  text: string;
};

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16))
    )
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCodePoint(Number(n))
    );
}

function cleanPostText(html: string): string {
  let text = html
    // حذف عناصر غیرمتنی و رسانه‌ها
    .replace(/<(script|style|svg|video|audio|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/<video\b[^>]*>/gi, " ")
    .replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, " ")
    .replace(/<[^>]+>/g, "\n");

  text = decodeHtml(text)
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const lines = text.split("\n");
  const kept: string[] = [];

  const promotionalPatterns = [
    /تبلیغات/,
    /تبلیغاتی/,
    /رپورتاژ/,
    /اسپانسر/,
    /کد تخفیف/,
    /خرید آنلاین/,
    /فروش ویژه/,
    /ثبت سفارش/,
    /سفارش آنلاین/,
    /برای تبلیغ/,
    /جهت تبلیغات/,
    /ارتباط با ادمین/,
    /تبلیغ در کانال/,
    /همکاری تبلیغاتی/,
    /آگهی پذیرفته می‌شود/,
    /آگهی پذیرفته می شود/,
  ];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      if (kept.length && kept[kept.length - 1] !== "") {
        kept.push("");
      }
      continue;
    }

    // حذف خط‌هایی که لینک یا دعوت تبلیغاتی‌اند
    if (
      /^https?:\/\//i.test(line) ||
      /^www\./i.test(line) ||
      /t\.me\//i.test(line) ||
      /telegram\.me\//i.test(line) ||
      /ble\.ir\//i.test(line) ||
      /eitaa\.com\//i.test(line) ||
      /rubika\.ir\//i.test(line)
    ) {
      continue;
    }

    if (promotionalPatterns.some((pattern) => pattern.test(line))) {
      continue;
    }

    // حذف خط‌های دارای فقط ایموجی، نماد یا علائم
    const meaningful = line.replace(
      /[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Mark}\p{P}\p{S}\s]/gu,
      ""
    );

    if (!meaningful) continue;

    kept.push(line);
  }

  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractPosts(html: string): TelegramPost[] {
  const posts: TelegramPost[] = [];

  // پیام‌های عمومی کانال تلگرام معمولاً شناسه‌ای مثل
  // data-post="kargozinonline/12345" دارند.
  const wrapperRegex =
    /<div\b(?=[^>]*class="[^"]*\btgme_widget_message_wrap\b)[\s\S]*?(?=<div\b(?=[^>]*class="[^"]*\btgme_widget_message_wrap\b)|$)/gi;

  const wrappers = html.match(wrapperRegex) || [];

  for (const wrapper of wrappers) {
    const postMatch = wrapper.match(
      /data-post=["']kargozinonline\/(\d+)["']/i
    );

    if (!postMatch) continue;

    const messageMatch = wrapper.match(
      /<div\b(?=[^>]*class="[^"]*\btgme_widget_message_text\b)[^>]*>([\s\S]*?)<\/div>/i
    );

    // پست‌های صرفاً تصویری یا ویدئویی ارسال نمی‌شوند.
    if (!messageMatch?.[1]) continue;

    const text = cleanPostText(messageMatch[1]);

    // متن خیلی کوتاه یا خالی ارسال نشود.
    if (text.length < 15) continue;

    posts.push({
      id: postMatch[1],
      text,
    });
  }

  const unique = new Map<string, TelegramPost>();

  for (const post of posts) {
    unique.set(post.id, post);
  }

  return [...unique.values()].sort(
    (a, b) => Number(a.id) - Number(b.id)
  );
}

function getSupabaseConfig(env: CloudflareEnv) {
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, ""),
    key: env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  };
}

async function supabaseRequest(
  env: CloudflareEnv,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const { url, key } = getSupabaseConfig(env);

  if (!url || !key) {
    throw new Error("Supabase configuration is missing");
  }

  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "sedaye-smart-worker/1.0",
      ...init.headers,
    },
  });
}

async function getSetting(
  env: CloudflareEnv,
  settingKey: string
): Promise<unknown> {
  const response = await supabaseRequest(
    env,
    `settings?key=eq.${encodeURIComponent(settingKey)}&select=value&limit=1`
  );

  if (!response.ok) {
    throw new Error(`Supabase GET failed: HTTP ${response.status}`);
  }

  const rows: any = await response.json();

  return Array.isArray(rows) && rows.length
    ? rows[0]?.value ?? null
    : null;
}

async function isScheduleEnabled(env: CloudflareEnv): Promise<boolean> {
  const value = await getSetting(env, "schedule_kargozin");

  if (value === false || value === "false") return false;

  if (typeof value === "string") {
    try {
      if (JSON.parse(value) === false) return false;
    } catch {
      // مقدارهای غیر بولی مطابق رفتار قبلی فعال در نظر گرفته می‌شوند.
    }
  }

  return true;
}

async function getSeenIds(env: CloudflareEnv): Promise<string[]> {
  const value = await getSetting(env, SEEN_KEY);

  if (Array.isArray(value)) {
    return value.filter((item): item is string =>
      typeof item === "string"
    );
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is string => typeof item === "string"
        );
      }
    } catch {
      return [];
    }
  }

  return [];
}

async function saveSeenIds(
  env: CloudflareEnv,
  ids: string[]
): Promise<void> {
  const unique = [...new Set(ids)].slice(-MAX_SEEN);

  const response = await supabaseRequest(env, "settings", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      key: SEEN_KEY,
      value: unique,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Supabase save failed: HTTP ${response.status} ${detail.slice(0, 300)}`
    );
  }
}

async function sendText(
  env: CloudflareEnv,
  text: string
): Promise<void> {
  const token = env.BALE_SMART_TOKEN;
  const chatId = env.BALE_GROUP_ID;

  if (!token) throw new Error("BALE_SMART_TOKEN is missing");
  if (!chatId) throw new Error("BALE_GROUP_ID is missing");

  // ارسال تکه‌های متن با رعایت محدودیت طول پیام
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += MAX_MESSAGE_LENGTH) {
    chunks.push(text.slice(i, i + MAX_MESSAGE_LENGTH));
  }

  for (const chunk of chunks) {
    const response = await fetch(
      `https://tapi.bale.ai/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
          disable_web_page_preview: true,
        }),
      }
    );

    const data: any = await response.json();

    if (!response.ok || data?.ok === false) {
      throw new Error(
        `Bale sendMessage failed: ${JSON.stringify(data)}`
      );
    }
  }
}

export async function GET() {
  const startedAt = Date.now();

  try {
    const { env } = await getCloudflareContext({ async: true });

    // تنظیم فعلی پنل حفظ می‌شود؛ اتصال دکمه را بعداً بررسی می‌کنیم.
    if (!(await isScheduleEnabled(env))) {
      return NextResponse.json({
        ok: true,
        enabled: false,
        sent: 0,
        reason: "kargozin_disabled",
      });
    }

    const html = await fetchText(CHANNEL_URL);
    const posts = extractPosts(html);

    if (!posts.length) {
      return NextResponse.json({
        ok: true,
        sent: 0,
        discovered: 0,
        reason: "no_text_posts_found",
        runtime_ms: Date.now() - startedAt,
      });
    }

    const seen = await getSeenIds(env);

    // در اولین اجرا فقط وضعیت فعلی ثبت می‌شود تا مطالب قدیمی
    // ناگهان به گروه ارسال نشوند.
    if (!seen.length) {
      await saveSeenIds(
        env,
        posts.map((post) => post.id)
      );

      return NextResponse.json({
        ok: true,
        sent: 0,
        initialized: true,
        discovered: posts.length,
        reason: "baseline_created",
        runtime_ms: Date.now() - startedAt,
      });
    }

    const seenSet = new Set(seen);
    const newPosts = posts
      .filter((post) => !seenSet.has(post.id))
      .slice(0, MAX_POSTS_PER_RUN);

    const sentIds: string[] = [];
    const failedIds: string[] = [];

    for (const post of newPosts) {
      const message = `${NOTICE}\n\n${post.text}`;

      try {
        await sendText(env, message);
        sentIds.push(post.id);
      } catch (error) {
        console.error(
          "[kargozin] failed to send Telegram post",
          post.id,
          error
        );
        failedIds.push(post.id);
      }
    }

    // فقط پیام‌هایی که با موفقیت ارسال شده‌اند ثبت می‌شوند.
    if (sentIds.length) {
      await saveSeenIds(env, [...seen, ...sentIds]);
    }

    return NextResponse.json({
      ok: true,
      enabled: true,
      discovered: posts.length,
      new_candidates: newPosts.length,
      sent: sentIds.length,
      failed: failedIds.length,
      sent_ids: sentIds,
      failed_ids: failedIds,
      source: CHANNEL_URL,
      runtime_ms: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("[kargozin] route error:", error);

    return NextResponse.json(
      {
        ok: false,
        sent: 0,
        error:
          error instanceof Error ? error.message : String(error),
        runtime_ms: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}

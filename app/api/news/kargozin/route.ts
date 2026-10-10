import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

const SOURCE_URL = "https://ble.ir/s/kargozinonline";
const SETTINGS_KEY = "kargozin_bale_seen_ids";
const NOTICE =
  "🤖 این مطلب به صورت اتوماتیک از کانال کارگزین آنلاین ارسال شده است";

const MAX_POSTS = 5;
const MAX_SEEN = 1000;

function decodeHtml(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCodePoint(Number(n))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16))
    );
}

function cleanText(html: string): string {
  return decodeHtml(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, " ")
      .replace(/https?:\/\/\S+/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[\u200b-\u200f\uFEFF]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isAd(text: string): boolean {
  return /تبلیغات|تبلیغاتی|رپورتاژ|اسپانسر|کد تخفیف|خرید آنلاین|فروش ویژه|ثبت سفارش|عضویت در کانال|تبلیغ پذیرفته می‌شود/i.test(
    text
  );
}

async function getSetting(
  env: CloudflareEnv,
  keyName: string
): Promise<unknown> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    throw new Error("Supabase configuration is missing");
  }

  const res = await fetch(
    `${url}/rest/v1/settings?key=eq.${encodeURIComponent(keyName)}&select=value&limit=1`,
    {
      headers: { apikey: key, Accept: "application/json" },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    throw new Error(`Supabase read failed: ${res.status}`);
  }

  const rows = await res.json() as Array<{ value: unknown }>;
  return rows?.[0]?.value ?? null;
}

async function saveSeen(
  env: CloudflareEnv,
  ids: string[]
): Promise<void> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    throw new Error("Supabase configuration is missing");
  }

  const res = await fetch(`${url}/rest/v1/settings`, {
    method: "POST",
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      key: SETTINGS_KEY,
      value: [...new Set(ids)].slice(-MAX_SEEN),
    }),
  });

  if (!res.ok) {
    throw new Error(`Supabase save failed: ${res.status}`);
  }
}

function parseSeen(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }

  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((v): v is string => typeof v === "string")
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

function extractPosts(html: string) {
  const posts: Array<{ id: string; text: string }> = [];

  // فقط زمانی پست استخراج می‌شود که HTML شناسه و متن قابل‌تشخیص داشته باشد.
  const blocks =
    html.match(
      /<(?:article|div|li)\b[^>]*(?:data-message-id|data-post-id|data-message|post-item|channel-post|message-item)[^>]*>[\s\S]*?<\/(?:article|div|li)>/gi
    ) || [];

  for (const block of blocks) {
    const idMatch =
      block.match(/data-message-id=["']([^"']+)["']/i) ||
      block.match(/data-post-id=["']([^"']+)["']/i) ||
      block.match(/href=["'][^"']*\/p\/([^"'/?#]+)/i);

    if (!idMatch?.[1]) continue;

    const text = cleanText(block);
    if (text.length < 30 || isAd(text)) continue;

    posts.push({ id: idMatch[1], text });
  }

  const unique = new Map<string, { id: string; text: string }>();
  for (const post of posts) unique.set(post.id, post);

  return [...unique.values()];
}

async function sendText(
  env: CloudflareEnv,
  text: string
): Promise<void> {
  if (!env.BALE_SMART_TOKEN || !env.BALE_GROUP_ID) {
    throw new Error("Bale token or group ID is missing");
  }

  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += 3500) {
    chunks.push(text.slice(i, i + 3500));
  }

  for (const chunk of chunks) {
    const res = await fetch(
      `https://tapi.bale.ai/bot${env.BALE_SMART_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.BALE_GROUP_ID,
          text: chunk,
          disable_web_page_preview: true,
        }),
      }
    );

    const data = await res.json() as { ok?: boolean; description?: string };

    if (!res.ok || data.ok === false) {
      throw new Error(data.description || `Bale send failed: ${res.status}`);
    }
  }
}

export async function GET() {
  const started = Date.now();

  try {
    const { env } = await getCloudflareContext({ async: true });

    const enabled = await getSetting(env, "schedule_kargozin");
    if (enabled === false || enabled === "false") {
      return NextResponse.json({
        ok: true,
        enabled: false,
        sent: 0,
      });
    }

    const response = await fetch(SOURCE_URL, {
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 SedayeSmart/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`Bale source returned HTTP ${response.status}`);
    }

    const html = await response.text();
    const posts = extractPosts(html);

    if (posts.length === 0) {
      return NextResponse.json({
        ok: false,
        sent: 0,
        error: "No recognizable posts found in the public Bale page. HTML structure must be inspected.",
        source: SOURCE_URL,
        html_length: html.length,
        runtime_ms: Date.now() - started,
      }, { status: 502 });
    }

    const seen = parseSeen(
      await getSetting(env, SETTINGS_KEY)
    );

    // اولین اجرا: مطالب فعلی ثبت می‌شوند تا خبرهای قدیمی ناگهان ارسال نشوند.
    if (seen.length === 0) {
      await saveSeen(env, posts.map((p) => p.id));

      return NextResponse.json({
        ok: true,
        initialized: true,
        sent: 0,
        discovered: posts.length,
      });
    }

    const seenSet = new Set(seen);
    const fresh = posts
      .filter((p) => !seenSet.has(p.id))
      .slice(0, MAX_POSTS)
      .reverse();

    const sentIds: string[] = [];

    for (const post of fresh) {
      const message = `${NOTICE}\n\n${post.text}`;
      await sendText(env, message);
      sentIds.push(post.id);
    }

    if (sentIds.length) {
      await saveSeen(env, [...seen, ...sentIds]);
    }

    return NextResponse.json({
      ok: true,
      sent: sentIds.length,
      discovered: posts.length,
      runtime_ms: Date.now() - started,
    });
  } catch (error) {
    console.error("[kargozin-bale]", error);

    return NextResponse.json({
      ok: false,
      sent: 0,
      error: error instanceof Error ? error.message : String(error),
      runtime_ms: Date.now() - started,
    }, { status: 500 });
  }
    }


import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

const STATE_KEY = "instagram_bale_repost_state_v1";
const TIME_ZONE = "Asia/Tehran";

const SOURCES = {
  modiryar_com: { limit: 4 },
  "hr.garden": { limit: 2 },
} as const;

type Username = keyof typeof SOURCES;

type Env = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  BALE_SMART_TOKEN?: string;
  BALE_GROUP_ID?: string;
  INSTAGRAM_TEST_SECRET?: string;
  TOOLZERHUB_API_KEY?: string;
};

type Post = {
  id: string;
  shortcode: string;
  caption: string;
  timestamp: number;
  mediaType: "photo" | "video";
  mediaUrl: string;
  sponsored: boolean;
};

type SourceState = {
  sentToday: number;
  sentIds: string[];
  pendingIds?: string[];
};

type State = {
  version: 1;
  tehranDate: string;
  sources: Record<Username, SourceState>;
};

type SettingRow = {
  key: string;
  value: unknown;
};

const TOOLZERHUB_BASE = "https://api.toolzerhub.com";
const TOOLZERHUB_POST_COUNT = 20;

function tehranTime() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const get = (key: string) =>
    parts.find((p) => p.type === key)?.value ?? "";

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

function sourceForHour(hour: number): Username | null {
  if ([14, 16, 20, 22].includes(hour)) {
    return "modiryar_com";
  }

  if ([12, 18].includes(hour)) {
    return "hr.garden";
  }

  return null;
}

function emptyState(date: string): State {
  return {
    version: 1,
    tehranDate: date,
    sources: {
      modiryar_com: {
        sentToday: 0,
        sentIds: [],
        pendingIds: [],
      },
      "hr.garden": {
        sentToday: 0,
        sentIds: [],
        pendingIds: [],
      },
    },
  };
}

function config(env: Env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment variables are missing.");
  }

  return { url, key };
}

async function supabase(
  env: Env,
  path: string,
  init: RequestInit = {},
) {
  const { url, key } = config(env);

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

async function readSetting(
  env: Env,
  key: string,
): Promise<unknown | null> {
  const response = await supabase(
    env,
    `settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
  );

  if (!response.ok) {
    throw new Error(
      `Supabase read failed for ${key}: HTTP ${response.status}`,
    );
  }

  const rows = (await response.json()) as Array<{ value: unknown }>;
  const raw = rows[0]?.value;

  if (raw == null) return null;

  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`Saved setting ${key} is invalid JSON.`);
    }
  }

  return raw;
}

async function writeSetting(
  env: Env,
  key: string,
  value: unknown,
) {
  const response = await supabase(env, "settings?on_conflict=key", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      key,
      value: JSON.stringify(value),
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Supabase write failed for ${key}: HTTP ${response.status} ${await response.text()}`,
    );
  }
}

async function readState(env: Env, date: string): Promise<State> {
  const value = await readSetting(env, STATE_KEY);

  if (value == null) return emptyState(date);

  if (
    typeof value !== "object" ||
    (value as State).version !== 1 ||
    !(value as State).sources
  ) {
    throw new Error("Saved Instagram state has an invalid format.");
  }

  const saved = value as State;

  for (const username of Object.keys(SOURCES) as Username[]) {
    const entry = saved.sources[username];

    if (
      !entry ||
      !Number.isInteger(entry.sentToday) ||
      !Array.isArray(entry.sentIds)
    ) {
      throw new Error(`Invalid saved state for ${username}.`);
    }

    if (!Array.isArray(entry.pendingIds)) {
      entry.pendingIds = [];
    }
  }

  if (saved.tehranDate !== date) {
    return {
      version: 1,
      tehranDate: date,
      sources: {
        modiryar_com: {
          sentToday: 0,
          sentIds: saved.sources.modiryar_com.sentIds,
          pendingIds: saved.sources.modiryar_com.pendingIds ?? [],
        },
        "hr.garden": {
          sentToday: 0,
          sentIds: saved.sources["hr.garden"].sentIds,
          pendingIds: saved.sources["hr.garden"].pendingIds ?? [],
        },
      },
    };
  }

  return saved;
}

async function writeState(env: Env, state: State) {
  await writeSetting(env, STATE_KEY, state);
}

function toolzerHeaders(env: Env) {
  const key = env.TOOLZERHUB_API_KEY;

  if (!key) {
    throw new Error("TOOLZERHUB_API_KEY is missing.");
  }

  return {
    "x-api-key": key,
    Accept: "application/json",
  };
}

async function checkToolzerCredits(env: Env): Promise<number> {
  const response = await fetch(`${TOOLZERHUB_BASE}/v1/credits`, {
    method: "GET",
    headers: toolzerHeaders(env),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(
      `ToolzerHub credit check failed: HTTP ${response.status}.`,
    );
  }

  const result = (await response.json()) as any;
  const candidates = [
    result?.balance,
    result?.data?.balance,
    result?.included_balance,
    result?.data?.included_balance,
    result?.allowance,
    result?.data?.allowance,
  ];

  const available = candidates.find(
    (value) => typeof value === "number" && Number.isFinite(value),
  );

  if (typeof available !== "number") {
    throw new Error("ToolzerHub credit balance was not recognized.");
  }

  return available;
}

async function toolzerGet(
  env: Env,
  path: string,
): Promise<any> {
  const credits = await checkToolzerCredits(env);

  if (credits < 1) {
    throw new Error(
      "ToolzerHub credit balance is insufficient. No paid request was made.",
    );
  }

  const response = await fetch(`${TOOLZERHUB_BASE}${path}`, {
    method: "GET",
    headers: toolzerHeaders(env),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    throw new Error(
      `ToolzerHub request failed: HTTP ${response.status}.`,
    );
  }

  return response.json();
}

async function getProfileId(
  env: Env,
  username: Username,
): Promise<string> {
  const cacheKey = `instagram_toolzerhub_profile_v1_${username}`;
  const cached = await readSetting(env, cacheKey);

  if (
    cached &&
    typeof cached === "object" &&
    typeof (cached as any).id === "string"
  ) {
    return (cached as any).id;
  }

  const result = await toolzerGet(
    env,
    `/v1/instagram/user/info?username_or_url=${encodeURIComponent(username)}&detail=summary`,
  );

  const id = result?.data?.id;

  if (id == null || String(id).length === 0) {
    throw new Error(`ToolzerHub did not return an ID for @${username}.`);
  }

  const profileId = String(id);

  await writeSetting(env, cacheKey, {
    id: profileId,
    username,
    cachedAt: new Date().toISOString(),
  });

  return profileId;
}

function looksLikeAd(post: Post): boolean {
  if (post.sponsored) return true;

  const caption = post.caption
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, " ")
    .toLowerCase();

  const adPatterns = [
    /#ad\b/i,
    /#sponsored\b/i,
    /paid partnership/i,
    /تبلیغ(?:ات)?/i,
    /همکاری تبلیغاتی/i,
    /پست تبلیغاتی/i,
    /اسپانسر/i,
    /کد تخفیف/i,
    /ثبت سفارش/i,

    // اطلاعات تماس و هدایت مخاطب برای خرید یا دریافت خدمات
    /اطلاعات تماس.{0,30}(?:bio|بیو)/i,
    /(?:bio|بیو).{0,30}اطلاعات تماس/i,
    /برای تماس.{0,50}(?:اقدام کنید|تماس بگیرید)/i,
    /جهت تماس.{0,50}(?:اقدام کنید|تماس بگیرید)/i,
    /برای سفارش.{0,50}(?:تماس|دایرکت)/i,
    /جهت سفارش.{0,50}(?:تماس|دایرکت)/i,
    /(?:تماس|ارتباط).{0,40}(?:دایرکت|پیام دهید|اطلاعات تماس)/i,
    /مشاوره رایگان/i,
    /جذب مشتری/i,
  ];

  return adPatterns.some((pattern) => pattern.test(caption));
}

function parseToolzerPost(node: any): Post | null {
  if (!node || typeof node !== "object") return null;

  const shortcode = String(node.code ?? node.shortcode ?? "");
  const id = String(node.id ?? node.pk ?? shortcode);

  const captionValue =
    typeof node.caption === "string"
      ? node.caption
      : node.caption?.text ?? "";

  const caption = String(captionValue).trim();

  const mediaTypeNumber = Number(node.media_type ?? 0);
  const productType = String(node.product_type ?? "").toLowerCase();

  // Carousel posts are skipped because the current Bale sender
  // supports one photo or one video per message.
  if (mediaTypeNumber === 8 || productType === "carousel") {
    return null;
  }

  const videoUrl =
    node.video_versions?.[0]?.url ??
    node.video_url ??
    "";

  const imageUrl =
    node.image_versions2?.candidates?.[0]?.url ??
    node.display_uri ??
    node.display_url ??
    "";

  const isVideo = mediaTypeNumber === 2 || Boolean(videoUrl);
  const mediaUrl = String(isVideo ? videoUrl : imageUrl);

  const timestamp = Number(
    node.taken_at ??
    node.taken_at_timestamp ??
    0,
  );

  if (
    !id ||
    !shortcode ||
    !caption ||
    !mediaUrl ||
    !Number.isFinite(timestamp) ||
    timestamp <= 0
  ) {
    return null;
  }

  return {
    id,
    shortcode,
    caption,
    timestamp,
    mediaType: isVideo ? "video" : "photo",
    mediaUrl,
    sponsored: Boolean(
      node.is_paid_partnership ||
      node.branded_content ||
      node.is_sponsored ||
      (Array.isArray(node.sponsor_tags) && node.sponsor_tags.length > 0),
    ),
  };
}

async function fetchPosts(
  env: Env,
  username: Username,
  date: string,
): Promise<Post[]> {
  const cacheKey =
    `instagram_toolzerhub_posts_v1_${username}_${date}`;

  const cached = await readSetting(env, cacheKey);

  if (
    cached &&
    typeof cached === "object" &&
    Array.isArray((cached as any).posts)
  ) {
    return (cached as any).posts as Post[];
  }

  const profileId = await getProfileId(env, username);

  const result = await toolzerGet(
    env,
    `/v1/instagram/user/posts/by-id?user_id=${encodeURIComponent(profileId)}&count=${TOOLZERHUB_POST_COUNT}`,
  );

  const items = result?.data?.items;

  if (!Array.isArray(items)) {
    throw new Error(
      `ToolzerHub did not return a valid posts list for @${username}.`,
    );
  }

  const posts = items
    .map((item: any) => parseToolzerPost(item))
    .filter((post: Post | null): post is Post => post !== null)
    .sort((a: Post, b: Post) => a.timestamp - b.timestamp);

  await writeSetting(env, cacheKey, {
    username,
    date,
    posts,
    cachedAt: new Date().toISOString(),
  });

  return posts;
}

async function sendToBale(
  env: Env,
  username: Username,
  post: Post,
) {
  const token = env.BALE_SMART_TOKEN;
  const chatId = env.BALE_GROUP_ID;

  if (!token || !chatId) {
    throw new Error("BALE_SMART_TOKEN or BALE_GROUP_ID is missing.");
  }

  const method = post.mediaType === "video" ? "sendVideo" : "sendPhoto";
  const mediaField = post.mediaType === "video" ? "video" : "photo";

  const caption = post.caption
  .replace(
    /(?:^|\n)\s*#پایگاه[_\s‌]+جامع[_\s‌]+مدیریار\s*/giu,
    "\n",
  )
  .replace(
    /(?:^|\n)\s*@(?:athir_360|modiryar_com|mahdi_yarahmadi)\s*/giu,
    "\n",
  )
  .trim();

  const response = await fetch(
    `https://tapi.bale.ai/bot${token}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        [mediaField]: post.mediaUrl,
        caption: caption.slice(0, 1000),
      }),
      signal: AbortSignal.timeout(25000),
    },
  );

  const result = (await response.json().catch(() => null)) as
    | { ok?: boolean; description?: string }
    | null;

  if (!response.ok || result?.ok !== true) {
    throw new Error(
      `Bale ${method} failed: ${result?.description ?? `HTTP ${response.status}`}`,
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { env } = await getCloudflareContext();
    const runtimeEnv = env as Env;
    const url = new URL(request.url);

    // Manual force mode keeps using the existing project secret.
    // Scheduled executions do not require this secret.
    const forceRequested = url.searchParams.get("force") === "1";
    const secret = runtimeEnv.INSTAGRAM_TEST_SECRET;

    const force =
      forceRequested &&
      Boolean(secret) &&
      request.headers.get("x-instagram-test-secret") === secret;

    if (forceRequested && !force) {
      return Response.json(
        { ok: false, error: "Invalid test authorization." },
        { status: 403 },
      );
    }

    const now = tehranTime();
    const scheduledSource = sourceForHour(now.hour);

    if (!force && (now.minute !== 15 || !scheduledSource)) {
      return Response.json({
        ok: true,
        skipped: true,
        reason: "Not a scheduled Tehran publication slot.",
        tehranTime:
          `${now.date} ${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`,
      });
    }

    const requestedSource = url.searchParams.get("source");

    const username: Username = force
      ? requestedSource === "hr.garden"
        ? "hr.garden"
        : "modiryar_com"
      : scheduledSource!;

    const state = await readState(runtimeEnv, now.date);
    const sourceState = state.sources[username];

    if (sourceState.sentToday >= SOURCES[username].limit) {
      return Response.json({
        ok: true,
        skipped: true,
        reason: "Daily limit reached.",
        username,
        sentToday: sourceState.sentToday,
        dailyLimit: SOURCES[username].limit,
      });
    }

    const posts = await fetchPosts(
      runtimeEnv,
      username,
      now.date,
    );

    const sent = new Set(sourceState.sentIds);
    const pending = new Set(sourceState.pendingIds ?? []);

    const candidate = posts.find(
      (post) =>
        !sent.has(post.id) &&
        !pending.has(post.id) &&
        !looksLikeAd(post),
    );

    if (!candidate) {
      return Response.json({
        ok: true,
        skipped: true,
        reason: "No eligible unsent post was found.",
        username,
        scanned: posts.length,
      });
    }

    // Save a pending marker before sending. If the request times out
    // or the result becomes ambiguous, this post will not be retried
    // automatically and risk being sent twice.
    sourceState.pendingIds = [
      ...(sourceState.pendingIds ?? []),
      candidate.id,
    ].slice(-3000);

    state.tehranDate = now.date;
    await writeState(runtimeEnv, state);

    await sendToBale(runtimeEnv, username, candidate);

    sourceState.pendingIds = (
      sourceState.pendingIds ?? []
    ).filter((id) => id !== candidate.id);

    sourceState.sentIds = [
      ...sourceState.sentIds,
      candidate.id,
    ].slice(-3000);

    sourceState.sentToday += 1;

    await writeState(runtimeEnv, state);

    return Response.json({
      ok: true,
      sent: true,
      username,
      postId: candidate.id,
      mediaType: candidate.mediaType,
      sentToday: sourceState.sentToday,
      dailyLimit: SOURCES[username].limit,
      tehranTime:
        `${now.date} ${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`,
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

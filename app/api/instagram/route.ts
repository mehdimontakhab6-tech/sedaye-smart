import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

const STATE_KEY = "instagram_bale_repost_state_v1";
const TIME_ZONE = "Asia/Tehran";

const SOURCES = {
  modiryar_com: { limit: 6 },
  "hr.garden": { limit: 3 },
} as const;

type Username = keyof typeof SOURCES;

type Env = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  BALE_SMART_TOKEN?: string;
  BALE_GROUP_ID?: string;
  INSTAGRAM_TEST_SECRET?: string;
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
};

type State = {
  version: 1;
  tehranDate: string;
  sources: Record<Username, SourceState>;
};

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
  if ([14, 15, 17, 18, 20, 21].includes(hour)) {
    return "modiryar_com";
  }

  if ([16, 19, 22].includes(hour)) {
    return "hr.garden";
  }

  return null;
}

function emptyState(date: string): State {
  return {
    version: 1,
    tehranDate: date,
    sources: {
      modiryar_com: { sentToday: 0, sentIds: [] },
      "hr.garden": { sentToday: 0, sentIds: [] },
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

async function readState(env: Env, date: string): Promise<State> {
  const response = await supabase(
    env,
    `settings?key=eq.${encodeURIComponent(STATE_KEY)}&select=value&limit=1`,
  );

  if (!response.ok) {
  const contentType = response.headers.get("content-type") ?? "unknown";

  throw new Error(
    `Instagram @${username} returned HTTP ${response.status}; content-type=${contentType}.`,
  );
  }

  const rows = (await response.json()) as Array<{ value: unknown }>;
  let value: unknown = rows[0]?.value;

  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error("Saved Instagram state is invalid JSON.");
    }
  }

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
  }

  if (saved.tehranDate !== date) {
    return {
      version: 1,
      tehranDate: date,
      sources: {
        modiryar_com: {
          sentToday: 0,
          sentIds: saved.sources.modiryar_com.sentIds,
        },
        "hr.garden": {
          sentToday: 0,
          sentIds: saved.sources["hr.garden"].sentIds,
        },
      },
    };
  }

  return saved;
}

async function writeState(env: Env, state: State) {
  const response = await supabase(env, "settings?on_conflict=key", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      key: STATE_KEY,
      value: state,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Supabase write failed: HTTP ${response.status} ${await response.text()}`,
    );
  }
}

function looksLikeAd(post: Post): boolean {
  if (post.sponsored) return true;

  return [
    /#ad\b/i,
    /#sponsored\b/i,
    /paid partnership/i,
    /تبلیغ(?:ات)?/i,
    /همکاری تبلیغاتی/i,
    /پست تبلیغاتی/i,
    /کد تخفیف/i,
    /ثبت سفارش/i,
    /اسپانسر/i,
  ].some((pattern) => pattern.test(post.caption));
}

function parsePost(node: any): Post | null {
  if (!node || typeof node !== "object") return null;

  const shortcode = String(node.shortcode ?? "");
  const id = String(node.id ?? node.pk ?? shortcode);
  const caption = String(
    node.edge_media_to_caption?.edges?.[0]?.node?.text ??
    node.caption?.text ??
    "",
  ).trim();

  const isVideo = Boolean(node.is_video);
  const mediaUrl = String(
    isVideo
      ? node.video_url ?? ""
      : node.display_url ?? node.thumbnail_src ?? "",
  );

  if (!id || !shortcode || !caption || !mediaUrl) return null;

  return {
    id,
    shortcode,
    caption,
    timestamp: Number(node.taken_at_timestamp ?? 0),
    mediaType: isVideo ? "video" : "photo",
    mediaUrl,
    sponsored: Boolean(
      node.is_paid_partnership ||
      node.branded_content ||
      (Array.isArray(node.sponsor_tags) && node.sponsor_tags.length > 0),
    ),
  };
}

async function fetchPosts(username: Username): Promise<Post[]> {
  const response = await fetch(
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
        Accept: "*/*",
        "X-IG-App-ID": "936619743392459",
        "X-Requested-With": "XMLHttpRequest",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    },
  );

  if (!response.ok) {
    throw new Error(`Instagram @${username} returned HTTP ${response.status}.`);
  }

  const data = (await response.json()) as any;
  const edges = data?.data?.user?.edge_owner_to_timeline_media?.edges;

  if (!Array.isArray(edges)) {
    throw new Error(`No public post data was returned for @${username}.`);
  }

  return edges
    .map((edge: any) => parsePost(edge?.node))
    .filter((post: Post | null): post is Post => post !== null)
    .sort((a: Post, b: Post) => a.timestamp - b.timestamp);
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

  const caption =
    `${post.caption}\n\nمنبع: @${username}\n` +
    `https://www.instagram.com/p/${post.shortcode}/`;

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

    if (!force && (![15, 16].includes(now.minute) || !scheduledSource)) {
      return Response.json({
        ok: true,
        skipped: true,
        reason: "Not a scheduled Tehran publication slot.",
        tehranTime: `${now.date} ${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`,
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
      });
    }

    const posts = await fetchPosts(username);
    const sent = new Set(sourceState.sentIds);

    const candidate = posts.find(
      (post) => !sent.has(post.id) && !looksLikeAd(post),
    );

    if (!candidate) {
      return Response.json({
        ok: true,
        skipped: true,
        reason: "No eligible unsent post with caption and media was found.",
        username,
        scanned: posts.length,
      });
    }

    await sendToBale(runtimeEnv, username, candidate);

    sourceState.sentIds = [...sourceState.sentIds, candidate.id].slice(-3000);
    sourceState.sentToday += 1;
    state.tehranDate = now.date;

    await writeState(runtimeEnv, state);

    return Response.json({
      ok: true,
      sent: true,
      username,
      postId: candidate.id,
      mediaType: candidate.mediaType,
      sentToday: sourceState.sentToday,
      dailyLimit: SOURCES[username].limit,
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

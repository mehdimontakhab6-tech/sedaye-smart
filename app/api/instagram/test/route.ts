
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

const TIME_ZONE = "Asia/Tehran";
const USERNAMES = ["modiryar_com", "hr.garden"] as const;
const POSTS_PER_FETCH = 20;

const PROFILE_KEY_PREFIX = "instagram_toolzerhub_profile_v1_";
const POSTS_KEY_PREFIX = "instagram_toolzerhub_posts_v1_";

type Env = {
  TOOLZERHUB_API_KEY?: string;
  INSTAGRAM_TEST_SECRET?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

function tehranDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (name: string) =>
    parts.find((part) => part.type === name)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function supabaseConfig(env: Env) {
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
  const { url, key } = supabaseConfig(env);

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
  const response = await supabaseRequest(
    env,
    `settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
  );

  if (!response.ok) {
    throw new Error(`Supabase read failed: HTTP ${response.status}`);
  }

  const rows = (await response.json()) as Array<{ value: unknown }>;
  const value = rows[0]?.value;

  if (value == null) return null;

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`Invalid JSON stored in Supabase key: ${key}`);
    }
  }

  return value;
}

async function writeSetting(
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
      body: JSON.stringify({
        key,
        value: JSON.stringify(value),
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Supabase write failed: HTTP ${response.status} ${await response.text()}`,
    );
  }
}

async function toolzerhubRequest(
  apiKey: string,
  path: string,
): Promise<any> {
  const response = await fetch(
    `https://api.toolzerhub.com${path}`,
    {
      headers: {
        "x-api-key": apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    },
  );

  const body = await response.text();

  let data: any;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(
      `ToolzerHub returned invalid JSON: HTTP ${response.status}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error?.message ??
      `ToolzerHub request failed: HTTP ${response.status}`,
    );
  }

  return data;
}

// این درخواست طبق اطلاعات آزمایش قبلی رایگان است.
// اگر موجودی قابل تشخیص نباشد، برای جلوگیری از مصرف ناخواسته متوقف می‌شویم.
async function checkCredits(apiKey: string): Promise<number> {
  const data = await toolzerhubRequest(apiKey, "/v1/credits");

  const candidates = [
    data?.data?.balance,
    data?.balance,
    data?.data?.included_balance,
    data?.included_balance,
    data?.data?.allowance,
    data?.allowance,
  ];

  const balance = candidates.find(
    (value) =>
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0,
  );

  if (typeof balance !== "number") {
    throw new Error(
      "Could not verify ToolzerHub credit balance. No paid request was made.",
    );
  }

  return balance;
}

async function getProfileId(
  env: Env,
  apiKey: string,
  username: string,
): Promise<{ id: string; cached: boolean }> {
  const key = `${PROFILE_KEY_PREFIX}${username}`;
  const saved = await readSetting(env, key);

  if (
    saved &&
    typeof saved === "object" &&
    typeof (saved as any).id === "string"
  ) {
    return {
      id: (saved as any).id,
      cached: true,
    };
  }

  const balance = await checkCredits(apiKey);

  if (balance < 1) {
    throw new Error(
      `Insufficient ToolzerHub credits to look up @${username}.`,
    );
  }

  const data = await toolzerhubRequest(
    apiKey,
    `/v1/instagram/user/info?username_or_url=${encodeURIComponent(username)}&detail=summary`,
  );

  const id = data?.data?.id;

  if (id == null || String(id).trim() === "") {
    throw new Error(`Profile ID not found for @${username}.`);
  }

  const profileId = String(id);

  await writeSetting(env, key, {
    id: profileId,
    username,
    savedAt: new Date().toISOString(),
  });

  return {
    id: profileId,
    cached: false,
  };
}

function summarizePost(item: any) {
  const videoUrl = item?.video_versions?.[0]?.url ?? "";
  const imageUrl =
    item?.image_versions2?.candidates?.[0]?.url ??
    item?.display_uri ??
    "";

  const mediaType = Number(item?.media_type);

  return {
    id: String(item?.id ?? item?.pk ?? item?.code ?? ""),
    shortcode: item?.code ?? null,
    timestamp: Number(item?.taken_at ?? 0),
    caption: String(item?.caption?.text ?? "").trim(),
    mediaType,
    mediaUrl: videoUrl || imageUrl,
    mediaAvailable: Boolean(videoUrl || imageUrl),
    sponsored: Boolean(
      item?.is_paid_partnership ||
      item?.branded_content ||
      (Array.isArray(item?.sponsor_tags) &&
        item.sponsor_tags.length > 0),
    ),
  };
}

async function getPosts(
  env: Env,
  apiKey: string,
  username: string,
  profileId: string,
  date: string,
): Promise<{ posts: ReturnType<typeof summarizePost>[]; cached: boolean }> {
  const key = `${POSTS_KEY_PREFIX}${username}_${date}`;
  const saved = await readSetting(env, key);

  if (
    saved &&
    typeof saved === "object" &&
    Array.isArray((saved as any).posts)
  ) {
    return {
      posts: (saved as any).posts,
      cached: true,
    };
  }

  const balance = await checkCredits(apiKey);

  if (balance < 1) {
    throw new Error(
      `Insufficient ToolzerHub credits to fetch posts for @${username}.`,
    );
  }

  const data = await toolzerhubRequest(
    apiKey,
    `/v1/instagram/user/posts/by-id?user_id=${encodeURIComponent(profileId)}&count=${POSTS_PER_FETCH}`,
  );

  const items = Array.isArray(data?.data?.items)
    ? data.data.items
    : [];

  const posts = items
    .map((item: any) => summarizePost(item))
    .filter(
      (post: ReturnType<typeof summarizePost>) =>
        post.id &&
        post.shortcode &&
        post.timestamp > 0 &&
        post.caption &&
        post.mediaAvailable &&
        (post.mediaType === 1 || post.mediaType === 2),
    )
    .sort(
      (
        a: ReturnType<typeof summarizePost>,
        b: ReturnType<typeof summarizePost>,
      ) => a.timestamp - b.timestamp,
    );

  // فقط پس از دریافت پاسخ معتبر، نتیجه در Supabase ذخیره می‌شود.
  await writeSetting(env, key, {
    username,
    date,
    fetchedAt: new Date().toISOString(),
    posts,
  });

  return {
    posts,
    cached: false,
  };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { env } = await getCloudflareContext();
    const runtimeEnv = env as Env;

    const secret = runtimeEnv.INSTAGRAM_TEST_SECRET?.trim();
    const suppliedSecret =
      request.headers.get("x-instagram-test-secret");

    if (!secret || suppliedSecret !== secret) {
      return Response.json(
        {
          ok: false,
          error: "Invalid test authorization.",
        },
        { status: 403 },
      );
    }

    const apiKey = runtimeEnv.TOOLZERHUB_API_KEY?.trim();

    if (!apiKey) {
      return Response.json(
        {
          ok: false,
          step: "secret-check",
          message: "ToolzerHub API key is missing.",
        },
        { status: 500 },
      );
    }

    // بررسی اتصال Supabase پیش از درخواست‌های پولی
    supabaseConfig(runtimeEnv);

    const date = tehranDate();
    const results = [];

    for (const username of USERNAMES) {
      const profile = await getProfileId(
        runtimeEnv,
        apiKey,
        username,
      );

      const result = await getPosts(
        runtimeEnv,
        apiKey,
        username,
        profile.id,
        date,
      );

      results.push({
        username,
        profileFound: true,
        profileIdCached: profile.cached,
        postsCached: result.cached,
        postsCount: result.posts.length,
        posts: result.posts.map((post) => ({
          shortcode: post.shortcode,
          timestamp: post.timestamp,
          captionAvailable: Boolean(post.caption),
          mediaType: post.mediaType,
          mediaAvailable: post.mediaAvailable,
          sponsored: post.sponsored,
        })),
      });
    }

    return Response.json({
      ok: true,
      test: "toolzerhub-supabase-cache-read-only",
      tehranDate: date,
      baleSending: false,
      results,
      message: "Profiles and post lists checked successfully.",
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        step: "instagram-test",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 },
    );
  }
}

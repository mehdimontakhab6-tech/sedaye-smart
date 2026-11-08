import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

const STATE_KEY = "instagram_bale_repost_state_v1";
const LOCK_KEY = "instagram_bale_repost_lock_v1";
const LOCK_LEASE_MS = 10 * 60 * 1000;
const TIME_ZONE = "Asia/Tehran";

const SOURCES = {
  modiryar_com: { limit: 4 },
  "hr.garden": { limit: 2 },
  "hr.gofteman": { limit: 3 },
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

type LockValue = {
  token: string;
  leaseUntil: number;
};

type ArchiveMeta = {
  version: 1;
  username: Username;
  pageCount: number;
  nextMaxId: string | null;
  moreAvailable: boolean;
  lastRequestDate: string | null;
};

const TOOLZERHUB_BASE = "https://api.toolzerhub.com";
const TOOLZERHUB_POST_COUNT = 20;
const TOOLZER_DAILY_LIMIT = 3;

const TOOLZER_DAILY_KEY = "instagram_toolzerhub_daily_calls_v1";

const ARCHIVE_META_PREFIX =
  "instagram_toolzerhub_archive_meta_v1_";

const ARCHIVE_PAGE_PREFIX =
  "instagram_toolzerhub_archive_page_v1_";

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

  if ([15, 18].includes(hour)) {
    return "hr.garden";
  }

  if ([17, 19, 21].includes(hour)) {
    return "hr.gofteman";
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
      "hr.gofteman": {
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

  const rows = (await response.json()) as Array<{
    value: unknown;
  }>;

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

/**
 * Acquires a global Instagram execution lock.
 *
 * The insert is atomic because the settings.key column has a unique
 * constraint. An expired lock can only be replaced using a conditional
 * update matching its previous exact value.
 */
async function acquireInstagramLock(
  env: Env,
): Promise<LockValue | null> {
  const lock: LockValue = {
    token: crypto.randomUUID(),
    leaseUntil: Date.now() + LOCK_LEASE_MS,
  };

  const lockRaw = JSON.stringify(lock);

  const insertResponse = await supabase(
    env,
    "settings?on_conflict=key",
    {
      method: "POST",
      headers: {
        Prefer: "resolution=ignore-duplicates,return=representation",
      },
      body: JSON.stringify({
        key: LOCK_KEY,
        value: lockRaw,
      }),
    },
  );

  if (!insertResponse.ok) {
    throw new Error(
      `Instagram lock insert failed: HTTP ${insertResponse.status} ${await insertResponse.text()}`,
    );
  }

  const insertedRows = (await insertResponse.json()) as Array<{
    key: string;
    value: string;
  }>;

  if (insertedRows.length > 0) {
    return lock;
  }

  const readResponse = await supabase(
    env,
    `settings?key=eq.${encodeURIComponent(LOCK_KEY)}&select=value&limit=1`,
  );

  if (!readResponse.ok) {
    throw new Error(
      `Instagram lock read failed: HTTP ${readResponse.status}`,
    );
  }

  const rows = (await readResponse.json()) as Array<{
    value: string;
  }>;

  const previousRaw = rows[0]?.value;

  if (typeof previousRaw !== "string") {
    return null;
  }

  let previousLock: LockValue;

  try {
    previousLock = JSON.parse(previousRaw) as LockValue;
  } catch {
    throw new Error("Instagram lock contains invalid JSON.");
  }

  if (
    typeof previousLock.leaseUntil !== "number" ||
    previousLock.leaseUntil > Date.now()
  ) {
    return null;
  }

  const updateResponse = await supabase(
    env,
    `settings?key=eq.${encodeURIComponent(LOCK_KEY)}&value=eq.${encodeURIComponent(previousRaw)}`,
    {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        value: lockRaw,
      }),
    },
  );

  if (!updateResponse.ok) {
    throw new Error(
      `Instagram lock renewal failed: HTTP ${updateResponse.status}`,
    );
  }

  const updatedRows = (await updateResponse.json()) as Array<{
    key: string;
    value: string;
  }>;

  return updatedRows.length > 0 ? lock : null;
}

/**
 * Releases only the lock owned by this execution.
 */
async function releaseInstagramLock(
  env: Env,
  lock: LockValue,
): Promise<void> {
  try {
    const ownRaw = JSON.stringify(lock);

    await supabase(
      env,
      `settings?key=eq.${encodeURIComponent(LOCK_KEY)}&value=eq.${encodeURIComponent(ownRaw)}`,
      {
        method: "DELETE",
        headers: {
          Prefer: "return=minimal",
        },
      },
    );
  } catch {
    // The lock has a finite lease and can be reclaimed after expiry.
  }
}

async function readState(
  env: Env,
  date: string,
): Promise<State> {
  const value = await readSetting(env, STATE_KEY);

  if (value == null) {
    return emptyState(date);
  }

  if (
    typeof value !== "object" ||
    (value as any).version !== 1 ||
    !(value as any).sources ||
    typeof (value as any).sources !== "object"
  ) {
    throw new Error("Saved Instagram state has an invalid format.");
  }

  const saved = value as any;
  const sameDay = saved.tehranDate === date;

  const sources = {} as Record<Username, SourceState>;

  for (const username of Object.keys(SOURCES) as Username[]) {
    const entry = saved.sources[username];

    if (
      entry &&
      (
        !Array.isArray(entry.sentIds) ||
        (
          entry.pendingIds !== undefined &&
          !Array.isArray(entry.pendingIds)
        )
      )
    ) {
      throw new Error(`Invalid saved state for ${username}.`);
    }

    const sentIds: string[] = Array.isArray(entry?.sentIds)
      ? Array.from(
          new Set<string>(
            (entry.sentIds as unknown[]).map(
              (id: unknown): string => String(id),
            ),
          ),
        )
      : [];

    const pendingIds: string[] = Array.isArray(entry?.pendingIds)
      ? Array.from(
          new Set<string>(
            (entry.pendingIds as unknown[]).map(
              (id: unknown): string => String(id),
            ),
          ),
        )
      : [];

    sources[username] = {
      sentToday:
        sameDay && Number.isInteger(entry?.sentToday)
          ? entry.sentToday
          : 0,

      sentIds,

      pendingIds,
    };
  }

  return {
    version: 1,
    tehranDate: date,
    sources,
  };
}

async function writeState(
  env: Env,
  state: State,
) {
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

async function checkToolzerCredits(
  env: Env,
): Promise<number> {
  const response = await fetch(
    `${TOOLZERHUB_BASE}/v1/credits`,
    {
      method: "GET",
      headers: toolzerHeaders(env),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    },
  );

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
    (value) =>
      typeof value === "number" &&
      Number.isFinite(value),
  );

  if (typeof available !== "number") {
    throw new Error(
      "ToolzerHub credit balance was not recognized.",
    );
  }

  return available;
}

/**
 * Reserves one daily request slot before making a paid request.
 *
 * Instagram executions are serialized by the global lock.
 * The reservation is deliberately conservative: an ambiguous
 * timeout must not allow another request to exceed the daily limit.
 */
async function reserveToolzerRequest(
  env: Env,
  date: string,
): Promise<void> {
  const saved = await readSetting(
    env,
    TOOLZER_DAILY_KEY,
  );

  let calls = 0;

  if (
    saved &&
    typeof saved === "object" &&
    (saved as any).date === date &&
    Number.isInteger((saved as any).calls)
  ) {
    calls = (saved as any).calls;
  }

  if (calls >= TOOLZER_DAILY_LIMIT) {
    throw new Error(
      `Daily ToolzerHub request limit reached (${TOOLZER_DAILY_LIMIT}).`,
    );
  }

  await writeSetting(env, TOOLZER_DAILY_KEY, {
    date,
    calls: calls + 1,
    updatedAt: new Date().toISOString(),
  });
}

async function toolzerGet(
  env: Env,
  path: string,
  date: string,
): Promise<any> {
  const credits = await checkToolzerCredits(env);

  if (credits < 1) {
    throw new Error(
      "ToolzerHub credit balance is insufficient. No paid request was made.",
    );
  }

  await reserveToolzerRequest(env, date);

  const response = await fetch(
    `${TOOLZERHUB_BASE}${path}`,
    {
      method: "GET",
      headers: toolzerHeaders(env),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    },
  );

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
  date: string,
): Promise<string> {
  const cacheKey =
    `instagram_toolzerhub_profile_v1_${username}`;

  const cached = await readSetting(env, cacheKey);

  if (
    cached &&
    typeof cached === "object" &&
    (
      typeof (cached as any).id === "string" ||
      typeof (cached as any).id === "number"
    )
  ) {
    return String((cached as any).id);
  }

  const result = await toolzerGet(
    env,
    `/v1/instagram/user/info?username_or_url=${encodeURIComponent(username)}&detail=summary`,
    date,
  );

  const id = result?.data?.id;

  if (id == null || String(id).length === 0) {
    throw new Error(
      `ToolzerHub did not return an ID for @${username}.`,
    );
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

    /اطلاعات تماس.{0,30}(?:bio|بیو)/i,
    /(?:bio|بیو).{0,30}اطلاعات تماس/i,
    /برای تماس.{0,50}(?:اقدام کنید|تماس بگیرید)/i,
    /جهت تماس.{0,50}(?:اقدام کنید|تماس بگیرید)/i,
    /برای سفارش.{0,50}(?:تماس|دایرکت)/i,
    /جهت سفارش.{0,50}(?:تماس|دایرکت)/i,
    /(?:تماس|ارتباط).{0,40}(?:دایرکت|پیام دهید|اطلاعات تماس)/i,
    /مشاوره رایگان/i,
    /دایرکت\s*دهید/i,
    /جذب مشتری/i,
  ];

  return adPatterns.some((pattern) =>
    pattern.test(caption),
  );
}

function parseToolzerPost(node: any): Post | null {
  if (!node || typeof node !== "object") {
    return null;
  }

  const shortcode = String(
    node.code ?? node.shortcode ?? "",
  );

  const id = String(
    node.id ?? node.pk ?? shortcode,
  );

  const captionValue =
    typeof node.caption === "string"
      ? node.caption
      : node.caption?.text ?? "";

  const caption = String(captionValue).trim();

  const mediaTypeNumber = Number(
    node.media_type ?? 0,
  );

  const productType = String(
    node.product_type ?? "",
  ).toLowerCase();

  // Carousel posts are skipped because the current Bale sender
  // supports one photo or one video per message.
  if (
    mediaTypeNumber === 8 ||
    productType === "carousel"
  ) {
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

  const isVideo =
    mediaTypeNumber === 2 ||
    Boolean(videoUrl);

  const mediaUrl = String(
    isVideo ? videoUrl : imageUrl,
  );

  const timestamp = Number(
    node.taken_at ??
    node.taken_at_timestamp ??
    0,
  );

  if (
    !id ||
    !shortcode ||
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
      (
        Array.isArray(node.sponsor_tags) &&
        node.sponsor_tags.length > 0
      ),
    ),
  };
}

function archiveMetaKey(username: Username) {
  return `${ARCHIVE_META_PREFIX}${username}`;
}

function archivePageKey(
  username: Username,
  page: number,
) {
  return (
    `${ARCHIVE_PAGE_PREFIX}${username}_` +
    String(page).padStart(6, "0")
  );
}

async function readArchiveMeta(
  env: Env,
  username: Username,
): Promise<ArchiveMeta> {
  const saved = await readSetting(
    env,
    archiveMetaKey(username),
  );

  if (saved == null) {
    return {
      version: 1,
      username,
      pageCount: 0,
      nextMaxId: null,
      moreAvailable: true,
      lastRequestDate: null,
    };
  }

  if (
    typeof saved !== "object" ||
    (saved as any).version !== 1 ||
    (saved as any).username !== username ||
    !Number.isInteger((saved as any).pageCount) ||
    (saved as any).pageCount < 0
  ) {
    throw new Error(
      `Invalid archive metadata for @${username}.`,
    );
  }

  return saved as ArchiveMeta;
}

/**
 * Imports the current day's legacy cache, if present.
 *
 * The migrated page is preserved and is not overwritten by
 * a new ToolzerHub request during the same execution.
 */
async function migrateLegacyDailyCache(
  env: Env,
  username: Username,
  date: string,
  meta: ArchiveMeta,
): Promise<ArchiveMeta> {
  if (meta.pageCount !== 0) {
    return meta;
  }

  const legacyKey =
    `instagram_toolzerhub_posts_v1_${username}_${date}`;

  const cached = await readSetting(env, legacyKey);

  if (
    !cached ||
    typeof cached !== "object" ||
    !Array.isArray((cached as any).posts)
  ) {
    return meta;
  }

  const posts = (cached as any).posts.filter(
    (post: any) =>
      post &&
      typeof post.id === "string" &&
      typeof post.timestamp === "number" &&
      typeof post.mediaUrl === "string",
  ) as Post[];

  await writeSetting(
    env,
    archivePageKey(username, 0),
    {
      username,
      page: 0,
      posts,
      savedAt: new Date().toISOString(),
      migratedFromLegacyCache: true,
    },
  );

  const migrated: ArchiveMeta = {
    ...meta,
    pageCount: 1,
    nextMaxId: null,
    moreAvailable: false,
  };

  await writeSetting(
    env,
    archiveMetaKey(username),
    migrated,
  );

  console.info("[Instagram] Legacy cache migrated", {
    username,
    posts: posts.length,
    date,
  });

  return migrated;
}

/**
 * Fetches at most one new posts page per account per Tehran day.
 *
 * Daily paid request policy:
 * - One request for each account per day.
 * - Maximum three paid requests across all accounts per day.
 * - A missing profile ID uses that account's daily request.
 * - The posts page is fetched on a later day after profile lookup.
 *
 * Each page is saved before the pagination cursor is advanced.
 */
async function ensureDailyArchivePage(
  env: Env,
  username: Username,
  date: string,
): Promise<void> {
  let meta = await readArchiveMeta(
    env,
    username,
  );

  if (meta.lastRequestDate === date) {
    console.info("[Instagram] Daily archive request already completed", {
      username,
      date,
      pageCount: meta.pageCount,
    });
    return;
  }

  if (
    meta.pageCount > 0 &&
    !meta.moreAvailable
  ) {
    console.info("[Instagram] Archive has no more pages", {
      username,
      pageCount: meta.pageCount,
    });
    return;
  }

  const previousPageCount = meta.pageCount;

  meta = await migrateLegacyDailyCache(
    env,
    username,
    date,
    meta,
  );

  // اگر کش قدیمی مهاجرت شد، همان صفحه را نگه می‌داریم.
  // در این اجرا صفحه جدید دریافت نمی‌کنیم تا صفحه صفر بازنویسی نشود.
  if (meta.pageCount > previousPageCount) {
    console.info("[Instagram] Legacy archive migration completed; fetch deferred", {
      username,
      pageCount: meta.pageCount,
    });
    return;
  }

  if (
    meta.pageCount > 0 &&
    !meta.moreAvailable
  ) {
    return;
  }

  const profileCacheKey =
    `instagram_toolzerhub_profile_v1_${username}`;

  const cachedProfile = await readSetting(
    env,
    profileCacheKey,
  );

  // ثبت تاریخ تلاش پیش از درخواست پولی؛
  // در صورت timeout نیز همان روز درخواست دیگری نمی‌زنیم.
  meta.lastRequestDate = date;

  await writeSetting(
    env,
    archiveMetaKey(username),
    meta,
  );

  let profileId: string;

  if (
    cachedProfile &&
    typeof cachedProfile === "object" &&
    (
      typeof (cachedProfile as any).id === "string" ||
      typeof (cachedProfile as any).id === "number"
    )
  ) {
    profileId = String((cachedProfile as any).id);
  } else {
    // فقط یک درخواست پولی برای شناسایی پروفایل.
    // دریافت صفحه پست‌ها به روز بعد موکول می‌شود.
    await getProfileId(
      env,
      username,
      date,
    );

    console.info("[Instagram] Profile ID initialized", {
      username,
      date,
      note: "Posts collection starts on the next Tehran day.",
    });

    return;
  }

  const params = new URLSearchParams({
    user_id: profileId,
    count: String(TOOLZERHUB_POST_COUNT),
  });

  if (meta.nextMaxId) {
    params.set("next_max_id", meta.nextMaxId);
  }

  const result = await toolzerGet(
    env,
    `/v1/instagram/user/posts/by-id?${params.toString()}`,
    date,
  );

  const data = result?.data;
  const items = data?.items;

  if (!Array.isArray(items)) {
    throw new Error(
      `ToolzerHub did not return a valid posts list for @${username}.`,
    );
  }

  const posts = items
    .map((item: any) => parseToolzerPost(item))
    .filter(
      (post: Post | null): post is Post =>
        post !== null,
    )
    .sort(
      (a: Post, b: Post) =>
        a.timestamp - b.timestamp,
    );

  const currentPage = meta.pageCount;

  // ابتدا صفحه را ذخیره می‌کنیم.
  // تا قبل از ذخیره موفق، cursor جلو نمی‌رود.
  await writeSetting(
    env,
    archivePageKey(username, currentPage),
    {
      username,
      page: currentPage,
      posts,
      receivedFromApi: items.length,
      savedAt: new Date().toISOString(),
    },
  );

  // next_max_id ممکن است رشته یا عدد باشد.
  const rawNextMaxId =
    data?.next_max_id ??
    data?.nextMaxId ??
    null;

  const nextMaxId =
    rawNextMaxId === null ||
    rawNextMaxId === undefined ||
    String(rawNextMaxId).trim() === ""
      ? null
      : String(rawNextMaxId);

  const rawMoreAvailable =
    data?.more_available ??
    data?.moreAvailable ??
    false;

  const moreAvailable =
    rawMoreAvailable === true ||
    rawMoreAvailable === 1 ||
    rawMoreAvailable === "true";

  const canContinue =
    moreAvailable &&
    nextMaxId !== null &&
    nextMaxId !== meta.nextMaxId;

  const previousCursor = meta.nextMaxId;

  meta = {
    version: 1,
    username,
    pageCount: currentPage + 1,
    nextMaxId: canContinue ? nextMaxId : null,
    moreAvailable: canContinue,
    lastRequestDate: date,
  };

  await writeSetting(
    env,
    archiveMetaKey(username),
    meta,
  );

  console.info("[Instagram] Archive page saved", {
    username,
    page: currentPage,
    receivedFromApi: items.length,
    validPostsSaved: posts.length,
    previousCursor,
    nextCursor: meta.nextMaxId,
    moreAvailable: meta.moreAvailable,
    nextPageWillBeCollected: meta.moreAvailable,
    date,
  });

  if (moreAvailable && !canContinue) {
    console.warn(
      "[Instagram] API reported more posts but returned no usable next cursor",
      {
        username,
        rawNextMaxId,
        previousCursor,
      },
    );
  }
}

/**
 * Reads every stored archive page, removes duplicate post IDs,
 * and returns the posts from oldest to newest.
 */
async function readArchivedPosts(
  env: Env,
  username: Username,
): Promise<Post[]> {
  const prefix =
    `${ARCHIVE_PAGE_PREFIX}${username}_`;

  const response = await supabase(
    env,
    `settings?key=like.${encodeURIComponent(prefix)}%2A&select=key,value&order=key.asc`,
  );

  if (!response.ok) {
    throw new Error(
      `Instagram archive read failed: HTTP ${response.status}`,
    );
  }

  const rows = (await response.json()) as Array<{
    key: string;
    value: unknown;
  }>;

  const unique = new Map<string, Post>();

  for (const row of rows) {
    let page: any = row.value;

    if (typeof page === "string") {
      try {
        page = JSON.parse(page);
      } catch {
        console.warn("[Instagram] Invalid archive page JSON", {
          username,
          key: row.key,
        });
        continue;
      }
    }

    if (
      !page ||
      page.username !== username ||
      !Array.isArray(page.posts)
    ) {
      continue;
    }

    for (const post of page.posts) {
      if (
        post &&
        typeof post.id === "string" &&
        post.id.length > 0 &&
        typeof post.shortcode === "string" &&
        typeof post.timestamp === "number" &&
        Number.isFinite(post.timestamp) &&
        post.timestamp > 0 &&
        typeof post.mediaUrl === "string" &&
        post.mediaUrl.length > 0 &&
        (
          post.mediaType === "photo" ||
          post.mediaType === "video"
        )
      ) {
        unique.set(post.id, post as Post);
      }
    }
  }

  const posts = [...unique.values()].sort(
    (a, b) =>
      a.timestamp - b.timestamp ||
      a.id.localeCompare(b.id),
  );

  console.info("[Instagram] Archive loaded", {
    username,
    pagesRead: rows.length,
    uniquePosts: posts.length,
    oldestPostTime:
      posts.length > 0 ? posts[0].timestamp : null,
    newestPostTime:
      posts.length > 0
        ? posts[posts.length - 1].timestamp
        : null,
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

  const TITLE =
    "🟢 رویکردها و فرآیند توسعه مدیریت";

  const MEDIA_CAPTION_LIMIT = 1024;
  const TEXT_MESSAGE_LIMIT = 4000;

  const method =
    post.mediaType === "video" ? "sendVideo" : "sendPhoto";

  const mediaField =
    post.mediaType === "video" ? "video" : "photo";

  let cleanedCaption = post.caption
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200b\u200c\u200d\u200e\u200f\u2060\ufeff]/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return true;

      if (
        /^#?پایگاه[_\s]+جامع[_\s]+مدیریار$/u.test(line)
      ) {
        return false;
      }

      if (
        /^@(?:ghare_tanhae|mahdi_yarahmadi|athir_360|modiryar_com)$/i.test(line)
      ) {
        return false;
      }

      return true;
    })
    .join("\n");

  const hashtagOnlyLine =
    /^(?:#[\p{L}\p{M}\p{N}_‌]+[ \t]*)+$/u;

  let finalLines = cleanedCaption.split("\n");

  while (finalLines.length > 0) {
    const lastLine =
      finalLines[finalLines.length - 1].trim();

    if (
      !lastLine ||
      hashtagOnlyLine.test(lastLine)
    ) {
      finalLines.pop();
    } else {
      break;
    }
  }

  cleanedCaption = finalLines.join("\n");

  cleanedCaption = cleanedCaption.replace(
    /(?:[ \t]+#[\p{L}\p{M}\p{N}_‌]+)+[ \t]*$/gu,
    "",
  );

  cleanedCaption = cleanedCaption
    .replace(/[ \t]+$/gm, "")
    .replace(/\n+$/g, "")
    .replace(/[\p{S}\p{Z}\s_#]+$/gu, "")
    .replace(/[،؛:!?؟]+$/gu, "")
    .trim();

  const completeText = cleanedCaption
    ? `${TITLE}\n\n${cleanedCaption}`
    : TITLE;

  function takeChunk(
    text: string,
    limit: number,
  ): {
    chunk: string;
    remaining: string;
  } {
    const characters = Array.from(text);

    if (characters.length <= limit) {
      return {
        chunk: text,
        remaining: "",
      };
    }

    let splitAt = -1;

    for (let i = limit; i > limit * 0.5; i--) {
      if (characters[i] === "\n") {
        splitAt = i + 1;
        break;
      }
    }

    if (splitAt === -1) {
      for (let i = limit; i > limit * 0.5; i--) {
        if (characters[i] === " ") {
          splitAt = i + 1;
          break;
        }
      }
    }

    if (splitAt === -1) {
      splitAt = limit;
    }

    let chunk = characters
      .slice(0, splitAt)
      .join("");

    let remaining = characters
      .slice(splitAt)
      .join("");

    chunk = chunk.replace(/\n+$/g, "");
    remaining = remaining.replace(/^\n+/g, "");

    return {
      chunk,
      remaining,
    };
  }

  const firstPart = takeChunk(
    completeText,
    MEDIA_CAPTION_LIMIT,
  );

  const mediaCaption = firstPart.chunk;
  let remainingText = firstPart.remaining;

  const firstResponse = await fetch(
    `https://tapi.bale.ai/bot${token}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        [mediaField]: post.mediaUrl,
        caption: mediaCaption,
      }),
      signal: AbortSignal.timeout(25000),
    },
  );

  const firstResult = await firstResponse
    .json()
    .catch(() => null) as
    | {
        ok?: boolean;
        description?: string;
        result?: {
          message_id?: number;
        };
      }
    | null;

  if (
    !firstResponse.ok ||
    firstResult?.ok !== true
  ) {
    throw new Error(
      `Bale ${method} failed: ${
        firstResult?.description ??
        `HTTP ${firstResponse.status}`
      }`,
    );
  }

  console.info("Instagram media sent", {
    username,
    postId: post.id,
    originalCaptionLength: Array.from(post.caption).length,
    finalCaptionLength: Array.from(completeText).length,
    mediaCaptionLength: Array.from(mediaCaption).length,
    remainingLength: Array.from(remainingText).length,
    mediaMessageId: firstResult.result?.message_id ?? null,
    mediaType: post.mediaType,
  });

  if (!remainingText) {
    return;
  }

  const chunks: string[] = [];

  while (remainingText.length > 0) {
    const part = takeChunk(
      remainingText,
      TEXT_MESSAGE_LIMIT,
    );

    chunks.push(part.chunk);
    remainingText = part.remaining;
  }

  console.info("Instagram long caption prepared", {
    username,
    postId: post.id,
    chunkCount: chunks.length,
    chunkLengths: chunks.map(
      (chunk) => Array.from(chunk).length,
    ),
  });

  for (
    let index = 0;
    index < chunks.length;
    index++
  ) {
    const chunk = chunks[index];

    const textResponse = await fetch(
      `https://tapi.bale.ai/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
        }),
        signal: AbortSignal.timeout(25000),
      },
    );

    const textResult = await textResponse
      .json()
      .catch(() => null) as
      | {
          ok?: boolean;
          description?: string;
          result?: {
            message_id?: number;
          };
        }
      | null;

    if (
      !textResponse.ok ||
      textResult?.ok !== true
    ) {
      console.error("Instagram text message failed", {
        username,
        postId: post.id,
        chunkIndex: index + 1,
        chunkCount: chunks.length,
        chunkLength: Array.from(chunk).length,
        httpStatus: textResponse.status,
        error:
          textResult?.description ??
          "Unknown Bale API error",
      });

      throw new Error(
        `Bale sendMessage failed for chunk ${index + 1}/${chunks.length}: ${
          textResult?.description ??
          `HTTP ${textResponse.status}`
        }`,
      );
    }

    console.info("Instagram text chunk sent", {
      username,
      postId: post.id,
      chunkIndex: index + 1,
      chunkCount: chunks.length,
      messageId: textResult.result?.message_id ?? null,
    });
  }

  console.info("Instagram continuation completed", {
    username,
    postId: post.id,
    chunkCount: chunks.length,
  });
}

export async function GET(
  request: Request,
): Promise<Response> {
  try {
    const { env } = await getCloudflareContext();
    const runtimeEnv = env as Env;
    const url = new URL(request.url);

    // Manual force mode keeps using the existing project secret.
    // Scheduled executions do not require this secret.
    const forceRequested =
      url.searchParams.get("force") === "1";

    const secret = runtimeEnv.INSTAGRAM_TEST_SECRET;

    const force =
      forceRequested &&
      Boolean(secret) &&
      request.headers.get("x-instagram-test-secret") === secret;

    if (forceRequested && !force) {
      return Response.json(
        {
          ok: false,
          error: "Invalid test authorization.",
        },
        { status: 403 },
      );
    }

    const instagramEnabled = await readSetting(
      runtimeEnv,
      "instagram_bale_repost_enabled_v1",
    );

    if (instagramEnabled === false) {
      return Response.json({
        ok: true,
        skipped: true,
        reason: "Instagram reposting is disabled.",
      });
    }

    const now = tehranTime();
    const scheduledSource = sourceForHour(now.hour);

    if (
      !force &&
      (
        now.minute !== 15 ||
        !scheduledSource
      )
    ) {
      return Response.json({
        ok: true,
        skipped: true,
        reason: "Not a scheduled Tehran publication slot.",
        tehranTime:
          `${now.date} ${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`,
      });
    }

    const requestedSource =
      url.searchParams.get("source");

    const username: Username = force
      ? (
          requestedSource &&
          Object.prototype.hasOwnProperty.call(
            SOURCES,
            requestedSource,
          )
            ? requestedSource as Username
            : "modiryar_com"
        )
      : scheduledSource!;

    const lock = await acquireInstagramLock(
      runtimeEnv,
    );

    if (!lock) {
      return Response.json(
        {
          ok: true,
          skipped: true,
          reason: "Another Instagram execution is already active.",
          username,
        },
        { status: 409 },
      );
    }

    try {
      const state = await readState(
        runtimeEnv,
        now.date,
      );

      const sourceState = state.sources[username];

      if (
        sourceState.sentToday >=
        SOURCES[username].limit
      ) {
        return Response.json({
          ok: true,
          skipped: true,
          reason: "Daily limit reached.",
          username,
          sentToday: sourceState.sentToday,
          dailyLimit: SOURCES[username].limit,
        });
      }

      // دریافت حداکثر یک صفحه جدید برای هر حساب در هر روز تهران.
      await ensureDailyArchivePage(
        runtimeEnv,
        username,
        now.date,
      );

      // خواندن تمام صفحات آرشیو، شامل صفحات روزهای قبل.
      const posts = await readArchivedPosts(
        runtimeEnv,
        username,
      );

      const sent = new Set(
        sourceState.sentIds,
      );

      const pending = new Set(
        sourceState.pendingIds ?? [],
      );

      // انتخاب قدیمی‌ترین پست ارسال‌نشده در کل آرشیو.
      const eligiblePosts = posts.filter(
        (post) =>
          !sent.has(post.id) &&
          !pending.has(post.id) &&
          !looksLikeAd(post),
      );

      const candidate = eligiblePosts[0] ?? null;

      if (!candidate) {
        let sentExcluded = 0;
        let pendingExcluded = 0;
        let adExcluded = 0;
        let eligibleCount = 0;

        for (const post of posts) {
          if (sent.has(post.id)) {
            sentExcluded++;
          } else if (pending.has(post.id)) {
            pendingExcluded++;
          } else if (looksLikeAd(post)) {
            adExcluded++;
          } else {
            eligibleCount++;
          }
        }

        const diagnostics = {
          sentExcluded,
          pendingExcluded,
          adExcluded,
          eligibleCount,
          savedSentIds: sourceState.sentIds.length,
          savedPendingIds:
            sourceState.pendingIds?.length ?? 0,
        };

        console.info(
          "[Instagram] Candidate diagnostics:",
          {
            username,
            scanned: posts.length,
            ...diagnostics,
          },
        );

        return Response.json({
          ok: true,
          skipped: true,
          reason: "No eligible unsent post was found in the archive.",
          username,
          scanned: posts.length,
          diagnostics,
        });
      }

      // ثبت pending قبل از ارسال.
      // نتیجه مبهم ارسال به‌صورت خودکار دوباره ارسال نمی‌شود.
      sourceState.pendingIds = [
        ...new Set([
          ...(sourceState.pendingIds ?? []),
          candidate.id,
        ]),
      ];

      state.tehranDate = now.date;

      await writeState(
        runtimeEnv,
        state,
      );

      await sendToBale(
        runtimeEnv,
        username,
        candidate,
      );

      sourceState.pendingIds = (
        sourceState.pendingIds ?? []
      ).filter(
        (id) => id !== candidate.id,
      );

      sourceState.sentIds = [
        ...new Set([
          ...sourceState.sentIds,
          candidate.id,
        ]),
      ];

      sourceState.sentToday += 1;

      await writeState(
        runtimeEnv,
        state,
      );

      return Response.json({
        ok: true,
        sent: true,
        username,
        postId: candidate.id,
        mediaType: candidate.mediaType,
        sentToday: sourceState.sentToday,
        dailyLimit: SOURCES[username].limit,
        scannedArchivePosts: posts.length,
        tehranTime:
          `${now.date} ${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`,
      });
    } finally {
      await releaseInstagramLock(
        runtimeEnv,
        lock,
      );
    }
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

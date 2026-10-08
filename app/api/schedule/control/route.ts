import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

type ScheduleKey =
  | "calendar"
  | "news"
  | "kargozin";

function getSupabaseConfig(env: CloudflareEnv) {
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function getSetting(
  env: CloudflareEnv,
  key: string,
  fallback = true
) {
  const { url, serviceKey } =
    getSupabaseConfig(env);

  if (!url || !serviceKey) {
    throw new Error(
      "تنظیمات Supabase در Cloudflare کامل نیست."
    );
  }

  const response = await fetch(
    `${url}/rest/v1/settings?select=key,value&key=eq.${encodeURIComponent(
      key
    )}&limit=1`,
    {
      method: "GET",
      cache: "no-store",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json",
      },
    }
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase GET ${response.status}: ${text}`
    );
  }

  let rows: any;

  try {
    rows = JSON.parse(text);
  } catch {
    throw new Error(
      "پاسخ Supabase قابل خواندن نیست."
    );
  }

  if (
    !Array.isArray(rows) ||
    rows.length === 0
  ) {
    return fallback;
  }

  return rows[0]?.value !== "false";
}

async function setSetting(
  env: CloudflareEnv,
  key: string,
  enabled: boolean
) {
  const { url, serviceKey } =
    getSupabaseConfig(env);

  if (!url || !serviceKey) {
    throw new Error(
      "تنظیمات Supabase در Cloudflare کامل نیست."
    );
  }

  const response = await fetch(
    `${url}/rest/v1/settings?on_conflict=key`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer:
          "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        key,
        value: String(enabled),
        updated_at: new Date().toISOString(),
      }),
    }
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase POST ${response.status}: ${text}`
    );
  }

  return text;
}

export async function GET() {
  try {
    const { env } =
      await getCloudflareContext({
        async: true,
      });

    const calendar =
      await getSetting(
        env,
        "schedule_calendar",
        true
      );

    const news =
      await getSetting(
        env,
        "schedule_news",
        true
      );

    const kargozin =
      await getSetting(
        env,
        "schedule_kargozin",
        true
      );

    return Response.json(
      {
        ok: true,
        calendar,
        news,
        kargozin,
      },
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error(
      "[schedule/control] GET error:",
      error
    );

    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "خواندن وضعیت ارسال‌های زمان‌بندی‌شده انجام نشد.",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request
) {
  try {
    const body = await request.json();

    const schedule =
      body?.schedule as ScheduleKey;

    const enabled = body?.enabled;

    if (
      schedule !== "calendar" &&
      schedule !== "news" &&
      schedule !== "kargozin"
    ) {
      return Response.json(
        {
          ok: false,
          error: "نوع ارسال نامعتبر است.",
        },
        { status: 400 }
      );
    }

    if (
      typeof enabled !== "boolean"
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "وضعیت ارسال نامعتبر است.",
        },
        { status: 400 }
      );
    }

    const { env } =
      await getCloudflareContext({
        async: true,
      });

    const settingKey =
      schedule === "calendar"
        ? "schedule_calendar"
        : schedule === "news"
        ? "schedule_news"
        : "schedule_kargozin";

    await setSetting(
      env,
      settingKey,
      enabled
    );

    return Response.json(
      {
        ok: true,
        schedule,
        enabled,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "[schedule/control] POST error:",
      error
    );

    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "ذخیره وضعیت ارسال انجام نشد.",
      },
      { status: 500 }
    );
  }
}

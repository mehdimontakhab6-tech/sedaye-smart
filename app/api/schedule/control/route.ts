import { getCloudflareContext } from "@opennextjs/cloudflare";

type ScheduleKey = "calendar" | "news";

function getSupabaseConfig(env: CloudflareEnv) {
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    key: env.SUPABASE_SERVICE_ROLE_KEY
  };
}

async function getSetting(
  env: CloudflareEnv,
  key: string,
  fallback = true
) {
  const { url, key: serviceKey } = getSupabaseConfig(env);

  const response = await fetch(
    `${url}/rest/v1/settings?select=key,value&key=eq.${encodeURIComponent(key)}&limit=1`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
      }
    }
  );

  if (!response.ok) {
    return fallback;
  }

  const rows = await response.json();

  if (!Array.isArray(rows) || !rows.length) {
    return fallback;
  }

  return rows[0]?.value !== "false";
}

async function setSetting(
  env: CloudflareEnv,
  key: string,
  enabled: boolean
) {
  const { url, key: serviceKey } = getSupabaseConfig(env);

  const response = await fetch(
    `${url}/rest/v1/settings?on_conflict=key`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify({
        key,
        value: String(enabled),
        updated_at: new Date().toISOString()
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Supabase setting update failed: ${response.status} ${errorText}`
    );
  }
}

export async function GET() {
  try {
    const { env } = await getCloudflareContext();

    const calendar = await getSetting(
      env,
      "schedule_calendar",
      true
    );

    const news = await getSetting(
      env,
      "schedule_news",
      true
    );

    return Response.json({
      ok: true,
      calendar,
      news
    });
  } catch (error) {
    console.error("[schedule/control] GET error:", error);

    return Response.json(
      {
        ok: false,
        error: "خواندن وضعیت ارسال‌های زمان‌بندی‌شده انجام نشد."
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const schedule = body?.schedule as ScheduleKey;
    const enabled = body?.enabled;

    if (
      schedule !== "calendar" &&
      schedule !== "news"
    ) {
      return Response.json(
        {
          ok: false,
          error: "نوع ارسال نامعتبر است."
        },
        { status: 400 }
      );
    }

    if (typeof enabled !== "boolean") {
      return Response.json(
        {
          ok: false,
          error: "وضعیت ارسال نامعتبر است."
        },
        { status: 400 }
      );
    }

    const { env } = await getCloudflareContext();

    const settingKey =
      schedule === "calendar"
        ? "schedule_calendar"
        : "schedule_news";

    await setSetting(
      env,
      settingKey,
      enabled
    );

    return Response.json({
      ok: true,
      schedule,
      enabled
    });
  } catch (error) {
    console.error("[schedule/control] POST error:", error);

    return Response.json(
      {
        ok: false,
        error: "ذخیره وضعیت ارسال انجام نشد."
      },
      { status: 500 }
    );
  }
}

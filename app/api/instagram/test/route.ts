
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

const SOURCES = ["modiryar_com", "dr.hosseinfalah"];

function findMediaPaths(value: unknown, path = ""): string[] {
  const found: string[] = [];

  if (!value || typeof value !== "object") return found;

  if (Array.isArray(value)) {
    value.slice(0, 10).forEach((item, index) => {
      found.push(...findMediaPaths(item, `${path}[${index}]`));
    });
    return found;
  }

  for (const [key, child] of Object.entries(value)) {
    const nextPath = path ? `${path}.${key}` : key;

    if (
      typeof child === "string" &&
      /^https?:\/\//i.test(child) &&
      /image|video|media|candidate|display|thumbnail/i.test(nextPath)
    ) {
      found.push(nextPath);
    } else if (child && typeof child === "object") {
      found.push(...findMediaPaths(child, nextPath));
    }
  }

  return found.slice(0, 20);
}

export async function GET() {
  try {
    const { env } = getCloudflareContext();

    const apiKey = (
      env as unknown as Record<string, string | undefined>
    ).TOOLZERHUB_API_KEY;

    if (!apiKey) {
      return Response.json({
        ok: false,
        error: "TOOLZERHUB_API_KEY is missing in Cloudflare",
      }, { status: 500 });
    }

    const results = [];

    for (const username of SOURCES) {
      try {
        const url = new URL(
          "https://api.toolzerhub.com/v1/instagram/user/posts"
        );

        url.searchParams.set("username_or_url", username);
        url.searchParams.set("count", "5");

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "x-api-key": apiKey,
            "Accept": "application/json",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(30000),
        });

        const body = await response.text();

        let json: any = null;
        try {
          json = JSON.parse(body);
        } catch {}

        if (!response.ok) {
          results.push({
            username,
            httpStatus: response.status,
            message:
              json?.error?.message ||
              json?.details?.message ||
              body.slice(0, 250) ||
              "API request failed",
          });
          continue;
        }

        const data = json?.data;
        const items = Array.isArray(data?.items)
          ? data.items
          : [];

        const first = items[0] ?? null;
        const mediaPaths = first
          ? findMediaPaths(first)
          : [];

        results.push({
          username,
          httpStatus: response.status,
          postsFound: items.length,
          hasPostData: items.length > 0,
          firstPost: first
            ? {
                code: first.code ?? null,
                caption: first.caption?.text?.slice(0, 250) ?? null,
                productType: first.product_type ?? null,
                takenAt: first.taken_at ?? null,
                fields: Object.keys(first),
                mediaPaths,
                hasMediaUrl: mediaPaths.length > 0,
              }
            : null,
          moreAvailable: data?.more_available ?? false,
          message: items.length
            ? "ToolzerHub returned public posts"
            : "No posts returned",
        });
      } catch (error) {
        results.push({
          username,
          error:
            error instanceof Error
              ? error.message
              : String(error),
        });
      }
    }

    return Response.json({
      ok: true,
      test: "toolzerhub-instagram-read-only",
      creditsExpected: "Up to 2 credits if both requests succeed",
      results,
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    }, { status: 500 });
  }
}

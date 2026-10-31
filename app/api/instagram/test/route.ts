
export const dynamic = "force-dynamic";

const SOURCES = ["modiryar_com", "dr.hosseinfalah"];
const IG_APP_ID = "936619743392459";

export async function GET() {
  const results = [];

  for (const username of SOURCES) {
    try {
      const url =
        `https://www.instagram.com/api/v1/feed/user/${encodeURIComponent(username)}/username/?count=3`;

      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          "X-IG-App-ID": IG_APP_ID,
          "Accept": "*/*",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });

      const body = await response.text();

      let data: any = null;
      try {
        data = JSON.parse(body);
      } catch {}

      const items = Array.isArray(data?.items)
        ? data.items
        : [];

      results.push({
        username,
        httpStatus: response.status,
        contentLength: body.length,
        hasPostData: items.length > 0,
        postsFound: items.length,
        firstPostCode: items[0]?.code ?? null,
        firstPostHasMedia: Boolean(
          items[0]?.image_versions2?.candidates?.length ||
          items[0]?.video_versions?.length ||
          items[0]?.carousel_media?.length
        ),
        message: response.ok
          ? items.length > 0
            ? "Public posts received"
            : "Request succeeded but no posts were returned"
          : "Instagram rejected the request",
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
    test: "instagram-feed-read-only",
    results,
  });
}

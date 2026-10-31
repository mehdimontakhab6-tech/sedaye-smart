
export const dynamic = "force-dynamic";

const SOURCES = ["modiryar_com", "dr.hosseinfalah"];

export async function GET() {
  const results = [];

  for (const username of SOURCES) {
    try {
      const response = await fetch(
        `https://www.instagram.com/${username}/`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(20000),
        }
      );

      const html = await response.text();

      results.push({
        username,
        httpStatus: response.status,
        contentLength: html.length,
        containsUsername: html.includes(username),
        containsProfileData:
          html.includes("edge_owner_to_timeline_media") ||
          html.includes("og:description"),
        message: response.ok
          ? "Page received"
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
    test: "instagram-public-read-only",
    results,
  });
}

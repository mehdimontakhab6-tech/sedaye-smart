
export const dynamic = "force-dynamic";

const SOURCES = ["modiryar_com", "dr.hosseinfalah"];

export async function GET() {
  const results = [];

  for (const username of SOURCES) {
    try {
      const response = await fetch(
        `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
        {
          headers: {
            "User-Agent":
              "Instagram 300.0.0.0.0 Android",
            "X-IG-App-ID": "936619743392459",
            "Accept": "*/*",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(20000),
        }
      );

      const body = await response.text();

      let data: any = null;
      try {
        data = JSON.parse(body);
      } catch {}

      results.push({
        username,
        httpStatus: response.status,
        contentLength: body.length,
        hasUserData: Boolean(data?.data?.user?.id),
        returnedUsername: data?.data?.user?.username ?? null,
        message: response.ok
          ? "Request completed"
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
    test: "instagram-api-read-only",
    results,
  });
}

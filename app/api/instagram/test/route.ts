import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

export async function GET() {
const username = "modiryar_com";
  
  try {
    const { env } = getCloudflareContext();

    const apiKey = (
      env as unknown as Record<string, string | undefined>
    ).TOOLZERHUB_API_KEY?.trim();

    if (!apiKey) {
      return Response.json({
        ok: false,
        step: "secret-check",
        message: "Cloudflare Secret not found",
      }, { status: 500 });
    }

    const headers = {
      "x-api-key": apiKey,
      "Accept": "application/json",
    };

    // مرحله اول: دریافت اطلاعات پروفایل
    const profileResponse = await fetch(
      `https://api.toolzerhub.com/v1/instagram/user/info?username_or_url=${encodeURIComponent(username)}&detail=summary`,
      {
        headers,
        cache: "no-store",
      }
    );

    const profileBody = await profileResponse.text();

    let profileData: any;
    try {
      profileData = JSON.parse(profileBody);
    } catch {
      return Response.json({
        ok: false,
        step: "profile-json",
        httpStatus: profileResponse.status,
        message: "Invalid profile response",
      }, { status: 502 });
    }

    if (!profileResponse.ok) {
      return Response.json({
        ok: false,
        step: "profile",
        httpStatus: profileResponse.status,
        error: profileData?.error?.message ?? "Profile request failed",
      }, { status: profileResponse.status });
    }

    const profileId = profileData?.data?.id;

    if (!profileId) {
      return Response.json({
        ok: false,
        step: "profile-id",
        message: "Profile ID not found",
      }, { status: 502 });
    }

    // مرحله دوم: دریافت پنج پست آخر
    const postsResponse = await fetch(
      `https://api.toolzerhub.com/v1/instagram/user/posts/by-id?user_id=${encodeURIComponent(String(profileId))}&count=5`,
      {
        headers,
        cache: "no-store",
      }
    );

    const postsBody = await postsResponse.text();

    let postsData: any;
    try {
      postsData = JSON.parse(postsBody);
    } catch {
      return Response.json({
        ok: false,
        step: "posts-json",
        httpStatus: postsResponse.status,
        message: "Invalid posts response",
      }, { status: 502 });
    }

    if (!postsResponse.ok) {
      return Response.json({
        ok: false,
        step: "posts",
        httpStatus: postsResponse.status,
        error: postsData?.error?.message ?? "Posts request failed",
      }, { status: postsResponse.status });
    }

    const items = Array.isArray(postsData?.data?.items)
      ? postsData.data.items
      : [];

    // فقط اطلاعات خلاصه پست‌ها برگردانده می‌شود.
    const posts = await Promise.all(
  items.slice(0, 5).map(async (item: any) => {
    const imageUrl =
      item?.image_versions2?.candidates?.[0]?.url ??
      item?.display_uri ??
      "";

    const videoUrl =
      item?.video_versions?.[0]?.url ??
      "";

    const mediaUrl = videoUrl || imageUrl;

    if (!mediaUrl) {
      return {
        shortcode: item?.code ?? null,
        mediaType: item?.media_type ?? null,
        mediaAvailable: false,
        httpStatus: null,
        contentType: null,
      };
    }

    try {
      const response = await fetch(mediaUrl, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(12000),
      });

      return {
        shortcode: item?.code ?? null,
        mediaType: item?.media_type ?? null,
        mediaAvailable: response.ok,
        httpStatus: response.status,
        contentType: response.headers.get("content-type"),
      };
    } catch (error) {
      return {
        shortcode: item?.code ?? null,
        mediaType: item?.media_type ?? null,
        mediaAvailable: false,
        httpStatus: null,
        contentType: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  })
);

    return Response.json({
      ok: true,
      test: "toolzerhub-instagram-read-only",
      username,
      profileFound: true,
      postsCount: posts.length,
      posts,
      message: posts.length > 0
        ? "Instagram profile and posts retrieved successfully"
        : "Profile found, but no posts were returned",
    });

  } catch (error) {
    return Response.json({
      ok: false,
      step: "unexpected-error",
      error: error instanceof Error
        ? error.message
        : String(error),
    }, { status: 500 });
  }
}

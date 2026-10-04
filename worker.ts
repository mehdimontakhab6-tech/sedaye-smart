// @ts-ignore .open-next/worker.js is generated at build time
import { default as handler } from "./.open-next/worker.js";

const CALENDAR_CRON = "45 4 * * *";
const NEWS_CRON = "0 19 * * *";

const BASE_URL =
  "https://sedaye-smart.mehdimontakhab6.workers.dev";

export default {
  fetch: handler.fetch,

  async scheduled(
    event: ScheduledController,
    env: CloudflareEnv,
    ctx: ExecutionContext
  ) {
    console.log(
      "[cron] triggered:",
      event.cron
    );

    console.log(
      "[cron] scheduled time:",
      new Date(event.scheduledTime).toISOString()
    );

    /*
     * ─────────────────────────────────────────────
     * تقویم روزانه
     * Cron: 04:45 UTC
     * برابر با 08:15 تهران
     * ─────────────────────────────────────────────
     */
    if (event.cron === CALENDAR_CRON) {
      console.log(
        "[cron] running daily calendar..."
      );

      const request = new Request(
        `${BASE_URL}/api/calendar/daily`,
        {
          method: "GET",
          headers: {
            "User-Agent": "sedaye-smart-cron"
          }
        }
      );

      const response = await handler.fetch(
        request,
        env,
        ctx
      );

      const body = await response.text();

      console.log(
        "[cron] calendar status:",
        response.status
      );

      console.log(
        "[cron] calendar response:",
        body.slice(0, 2000)
      );

      if (!response.ok) {
        throw new Error(
          `calendar cron failed: HTTP ${response.status}`
        );
      }

      console.log(
        "[cron] daily calendar completed successfully"
      );

      return;
    }

    /*
     * ─────────────────────────────────────────────
     * اخبار ثبت احوال
     * Cron: 19:00 UTC
     * برابر با 22:30 تهران
     *
     * مسیر خودش بازه دقیق 22:30 تا 22:30
     * را بررسی می‌کند.
     *
     * اگر خبر مرتبط وجود داشته باشد:
     *     ارسال به گروه بله
     *
     * اگر خبر مرتبط وجود نداشته باشد:
     *     هیچ پیامی ارسال نمی‌شود.
     * ─────────────────────────────────────────────
     */
    if (event.cron === NEWS_CRON) {
      console.log(
        "[cron] running registration news..."
      );

      const request = new Request(
        `${BASE_URL}/api/news/registration/daily-summary`,
        {
          method: "GET",
          headers: {
            "User-Agent": "sedaye-smart-cron"
          }
        }
      );

      const response = await handler.fetch(
        request,
        env,
        ctx
      );

      const body = await response.text();

      console.log(
        "[cron] registration news status:",
        response.status
      );

      console.log(
        "[cron] registration news response:",
        body.slice(0, 4000)
      );

      if (!response.ok) {
        throw new Error(
          `registration news cron failed: HTTP ${response.status}`
        );
      }

      console.log(
        "[cron] registration news completed successfully"
      );

      return;
    }

    /*
     * اگر Cron ناشناخته باشد
     */
    console.log(
      "[cron] ignored unknown cron:",
      event.cron
    );
  }
} satisfies ExportedHandler<CloudflareEnv>;

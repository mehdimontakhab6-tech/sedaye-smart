// @ts-ignore .open-next/worker.js is generated at build time
import { default as handler } from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,

  async scheduled(
    event: ScheduledController,
    env: CloudflareEnv,
    ctx: ExecutionContext
  ) {
    const expectedCron = "45 4 * * *";

    if (event.cron !== expectedCron) {
      console.log("[cron] ignored:", event.cron);
      return;
    }

    console.log("[cron] triggered:", event.cron);
    console.log(
      "[cron] scheduled time:",
      new Date(event.scheduledTime).toISOString()
    );

    const request = new Request(
      "https://sedaye-smart.mehdimontakhab6.workers.dev/api/calendar/daily",
      {
        method: "GET"
      }
    );

    const response = await handler.fetch(
      request,
      env,
      ctx
    );

    if (!response.ok) {
      throw new Error(
        `calendar cron failed: HTTP ${response.status}`
      );
    }

    console.log(
      "[cron] daily calendar sent successfully"
    );
  }
} satisfies ExportedHandler<CloudflareEnv>;

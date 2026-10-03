// @ts-ignore .open-next/worker.js is generated at build time
import { default as handler } from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,

  async scheduled(event: ScheduledController, env: CloudflareEnv, ctx: ExecutionContext) {
    if (event.cron !== "30 2 * * *") {
      console.log("[cron] ignored:", event.cron);
      return;
    }

    const request = new Request(
      "https://sedaye-smart.mehdimontakhab6.workers.dev/api/calendar/daily",
      {
        method: "GET"
      }
    );

    const response = await handler.fetch(request, env, ctx);

    if (!response.ok) {
      throw new Error(
        `calendar cron failed: HTTP ${response.status}`
      );
    }

    console.log("[cron] daily calendar sent successfully");
  }
} satisfies ExportedHandler<CloudflareEnv>;

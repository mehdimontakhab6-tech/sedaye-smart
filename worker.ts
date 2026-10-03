import openNextWorker from "./.open-next/worker.js";

export * from "./.open-next/worker.js";

export default {
  fetch: openNextWorker.fetch,

  async scheduled(
    controller: ScheduledController,
    env: CloudflareEnv,
    ctx: ExecutionContext
  ) {
    if (controller.cron !== "30 2 * * *") {
      console.log("[cron] ignored:", controller.cron);
      return;
    }

    const request = new Request(
      "https://sedaye-smart.mehdimontakhab6.workers.dev/api/calendar/daily",
      {
        method: "GET"
      }
    );

    const promise = openNextWorker.fetch(
      request,
      env,
      ctx
    );

    ctx.waitUntil(promise);

    const response = await promise;

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

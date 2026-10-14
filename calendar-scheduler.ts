
export default {
  async scheduled(
    controller: ScheduledController,
    _env: unknown,
    _ctx: ExecutionContext
  ) {
    if (controller.cron !== "45 4 * * *") return;

    const url =
      "https://sedaye-smart.mehdimontakhab6.workers.dev/api/calendar/daily";

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "sedaye-smart-calendar-scheduler",
      },
    });

    const body = await response.text();

    console.log("[calendar-scheduler] status:", response.status);
    console.log("[calendar-scheduler] response:", body.slice(0, 1500));

    if (!response.ok) {
      throw new Error(
        `Calendar endpoint failed: HTTP ${response.status}`
      );
    }
  },
};

// Not in index.ts: a Worker's entry module may only export handlers.

export const reportPath = "/v1/report";
export const maxBodyBytes = 64 * 1024;

/**
 * The cron trigger which refreshes the public module list (see
 * `wrangler.jsonc`). Its own trigger, so a failure there can't stop the
 * maintenance run.
 */
export const refreshCron = "47 2 * * *";

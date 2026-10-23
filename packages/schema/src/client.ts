import type { ReportV1 } from "./report.ts";

/**
 * Send a report. Never throws: returns whether the server accepted it.
 *
 * The body goes as `text/plain`, which makes it a "simple" request, so the
 * browser doesn't need a CORS preflight first.
 */
export async function sendReport(
  report: ReportV1,
  { endpoint, timeoutMs = 5000 }: { endpoint: string; timeoutMs?: number },
): Promise<boolean> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(report),
      keepalive: true,
      credentials: "omit",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

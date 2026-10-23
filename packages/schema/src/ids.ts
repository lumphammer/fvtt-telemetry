/** A new random install ID: 16 bytes, base64url (22 characters). */
export function createInstallId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

/** The UTC day of a date, as `YYYY-MM-DD`. */
export function utcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Whether to send a report now, given the day the last one was sent (stored
 * by the package, e.g. in a world setting).
 */
export function isReportDue(
  lastSentDay: string | null | undefined,
  now = new Date(),
) {
  return lastSentDay !== utcDay(now);
}

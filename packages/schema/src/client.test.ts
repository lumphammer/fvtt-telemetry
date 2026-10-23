import { afterEach, describe, expect, test, vi } from "vitest";

import { sendReport } from "./client.ts";
import { createInstallId, isReportDue, utcDay } from "./ids.ts";
import { parseReport } from "./report.ts";
import { makeReport } from "./testReports.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createInstallId", () => {
  test("makes different IDs which the schema accepts", () => {
    const ids = new Set(Array.from({ length: 100 }, createInstallId));
    expect(ids.size).toBe(100);
    for (const installId of ids) {
      expect(installId).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(parseReport(makeReport({ installId })).success).toBe(true);
    }
  });
});

describe("isReportDue", () => {
  const now = new Date("2026-10-24T23:30:00+01:00");

  test("uses the UTC day", () => {
    expect(utcDay(now)).toBe("2026-10-24");
  });

  test("is due if nothing has been sent, or not today", () => {
    expect(isReportDue(null, now)).toBe(true);
    expect(isReportDue("2026-10-23", now)).toBe(true);
    expect(isReportDue("2026-10-24", now)).toBe(false);
  });
});

describe("sendReport", () => {
  test("posts the report as text/plain without credentials", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);

    const ok = await sendReport(makeReport(), {
      endpoint: "https://ingest.example.net/v1/report",
    });

    expect(ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "https://ingest.example.net/v1/report",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(makeReport()),
        credentials: "omit",
      }),
    );
  });

  test("returns false rather than throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    expect(
      await sendReport(makeReport(), { endpoint: "https://example.net" }),
    ).toBe(false);
  });

  test("returns false when the server refuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 400 })),
    );
    expect(
      await sendReport(makeReport(), { endpoint: "https://example.net" }),
    ).toBe(false);
  });
});

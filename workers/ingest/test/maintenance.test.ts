import { makeReport } from "@lumphammer/fvtt-telemetry-schema/testReports";
import { createScheduledController } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, test } from "vitest";

import worker from "../src/index.ts";
import {
  deleteReportsBefore,
  rollUpWeek,
  runMaintenance,
  weekStart,
} from "../src/maintenance.ts";
import { storeReport } from "../src/store.ts";

beforeEach(async () => {
  await env.DB.batch(
    ["reports", "report_settings", "report_modules", "weekly_counts"].map(
      (table) => env.DB.prepare(`DELETE FROM ${table}`),
    ),
  );
});

function store(day: string, overrides: Parameters<typeof makeReport>[0] = {}) {
  return storeReport(env.DB, makeReport(overrides), {
    day,
    country: "GB",
    receivedAt: `${day}T12:00:00.000Z`,
  });
}

async function weeklyCounts(week: string, dimension: string) {
  const { results } = await env.DB.prepare(
    `SELECT value, installs FROM weekly_counts
     WHERE package_id = 'investigator' AND week = ? AND dimension = ?
     ORDER BY value`,
  )
    .bind(week, dimension)
    .all();
  return Object.fromEntries(results.map((r) => [r["value"], r["installs"]]));
}

const a = "installAAAAAAAAAAAAAAA";
const b = "installBBBBBBBBBBBBBBB";
const c = "installCCCCCCCCCCCCCCC";

describe("weekStart", () => {
  test.each([
    ["2026-10-19T00:00:00Z", "2026-10-19"], // Monday
    ["2026-10-24T23:59:59Z", "2026-10-19"], // Saturday
    ["2026-10-25T12:00:00Z", "2026-10-19"], // Sunday
    ["2026-10-26T00:00:00Z", "2026-10-26"], // next Monday
    ["2027-01-01T00:00:00Z", "2026-12-28"], // across a year
  ])("%s is in the week starting %s", (date, week) => {
    expect(weekStart(new Date(date))).toBe(week);
  });
});

describe("rollUpWeek", () => {
  test("counts each install once, with what it last reported that week", async () => {
    await store("2026-10-19", { installId: a });
    await store("2026-10-22", {
      installId: a,
      package: { id: "investigator", version: "10.131" },
    });
    await store("2026-10-20", { installId: b, language: "de", userCount: 1 });
    // other weeks
    await store("2026-10-18", { installId: c });
    await store("2026-10-26", { installId: c });

    await rollUpWeek(env.DB, "2026-10-19");

    expect(await weeklyCounts("2026-10-19", "installs")).toEqual({ "": 2 });
    expect(await weeklyCounts("2026-10-19", "packageVersion")).toEqual({
      "10.130": 1,
      "10.131": 1,
    });
    expect(await weeklyCounts("2026-10-19", "language")).toEqual({
      de: 1,
      en: 1,
    });
    expect(await weeklyCounts("2026-10-19", "userCount")).toEqual({
      "1": 1,
      "4–6": 1,
    });
    expect(await weeklyCounts("2026-10-19", "country")).toEqual({ GB: 2 });
    expect(await weeklyCounts("2026-10-19", "setting:preset")).toEqual({
      pathOfCthulhuPreset: 2,
    });
    expect(await weeklyCounts("2026-10-19", "module")).toEqual({
      "dice-so-nice": 2,
    });
    expect(
      await weeklyCounts("2026-10-19", "moduleVersion:dice-so-nice"),
    ).toEqual({ "5.2.1": 2 });
  });

  test("only counts modules from installs which share them", async () => {
    await store("2026-10-19", { installId: a });
    await store("2026-10-19", { installId: b, modules: undefined });

    await rollUpWeek(env.DB, "2026-10-19");

    expect(await weeklyCounts("2026-10-19", "sharesModules")).toEqual({
      no: 1,
      yes: 1,
    });
    expect(await weeklyCounts("2026-10-19", "module")).toEqual({
      "dice-so-nice": 1,
    });
  });

  test("uses the settings and modules from the last report", async () => {
    await store("2026-10-19", { installId: a });
    await store("2026-10-21", {
      installId: a,
      settings: { preset: "nightsBlackAgentsPreset" },
      modules: [{ id: "lib-wrapper", version: "1.13.0" }],
    });

    await rollUpWeek(env.DB, "2026-10-19");

    expect(await weeklyCounts("2026-10-19", "setting:preset")).toEqual({
      nightsBlackAgentsPreset: 1,
    });
    expect(await weeklyCounts("2026-10-19", "module")).toEqual({
      "lib-wrapper": 1,
    });
  });

  test("replaces earlier counts for the week", async () => {
    await store("2026-10-19", { installId: a });
    await rollUpWeek(env.DB, "2026-10-19");
    await store("2026-10-20", { installId: b });

    await rollUpWeek(env.DB, "2026-10-19");

    expect(await weeklyCounts("2026-10-19", "installs")).toEqual({ "": 2 });
  });
});

describe("maintenance", () => {
  test("deleteReportsBefore deletes raw reports, not counts", async () => {
    await store("2026-10-19", { installId: a });
    await store("2026-10-20", { installId: b });
    await rollUpWeek(env.DB, "2026-10-19");

    await deleteReportsBefore(env.DB, "2026-10-20");

    for (const table of ["reports", "report_settings", "report_modules"]) {
      const { results } = await env.DB.prepare(
        `SELECT DISTINCT install_id FROM ${table}`,
      ).all();
      expect(results).toEqual([{ install_id: b }]);
    }
    expect(await weeklyCounts("2026-10-19", "installs")).toEqual({ "": 2 });
  });

  test("rolls up this week and last week, then applies retention", async () => {
    await store("2026-10-14", { installId: a }); // last week
    await store("2026-10-20", { installId: b }); // this week
    await store("2026-10-01", { installId: c }); // too old

    await runMaintenance(env.DB, new Date("2026-10-24T03:17:00Z"), 15);

    expect(await weeklyCounts("2026-10-12", "installs")).toEqual({ "": 1 });
    expect(await weeklyCounts("2026-10-19", "installs")).toEqual({ "": 1 });
    const { results } = await env.DB.prepare(
      "SELECT install_id FROM reports ORDER BY install_id",
    ).all();
    expect(results).toEqual([{ install_id: a }, { install_id: b }]);
  });

  test("never deletes reports the roll-ups still need", async () => {
    await store("2026-10-12", { installId: a });

    await runMaintenance(env.DB, new Date("2026-10-24T03:17:00Z"), 0);

    expect(
      (await env.DB.prepare("SELECT * FROM reports").all()).results,
    ).toHaveLength(1);
  });

  test("runs from the cron trigger", async () => {
    await store("2026-10-20", { installId: a });

    await worker.scheduled(
      createScheduledController({
        scheduledTime: new Date("2026-10-24T03:17:00Z"),
        cron: "17 3 * * *",
      }),
      env,
    );

    expect(await weeklyCounts("2026-10-19", "installs")).toEqual({ "": 1 });
  });
});

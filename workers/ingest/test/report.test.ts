import { createInstallId } from "@lumphammer/fvtt-telemetry-schema";
import { makeReport } from "@lumphammer/fvtt-telemetry-schema/testReports";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, test } from "vitest";

import { maxBodyBytes } from "../src/limits.ts";
import { setPublicModules } from "../src/publicModules.ts";

const url = "https://ingest.example.net/v1/report";

/** Each test gets its own IP address, so the rate limiter leaves it alone. */
let nextIp = 1;
function newIp() {
  return `192.0.2.${nextIp++}`;
}

function post(
  body: unknown,
  { ip = newIp(), country }: { ip?: string; country?: string } = {},
) {
  return exports.default.fetch(
    new Request(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain", "CF-Connecting-IP": ip },
      body: typeof body === "string" ? body : JSON.stringify(body),
      cf: country === undefined ? undefined : { country },
    }),
  );
}

function reportsFor(installId: string) {
  return env.DB.prepare("SELECT * FROM reports WHERE install_id = ?")
    .bind(installId)
    .all()
    .then((r) => r.results);
}

function settingsFor(installId: string) {
  return env.DB.prepare(
    "SELECT key, value, value_type FROM report_settings WHERE install_id = ? ORDER BY key",
  )
    .bind(installId)
    .all()
    .then((r) => r.results);
}

function modulesFor(installId: string) {
  return env.DB.prepare(
    "SELECT module_id, module_version FROM report_modules WHERE install_id = ? ORDER BY module_id",
  )
    .bind(installId)
    .all()
    .then((r) => r.results);
}

const lotsOfModules = Array.from({ length: 150 }, (_, i) => ({
  id: `module-${String(i).padStart(3, "0")}`,
  version: `1.${i}`,
}));

beforeAll(async () => {
  await setPublicModules(
    env.DB,
    ["dice-so-nice", "lib-wrapper", ...lotsOfModules.map((m) => m.id)],
    new Date(),
  );
});

describe("POST /v1/report", () => {
  test("stores a report", async () => {
    const installId = createInstallId();
    const response = await post(makeReport({ installId }), { country: "GB" });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await reportsFor(installId)).toEqual([
      expect.objectContaining({
        package_id: "investigator",
        install_id: installId,
        day: new Date().toISOString().slice(0, 10),
        package_version: "10.130",
        foundry_version: "14.367",
        language: "en",
        user_count: 5,
        country: "GB",
        shares_modules: 1,
      }),
    ]);
    expect(await settingsFor(installId)).toEqual([
      { key: "preset", value: "pathOfCthulhuPreset", value_type: "string" },
      { key: "useMwStyleAbilities", value: "false", value_type: "boolean" },
    ]);
    expect(await modulesFor(installId)).toEqual([
      { module_id: "dice-so-nice", module_version: "5.2.1" },
    ]);
  });

  test("a later report the same day replaces the earlier one", async () => {
    const installId = createInstallId();
    const ip = newIp();
    await post(makeReport({ installId }), { ip });
    const { modules: _, ...withoutModules } = makeReport({
      installId,
      package: { id: "investigator", version: "10.131" },
      settings: { preset: "nightsBlackAgentsPreset" },
    });

    expect((await post(withoutModules, { ip })).status).toBe(204);

    expect(await reportsFor(installId)).toEqual([
      expect.objectContaining({ package_version: "10.131", shares_modules: 0 }),
    ]);
    expect(await settingsFor(installId)).toEqual([
      { key: "preset", value: "nightsBlackAgentsPreset", value_type: "string" },
    ]);
    expect(await modulesFor(installId)).toEqual([]);
  });

  test("stores lots of modules", async () => {
    const installId = createInstallId();
    const modules = lotsOfModules;

    expect((await post(makeReport({ installId, modules }))).status).toBe(204);

    expect(await modulesFor(installId)).toEqual(
      modules.map((m) => ({ module_id: m.id, module_version: m.version })),
    );
  });

  test("only keeps modules in Foundry's public index", async () => {
    const installId = createInstallId();
    const modules = [
      { id: "bobs-ravenloft-tweaks", version: "0.1" },
      { id: "lib-wrapper", version: "1.13.0" },
    ];

    expect((await post(makeReport({ installId, modules }))).status).toBe(204);

    expect(await reportsFor(installId)).toEqual([
      expect.objectContaining({ shares_modules: 1 }),
    ]);
    expect(await modulesFor(installId)).toEqual([
      { module_id: "lib-wrapper", module_version: "1.13.0" },
    ]);
  });

  test.each(["XX", "T1", "gb"])(
    "doesn't store the country %s",
    async (country) => {
      const installId = createInstallId();
      await post(makeReport({ installId }), { country });
      expect(await reportsFor(installId)).toEqual([
        expect.objectContaining({ country: null }),
      ]);
    },
  );

  test("rejects a report which doesn't match the schema", async () => {
    const response = await post({ ...makeReport(), userCount: -1 });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid report",
      issues: [expect.stringContaining("userCount")],
    });
  });

  test("rejects a package we don't collect for", async () => {
    const response = await post(
      makeReport({ package: { id: "dnd5e", version: "6.0.6" } }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Unknown package" });
  });

  test("rejects something that isn't JSON", async () => {
    expect((await post("{nope")).status).toBe(400);
  });

  test("rejects a body over the size limit", async () => {
    expect((await post("x".repeat(maxBodyBytes + 1))).status).toBe(413);
  });

  test("rate limits by IP address", async () => {
    const ip = newIp();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await post(makeReport(), { ip })).status);
    }
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(204));
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("other requests", () => {
  test("answers a CORS preflight", async () => {
    const response = await exports.default.fetch(
      new Request(url, { method: "OPTIONS" }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "POST, OPTIONS",
    );
  });

  test("refuses other methods", async () => {
    const response = await exports.default.fetch(new Request(url));
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST, OPTIONS");
  });

  test("has nothing else", async () => {
    const response = await exports.default.fetch(
      new Request("https://ingest.example.net/"),
    );
    expect(response.status).toBe(404);
  });
});

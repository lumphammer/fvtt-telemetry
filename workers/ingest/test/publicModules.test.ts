import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, test } from "vitest";

import {
  keepPublicModules,
  moduleIdsFromIndex,
  refreshPublicModules,
  setPublicModules,
} from "../src/publicModules.ts";

const now = new Date("2026-10-24T02:47:00Z");

/** An index like Foundry's, with `count` modules and a system. */
function makeIndex(count: number) {
  return {
    format: 1,
    packages: [
      { id: "investigator", type: "system", title: "INVESTIGATOR" },
      ...Array.from({ length: count }, (_, i) => ({
        id: `module-${i}`,
        type: "module",
        title: `Module ${i}`,
      })),
    ],
  };
}

const respondWith =
  (body: unknown, status = 200) =>
  () =>
    Promise.resolve(Response.json(body, { status }));

async function publicModules() {
  const { results } = await env.DB.prepare(
    "SELECT id FROM public_modules ORDER BY id",
  ).all<{ id: string }>();
  return results.map((r) => r.id);
}

function refreshed() {
  return env.DB.prepare("SELECT * FROM public_modules_refreshed").first();
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM public_modules"),
    env.DB.prepare("DELETE FROM public_modules_refreshed"),
  ]);
});

describe("moduleIdsFromIndex", () => {
  test("takes just the modules, with IDs we'd accept", () => {
    expect(
      moduleIdsFromIndex({
        packages: [
          { id: "dice-so-nice", type: "module" },
          { id: "dnd5e", type: "system" },
          { id: "Not an ID!", type: "module" },
          { id: "dice-so-nice", type: "module" },
          null,
        ],
      }),
    ).toEqual(["dice-so-nice"]);
  });

  test("isn't fooled by something else", () => {
    expect(moduleIdsFromIndex({ error: "nope" })).toBeNull();
    expect(moduleIdsFromIndex(null)).toBeNull();
  });
});

describe("refreshPublicModules", () => {
  test("replaces the list from the index", async () => {
    await setPublicModules(env.DB, ["gone-module"], now);

    expect(
      await refreshPublicModules(env.DB, now, respondWith(makeIndex(1200))),
    ).toBe(1200);

    const ids = await publicModules();
    expect(ids).toHaveLength(1200);
    expect(ids).not.toContain("gone-module");
    expect(ids).not.toContain("investigator");
    expect(await refreshed()).toEqual({
      singleton: 1,
      refreshed_at: now.toISOString(),
      module_count: 1200,
    });
  });

  test("keeps the old list if the index is missing or too short", async () => {
    await setPublicModules(env.DB, ["kept-module"], now);

    await expect(
      refreshPublicModules(env.DB, now, respondWith({}, 500)),
    ).rejects.toThrow("HTTP 500");
    await expect(
      refreshPublicModules(env.DB, now, respondWith(makeIndex(10))),
    ).rejects.toThrow("only 10 modules");

    expect(await publicModules()).toEqual(["kept-module"]);
  });
});

describe("keepPublicModules", () => {
  test("drops modules that aren't in the list, keeping the order", async () => {
    await setPublicModules(env.DB, ["lib-wrapper", "dice-so-nice"], now);
    expect(
      await keepPublicModules(env.DB, [
        { id: "dice-so-nice", version: "5.2.1" },
        { id: "my-private-module", version: "1.0" },
        { id: "lib-wrapper", version: "1.13.0" },
      ]),
    ).toEqual([
      { id: "dice-so-nice", version: "5.2.1" },
      { id: "lib-wrapper", version: "1.13.0" },
    ]);
  });

  test("keeps none before the list has been fetched", async () => {
    expect(
      await keepPublicModules(env.DB, [{ id: "dice-so-nice", version: "1" }]),
    ).toEqual([]);
  });
});

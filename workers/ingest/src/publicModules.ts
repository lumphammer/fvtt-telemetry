import { idPattern } from "@lumphammer/fvtt-telemetry-schema";

/** Foundry's public package index (every listed system, module and world). */
export const packageIndexUrl =
  "https://r2.foundryvtt.com/package-api-public/index-latest.json";

/**
 * Fewer modules than this means something's wrong with the index, so we keep
 * the list we've got. (It lists about 7,000.)
 */
const minPublicModules = 1000;

/** The module IDs in the package index, or null if it isn't one. */
export function moduleIdsFromIndex(index: unknown) {
  const packages = (index as { packages?: unknown } | null)?.packages;
  if (!Array.isArray(packages)) return null;
  const ids = new Set<string>();
  for (const p of packages as { id?: unknown; type?: unknown }[]) {
    if (
      p?.type === "module" &&
      typeof p.id === "string" &&
      idPattern.test(p.id)
    ) {
      ids.add(p.id);
    }
  }
  return [...ids];
}

/**
 * Replace the public module list. The IDs go in as one JSON parameter, so this
 * is three queries however many modules there are.
 */
export async function setPublicModules(
  db: D1Database,
  ids: string[],
  now: Date,
) {
  await db.batch([
    db.prepare("DELETE FROM public_modules"),
    db
      .prepare(
        "INSERT OR IGNORE INTO public_modules (id) SELECT value FROM json_each(?)",
      )
      .bind(JSON.stringify(ids)),
    db
      .prepare(
        `INSERT INTO public_modules_refreshed (singleton, refreshed_at, module_count)
         VALUES (1, ?, ?)
         ON CONFLICT (singleton) DO UPDATE SET
           refreshed_at = excluded.refreshed_at,
           module_count = excluded.module_count`,
      )
      .bind(now.toISOString(), ids.length),
  ]);
}

/**
 * Fetch the package index and refresh the public module list from it. Leaves
 * the list alone if the index can't be fetched or looks wrong.
 */
export async function refreshPublicModules(
  db: D1Database,
  now: Date,
  fetchIndex: () => Promise<Response> = () => fetch(packageIndexUrl),
) {
  const response = await fetchIndex();
  if (!response.ok) {
    throw new Error(`Package index: HTTP ${response.status}`);
  }
  const ids = moduleIdsFromIndex(await response.json());
  if (ids === null || ids.length < minPublicModules) {
    throw new Error(
      `Package index: only ${ids?.length ?? 0} modules, so not using it`,
    );
  }
  await setPublicModules(db, ids, now);
  return ids.length;
}

/**
 * Just the modules in the public list. Until the list has been fetched, that's
 * none of them.
 */
export async function keepPublicModules<T extends { id: string }>(
  db: D1Database,
  modules: T[],
) {
  if (modules.length === 0) return modules;
  const { results } = await db
    .prepare(
      `SELECT value AS id FROM json_each(?)
       WHERE value IN (SELECT id FROM public_modules)`,
    )
    .bind(JSON.stringify(modules.map((m) => m.id)))
    .all<{ id: string }>();
  const known = new Set(results.map((r) => r.id));
  return modules.filter((m) => known.has(m.id));
}

/**
 * The dashboard's JSON API. Fixed queries over the weekly counts: it only
 * ever reads.
 */

export type WeeklyCount = { week: string; value: string; installs: number };

const packageIdPattern = /^[A-Za-z0-9._-]{1,100}$/;
const dimensionPattern = /^[A-Za-z0-9:._-]{1,200}$/;
const maxWeeks = 520;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}

const notFound = () => json({ error: "Not found" }, 404);

/** The packages with any counts. */
async function listPackages(db: D1Database) {
  const { results } = await db
    .prepare(
      "SELECT DISTINCT package_id FROM weekly_counts ORDER BY package_id",
    )
    .all<{ package_id: string }>();
  return results.map((r) => r.package_id);
}

/** The dimensions a package has counts for. */
async function listDimensions(db: D1Database, packageId: string) {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT dimension FROM weekly_counts
       WHERE package_id = ? ORDER BY dimension`,
    )
    .bind(packageId)
    .all<{ dimension: string }>();
  return results.map((r) => r.dimension);
}

/** A dimension's counts for the last `weeks` weeks. */
async function getSeries(
  db: D1Database,
  packageId: string,
  dimension: string,
  weeks: number,
) {
  const { results } = await db
    .prepare(
      `SELECT week, value, installs FROM weekly_counts
       WHERE package_id = ?1 AND dimension = ?2 AND week IN (
         SELECT DISTINCT week FROM weekly_counts
         WHERE package_id = ?1 ORDER BY week DESC LIMIT ?3
       )
       ORDER BY week, installs DESC, value`,
    )
    .bind(packageId, dimension, weeks)
    .all<WeeklyCount>();
  return results;
}

export async function handleApi(url: URL, db: D1Database) {
  const parts = url.pathname.split("/").filter(Boolean).slice(1);
  if (parts.length === 1 && parts[0] === "packages") {
    return json(await listPackages(db));
  }
  const [packageId, resource] = parts;
  if (
    parts.length !== 2 ||
    packageId === undefined ||
    !packageIdPattern.test(packageId)
  ) {
    return notFound();
  }
  if (resource === "dimensions") {
    return json(await listDimensions(db, packageId));
  }
  if (resource === "series") {
    const dimension = url.searchParams.get("dimension") ?? "";
    if (!dimensionPattern.test(dimension)) {
      return json({ error: "Bad dimension" }, 400);
    }
    const weeks = Number(url.searchParams.get("weeks") ?? 52);
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > maxWeeks) {
      return json({ error: `weeks must be 1 to ${maxWeeks}` }, 400);
    }
    return json(await getSeries(db, packageId, dimension, weeks));
  }
  return notFound();
}

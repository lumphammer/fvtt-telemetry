const dayMs = 24 * 60 * 60 * 1000;

/** The UTC day of a date, as `YYYY-MM-DD`. */
export function utcDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** The Monday (UTC) starting the week `date` is in, as `YYYY-MM-DD`. */
export function weekStart(date: Date) {
  const day = new Date(`${utcDay(date)}T00:00:00Z`);
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  return utcDay(new Date(day.getTime() - sinceMonday * dayMs));
}

function addDays(day: string, days: number) {
  return utcDay(
    new Date(new Date(`${day}T00:00:00Z`).getTime() + days * dayMs),
  );
}

/**
 * Each install's last report in the week starting ?1. Every dimension counts
 * an install once, with what it last reported that week.
 */
const latestReports = `
  WITH latest AS (
    SELECT * FROM (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY package_id, install_id ORDER BY day DESC
      ) AS n
      FROM reports
      WHERE day >= ?1 AND day < ?2
    )
    WHERE n = 1
  )`;

const userCountBucket = `
  CASE
    WHEN user_count <= 1 THEN '1'
    WHEN user_count <= 3 THEN '2–3'
    WHEN user_count <= 6 THEN '4–6'
    WHEN user_count <= 10 THEN '7–10'
    ELSE '11+'
  END`;

const joinOn = (table: string) =>
  `JOIN ${table} t ON t.package_id = l.package_id
     AND t.install_id = l.install_id AND t.day = l.day`;

/**
 * One SELECT per dimension, each giving (package_id, week, dimension, value,
 * installs) from `latest`. (D1 limits how many SELECTs a UNION can join, so
 * each is its own INSERT.)
 */
const dimensionQueries = [
  `SELECT package_id, ?1, 'installs', '', COUNT(*)
     FROM latest GROUP BY package_id`,
  `SELECT package_id, ?1, 'packageVersion', package_version, COUNT(*)
     FROM latest GROUP BY package_id, package_version`,
  `SELECT package_id, ?1, 'foundryVersion', foundry_version, COUNT(*)
     FROM latest GROUP BY package_id, foundry_version`,
  `SELECT package_id, ?1, 'language', language, COUNT(*)
     FROM latest GROUP BY package_id, language`,
  `SELECT package_id, ?1, 'country', COALESCE(country, 'unknown'), COUNT(*)
     FROM latest GROUP BY package_id, COALESCE(country, 'unknown')`,
  `SELECT package_id, ?1, 'userCount', ${userCountBucket}, COUNT(*)
     FROM latest GROUP BY package_id, ${userCountBucket}`,
  `SELECT l.package_id, ?1, 'setting:' || t.key, t.value, COUNT(*)
     FROM latest l ${joinOn("report_settings")}
     GROUP BY l.package_id, t.key, t.value`,
  `SELECT l.package_id, ?1, 'module', t.module_id, COUNT(*)
     FROM latest l ${joinOn("report_modules")}
     GROUP BY l.package_id, t.module_id`,
  `SELECT l.package_id, ?1, 'moduleVersion:' || t.module_id, t.module_version,
       COUNT(*)
     FROM latest l ${joinOn("report_modules")}
     GROUP BY l.package_id, t.module_id, t.module_version`,
];

/** (Re)build the weekly counts for the week starting `week`. */
export async function rollUpWeek(db: D1Database, week: string) {
  const end = addDays(week, 7);
  await db.batch([
    db.prepare("DELETE FROM weekly_counts WHERE week = ?").bind(week),
    ...dimensionQueries.map((query) =>
      db
        .prepare(
          `${latestReports}
          INSERT INTO weekly_counts (package_id, week, dimension, value, installs)
          ${query}`,
        )
        .bind(week, end),
    ),
  ]);
}

/** Delete raw reports from before `cutoffDay`. The weekly counts stay. */
export async function deleteReportsBefore(db: D1Database, cutoffDay: string) {
  await db.batch(
    ["reports", "report_settings", "report_modules"].map((table) =>
      db.prepare(`DELETE FROM ${table} WHERE day < ?`).bind(cutoffDay),
    ),
  );
}

/**
 * The daily job: rebuild this week's and last week's counts (last week's, in
 * case reports arrived after the last run), then delete old raw reports.
 */
export async function runMaintenance(
  db: D1Database,
  now: Date,
  rawRetentionDays: number,
) {
  const thisWeek = weekStart(now);
  await rollUpWeek(db, addDays(thisWeek, -7));
  await rollUpWeek(db, thisWeek);
  // never delete anything the roll-ups above still need
  const retention = Math.max(rawRetentionDays, 15);
  await deleteReportsBefore(db, addDays(utcDay(now), -retention));
}

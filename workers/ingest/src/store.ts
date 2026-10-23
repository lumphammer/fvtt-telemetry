import type { ReportV1 } from "@lumphammer/fvtt-telemetry-schema";

/** D1 allows at most 100 bound parameters per statement. */
const maxParams = 100;

/** INSERTs for `rows`, as few statements as D1's parameter limit allows. */
function insertRows(
  db: D1Database,
  table: string,
  columns: string[],
  rows: (string | number)[][],
) {
  const rowsPerStatement = Math.floor(maxParams / columns.length);
  const placeholders = `(${columns.map(() => "?").join(", ")})`;
  const statements: D1PreparedStatement[] = [];
  for (let i = 0; i < rows.length; i += rowsPerStatement) {
    const chunk = rows.slice(i, i + rowsPerStatement);
    statements.push(
      db
        .prepare(
          `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${chunk.map(() => placeholders).join(", ")}`,
        )
        .bind(...chunk.flat()),
    );
  }
  return statements;
}

/**
 * Store a report. A later report from the same install on the same day
 * replaces the earlier one, including its settings and modules.
 */
export async function storeReport(
  db: D1Database,
  report: ReportV1,
  {
    day,
    country,
    receivedAt,
  }: { day: string; country: string | null; receivedAt: string },
) {
  const key = [report.package.id, report.installId, day];
  const keyWhere = "package_id = ? AND install_id = ? AND day = ?";
  const settings = Object.entries(report.settings ?? {});
  const modules = report.modules ?? [];

  await db.batch([
    db
      .prepare(
        `INSERT INTO reports (package_id, install_id, day, package_version,
           foundry_version, language, user_count, country, shares_modules,
           received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (package_id, install_id, day) DO UPDATE SET
           package_version = excluded.package_version,
           foundry_version = excluded.foundry_version,
           language = excluded.language,
           user_count = excluded.user_count,
           country = excluded.country,
           shares_modules = excluded.shares_modules,
           received_at = excluded.received_at`,
      )
      .bind(
        ...key,
        report.package.version,
        report.foundry.version,
        report.language,
        report.userCount,
        country,
        report.modules === undefined ? 0 : 1,
        receivedAt,
      ),
    db.prepare(`DELETE FROM report_settings WHERE ${keyWhere}`).bind(...key),
    ...insertRows(
      db,
      "report_settings",
      ["package_id", "install_id", "day", "key", "value", "value_type"],
      settings.map(([name, value]) => [
        ...key,
        name,
        String(value),
        typeof value,
      ]),
    ),
    db.prepare(`DELETE FROM report_modules WHERE ${keyWhere}`).bind(...key),
    ...insertRows(
      db,
      "report_modules",
      ["package_id", "install_id", "day", "module_id", "module_version"],
      modules.map((module) => [...key, module.id, module.version]),
    ),
  ]);
}

import * as v from "valibot";

/** Foundry package and module IDs. */
const id = v.pipe(v.string(), v.regex(/^[A-Za-z0-9._-]{1,100}$/));

/** Version strings, e.g. "10.130", "14.367", "1.2.0-beta.1". */
const version = v.pipe(v.string(), v.regex(/^[0-9A-Za-z.+_-]{1,32}$/));

/** Foundry language codes, e.g. "en", "pt-BR", "it_IT". */
const language = v.pipe(
  v.string(),
  v.regex(/^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8}){0,2}$/),
);

/** Made by `createInstallId`: 16 random bytes, base64url. */
const installId = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{16,64}$/));

const settingKey = v.pipe(v.string(), v.regex(/^[A-Za-z0-9._-]{1,64}$/));
const settingValue = v.union([
  v.pipe(v.string(), v.maxLength(64)),
  v.pipe(v.number(), v.finite()),
  v.boolean(),
]);

export const maxSettings = 32;
export const maxModules = 500;

/**
 * A usage report, sent at most once a day per world. See `docs/plan.md`.
 */
export const reportSchemaV1 = v.strictObject({
  schemaVersion: v.literal(1),
  installId,
  package: v.strictObject({ id, version }),
  foundry: v.strictObject({ version }),
  language,
  /** How many users the world has. */
  userCount: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1000)),
  /** Whatever the package chooses to report, e.g. its preset. */
  settings: v.optional(
    v.pipe(
      v.record(settingKey, settingValue),
      v.check(
        (settings) => Object.keys(settings).length <= maxSettings,
        `At most ${maxSettings} settings`,
      ),
    ),
  ),
  /** Active modules. Only sent if the GM agreed to share them. */
  modules: v.optional(
    v.pipe(
      v.array(v.strictObject({ id, version })),
      v.maxLength(maxModules),
      v.check(
        (modules) => new Set(modules.map((m) => m.id)).size === modules.length,
        "Duplicate module IDs",
      ),
    ),
  ),
});

export type ReportV1 = v.InferOutput<typeof reportSchemaV1>;

export type ParseResult =
  { success: true; report: ReportV1 } | { success: false; issues: string[] };

/** Check something claiming to be a report. */
export function parseReport(input: unknown): ParseResult {
  const result = v.safeParse(reportSchemaV1, input);
  if (result.success) return { success: true, report: result.output };
  return {
    success: false,
    issues: result.issues.map((issue) => {
      const path = v.getDotPath(issue);
      return path ? `${path}: ${issue.message}` : issue.message;
    }),
  };
}

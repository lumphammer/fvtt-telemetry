import type { ReportV1 } from "./report.ts";

/** A valid report, for tests. */
export function makeReport(overrides: Partial<ReportV1> = {}): ReportV1 {
  return {
    schemaVersion: 1,
    installId: "kq7Xb2c9TzRf1mWd8sLp4a",
    package: { id: "investigator", version: "10.130" },
    foundry: { version: "14.367" },
    language: "en",
    userCount: 5,
    settings: { preset: "pathOfCthulhuPreset", useMwStyleAbilities: false },
    modules: [{ id: "dice-so-nice", version: "5.2.1" }],
    ...overrides,
  };
}

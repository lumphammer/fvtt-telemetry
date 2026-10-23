import { describe, expect, test } from "vitest";

import { parseReport } from "./report.ts";
import { makeReport } from "./testReports.ts";

describe("parseReport", () => {
  test("accepts a full report", () => {
    expect(parseReport(makeReport())).toEqual({
      success: true,
      report: makeReport(),
    });
  });

  test("accepts a report without settings or modules", () => {
    const { settings: _s, modules: _m, ...report } = makeReport();
    expect(parseReport(report).success).toBe(true);
  });

  test.each(["en", "pt-BR", "it_IT", "ja-JP", "zh-Hant-TW"])(
    "accepts the language %s",
    (language) => {
      expect(parseReport(makeReport({ language })).success).toBe(true);
    },
  );

  test.each([
    ["an unknown schema version", { schemaVersion: 2 }],
    ["a short install ID", { installId: "abc" }],
    [
      "an install ID with odd characters",
      { installId: "kq7Xb2c9TzRf1mWd8sLp4a!" },
    ],
    [
      "markup in a version",
      { package: { id: "investigator", version: "<b>1</b>" } },
    ],
    ["a long version", { foundry: { version: "1".repeat(33) } }],
    ["a fractional user count", { userCount: 1.5 }],
    ["a negative user count", { userCount: -1 }],
    ["a long setting value", { settings: { preset: "x".repeat(65) } }],
    ["an object setting value", { settings: { preset: {} } }],
    [
      "too many settings",
      {
        settings: Object.fromEntries(
          Array.from({ length: 33 }, (_, i) => [`s${i}`, i]),
        ),
      },
    ],
    [
      "duplicate modules",
      {
        modules: [
          { id: "a", version: "1" },
          { id: "a", version: "2" },
        ],
      },
    ],
    [
      "too many modules",
      {
        modules: Array.from({ length: 501 }, (_, i) => ({
          id: `m${i}`,
          version: "1",
        })),
      },
    ],
  ])("rejects %s", (_, overrides) => {
    expect(parseReport({ ...makeReport(), ...overrides }).success).toBe(false);
  });

  test("rejects extra fields", () => {
    const result = parseReport({ ...makeReport(), worldTitle: "My Game" });
    expect(result.success).toBe(false);
  });

  test("says what's wrong", () => {
    expect(parseReport(makeReport({ userCount: -1 }))).toEqual({
      success: false,
      issues: [expect.stringContaining("userCount")],
    });
  });
});

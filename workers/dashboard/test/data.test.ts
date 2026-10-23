import { describe, expect, test } from "vitest";

import {
  breakdown,
  bucketOrder,
  compareVersions,
  formatCount,
  formatPercent,
  foundryGeneration,
  shareSeries,
  shownWeeks,
  weekStart,
  type WeeklyCount,
} from "../src/app/data.ts";

const row = (week: string, value: string, installs: number): WeeklyCount => ({
  week,
  value,
  installs,
});

describe("shownWeeks", () => {
  const rows = [
    row("2026-10-12", "", 1),
    row("2026-10-05", "", 1),
    row("2026-10-19", "", 1),
  ];

  test("leaves out the current week", () => {
    expect(weekStart(new Date("2026-10-24T12:00:00Z"))).toBe("2026-10-19");
    expect(shownWeeks(rows, new Date("2026-10-24T12:00:00Z"))).toEqual([
      "2026-10-05",
      "2026-10-12",
    ]);
  });

  test("shows the current week if it's all there is", () => {
    expect(
      shownWeeks([row("2026-10-19", "", 1)], new Date("2026-10-24T12:00:00Z")),
    ).toEqual(["2026-10-19"]);
  });
});

describe("compareVersions", () => {
  test("compares numerically", () => {
    const versions = ["10.99", "10.130", "9.1", "10.130.1", "10.13"];
    expect(versions.sort(compareVersions)).toEqual([
      "9.1",
      "10.13",
      "10.99",
      "10.130",
      "10.130.1",
    ]);
  });
});

describe("shareSeries", () => {
  const rows = [
    row("2026-10-12", "10.128", 6),
    row("2026-10-12", "10.129", 4),
    row("2026-10-19", "10.128", 2),
    row("2026-10-19", "10.129", 5),
    row("2026-10-19", "10.130", 3),
    row("2026-10-19", "10.127", 1),
  ];

  test("names the biggest values in the selected week, newest first", () => {
    const result = shareSeries(rows, ["2026-10-12", "2026-10-19"], {
      maxSeries: 2,
      selectFrom: "2026-10-19",
    });
    expect(result.series).toEqual(["10.130", "10.129", "Other"]);
    expect(result.weeks).toEqual([
      {
        week: "2026-10-12",
        total: 10,
        values: { "10.129": 4, Other: 6 },
      },
      {
        week: "2026-10-19",
        total: 11,
        values: { "10.129": 5, "10.130": 3, Other: 3 },
      },
    ]);
  });

  test("keeps its series whatever weeks are shown", () => {
    const options = { maxSeries: 2, selectFrom: "2026-10-19" };
    expect(shareSeries(rows, ["2026-10-12"], options).series).toEqual(
      shareSeries(rows, ["2026-10-12", "2026-10-19"], options).series,
    );
  });

  test("has no Other when everything fits", () => {
    expect(
      shareSeries(rows, ["2026-10-19"], { selectFrom: "2026-10-19" }).series,
    ).toEqual(["10.130", "10.129", "10.128", "10.127"]);
  });

  test("groups values", () => {
    const result = shareSeries(
      [
        row("2026-10-19", "13.351", 2),
        row("2026-10-19", "14.360", 3),
        row("2026-10-19", "14.367", 4),
      ],
      ["2026-10-19"],
      { group: foundryGeneration, selectFrom: "2026-10-19" },
    );
    expect(result.series).toEqual(["v14", "v13"]);
    expect(result.weeks[0]?.values).toEqual({ v14: 7, v13: 2 });
  });
});

describe("breakdown", () => {
  const rows = [
    row("2026-10-19", "de", 2),
    row("2026-10-19", "en", 9),
    row("2026-10-19", "fr", 2),
    row("2026-10-12", "en", 7),
  ];

  test("gives one week, most installs first", () => {
    expect(breakdown(rows, "2026-10-19")).toEqual([
      { value: "en", installs: 9 },
      { value: "de", installs: 2 },
      { value: "fr", installs: 2 },
    ]);
  });

  test("can keep an order", () => {
    const buckets = [row("w", "11+", 1), row("w", "1", 5), row("w", "4–6", 3)];
    expect(breakdown(buckets, "w", bucketOrder).map((b) => b.value)).toEqual([
      "1",
      "4–6",
      "11+",
    ]);
  });
});

describe("formatting", () => {
  test.each([
    [0, "0"],
    [1284, "1,284"],
    [12_900, "12.9K"],
    [4_200_000, "4.2M"],
  ])("formatCount(%d) is %s", (n, expected) => {
    expect(formatCount(n)).toBe(expected);
  });

  test.each([
    [1, 3, "33%"],
    [1, 40, "2.5%"],
    [0, 40, "0%"],
    [1, 0, "–"],
  ])("formatPercent(%d, %d) is %s", (part, whole, expected) => {
    expect(formatPercent(part, whole)).toBe(expected);
  });
});

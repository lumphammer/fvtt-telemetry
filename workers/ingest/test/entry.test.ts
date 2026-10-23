import { expect, test } from "vitest";

import * as entry from "../src/index.ts";

// workerd refuses to start a Worker whose entry module exports anything else
test("the entry module only exports handlers", () => {
  for (const [name, value] of Object.entries(entry)) {
    expect(typeof value, name).toMatch(/^(function|object)$/);
  }
});

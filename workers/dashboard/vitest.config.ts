import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(
    fileURLToPath(new URL("../../migrations", import.meta.url)),
  );
  // Wrangler wants the assets folder to exist, even before `vite build`
  mkdirSync(fileURLToPath(new URL("./dist", import.meta.url)), {
    recursive: true,
  });
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
            ACCESS_AUD: "test-aud",
            // whatever .dev.vars says
            DEV_SKIP_ACCESS: "",
          },
        },
      }),
    ],
    test: { setupFiles: ["./test/applyMigrations.ts"] },
  };
});

import { env } from "cloudflare:workers";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
} from "jose";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";

import { handleRequest } from "../src/worker/index.ts";

const issuer = "https://test.cloudflareaccess.com";
const audience = "test-aud";

let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;
let keys: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  otherPrivateKey = (await generateKeyPair("RS256")).privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "test" };
  keys = createLocalJWKSet({ keys: [jwk] });
});

function token({
  key = privateKey,
  aud = audience,
  iss = issuer,
  expiresIn = "1h",
}: {
  key?: CryptoKey;
  aud?: string;
  iss?: string;
  expiresIn?: string;
} = {}) {
  return new SignJWT({ email: "neil@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(iss)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

/** The app's files, as far as these tests are concerned. */
const testEnv: Env = {
  ...env,
  ASSETS: { fetch: async () => new Response("the app") } as never,
};

async function get(
  path: string,
  {
    jwt,
    ip = "192.0.2.1",
    environment = testEnv,
    method = "GET",
  }: { jwt?: string; ip?: string; environment?: Env; method?: string } = {},
) {
  const headers = new Headers({ "CF-Connecting-IP": ip });
  if (jwt) headers.set("Cf-Access-Jwt-Assertion", jwt);
  return handleRequest(
    new Request(`https://stats.example.net${path}`, { method, headers }),
    environment,
    keys,
  );
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM weekly_counts").run();
  const rows = [
    ["investigator", "2026-10-05", "installs", "", 10],
    ["investigator", "2026-10-12", "installs", "", 12],
    ["investigator", "2026-10-19", "installs", "", 15],
    ["investigator", "2026-10-12", "packageVersion", "10.129", 12],
    ["investigator", "2026-10-19", "packageVersion", "10.129", 5],
    ["investigator", "2026-10-19", "packageVersion", "10.130", 10],
    ["investigator", "2026-10-19", "setting:preset", "pathOfCthulhuPreset", 9],
    ["pub-crusade", "2026-10-19", "installs", "", 3],
  ];
  await env.DB.batch(
    rows.map((row) =>
      env.DB.prepare(
        "INSERT INTO weekly_counts (package_id, week, dimension, value, installs) VALUES (?, ?, ?, ?, ?)",
      ).bind(...row),
    ),
  );
});

describe("Access", () => {
  test.each([
    ["no token", undefined],
    ["a token signed with another key", () => token({ key: otherPrivateKey })],
    ["a token for another application", () => token({ aud: "other-aud" })],
    [
      "a token from another team",
      () => token({ iss: "https://evil.cloudflareaccess.com" }),
    ],
    ["an expired token", () => token({ expiresIn: "-1m" })],
    ["a token that isn't a JWT", async () => "nope"],
  ])("refuses %s", async (_, makeToken) => {
    const jwt = makeToken ? await makeToken() : undefined;
    expect((await get("/api/packages", { jwt })).status).toBe(403);
    expect((await get("/", { jwt })).status).toBe(403);
  });

  test("lets a valid token through, to the API and the app", async () => {
    const jwt = await token();
    expect((await get("/api/packages", { jwt })).status).toBe(200);
    const app = await get("/", { jwt });
    expect(await app.text()).toBe("the app");
  });

  test("refuses everything if Access isn't configured", async () => {
    const jwt = await token();
    const response = await get("/api/packages", {
      jwt,
      environment: { ...testEnv, ACCESS_AUD: "" },
    });
    expect(response.status).toBe(403);
  });

  test("DEV_SKIP_ACCESS only works from this machine", async () => {
    const environment = { ...testEnv, DEV_SKIP_ACCESS: "true" };
    for (const ip of ["127.0.0.1", "::1"]) {
      expect((await get("/api/packages", { environment, ip })).status).toBe(
        200,
      );
    }
    expect((await get("/api/packages", { environment })).status).toBe(403);
    expect((await get("/api/packages", { ip: "::1" })).status).toBe(403);
  });
});

describe("API", () => {
  async function api(path: string) {
    const response = await get(path, { jwt: await token() });
    return { status: response.status, body: await response.json() };
  }

  test("lists packages", async () => {
    expect(await api("/api/packages")).toEqual({
      status: 200,
      body: ["investigator", "pub-crusade"],
    });
  });

  test("lists a package's dimensions", async () => {
    expect((await api("/api/investigator/dimensions")).body).toEqual([
      "installs",
      "packageVersion",
      "setting:preset",
    ]);
  });

  test("gives a dimension's counts, for the latest weeks", async () => {
    expect(
      (await api("/api/investigator/series?dimension=packageVersion&weeks=2"))
        .body,
    ).toEqual([
      { week: "2026-10-12", value: "10.129", installs: 12 },
      { week: "2026-10-19", value: "10.130", installs: 10 },
      { week: "2026-10-19", value: "10.129", installs: 5 },
    ]);
    expect(
      (await api("/api/investigator/series?dimension=installs&weeks=2")).body,
    ).toEqual([
      { week: "2026-10-12", value: "", installs: 12 },
      { week: "2026-10-19", value: "", installs: 15 },
    ]);
  });

  test.each([
    "/api/investigator/series?dimension=packageVersion&weeks=0",
    "/api/investigator/series?dimension=packageVersion&weeks=1000",
    "/api/investigator/series?dimension=x%27%3B%20DROP",
  ])("rejects %s", async (path) => {
    expect((await api(path)).status).toBe(400);
  });

  test.each(["/api/investigator", "/api/investigator/nope", "/api/a/b/c"])(
    "has nothing at %s",
    async (path) => {
      expect((await api(path)).status).toBe(404);
    },
  );

  test("is read-only", async () => {
    const response = await get("/api/packages", {
      jwt: await token(),
      method: "POST",
    });
    expect(response.status).toBe(405);
  });
});

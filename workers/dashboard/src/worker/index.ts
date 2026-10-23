import { accessKeys, verifyAccess, type KeyResolver } from "./access.ts";
import { handleApi } from "./api.ts";

const loopback = new Set(["127.0.0.1", "::1"]);

/**
 * `wrangler dev` has no Access in front of it. Only skip the check if it's
 * asked for (in `.dev.vars`) *and* the request comes from this machine, so a
 * stray setting can't open up the deployed dashboard. (On Cloudflare,
 * `CF-Connecting-IP` is always the real client's address, which is never
 * loopback. `wrangler dev` rewrites the URL to the route's domain, so we
 * can't go by that.)
 */
function isLocalDev(request: Request, env: Env) {
  // only in `.dev.vars`, so not always in the generated `Env`
  const devEnv = env as { DEV_SKIP_ACCESS?: string };
  return (
    devEnv.DEV_SKIP_ACCESS === "true" &&
    loopback.has(request.headers.get("CF-Connecting-IP") ?? "")
  );
}

export async function handleRequest(
  request: Request,
  env: Env,
  keys: KeyResolver = accessKeys(env.ACCESS_TEAM_DOMAIN),
): Promise<Response> {
  const url = new URL(request.url);
  if (!isLocalDev(request, env)) {
    const user = await verifyAccess(request, {
      teamDomain: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUD,
      keys,
    });
    if (user === null) return new Response("Forbidden", { status: 403 });
  }
  if (url.pathname.startsWith("/api/")) {
    if (request.method !== "GET") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET" },
      });
    }
    return handleApi(url, env.DB);
  }
  return env.ASSETS.fetch(request);
}

export default {
  fetch: (request, env) => handleRequest(request, env),
} satisfies ExportedHandler<Env>;

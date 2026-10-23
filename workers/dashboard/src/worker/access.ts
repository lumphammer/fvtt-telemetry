import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from "jose";

/**
 * Looks up the key a token was signed with. In production, the Access team's
 * published keys; tests pass their own.
 */
export type KeyResolver = JWTVerifyGetKey;

const keySets = new Map<string, KeyResolver>();

/** The Access team's public keys (cached; jose refreshes them as needed). */
export function accessKeys(teamDomain: string): KeyResolver {
  let keys = keySets.get(teamDomain);
  if (keys === undefined) {
    keys = createRemoteJWKSet(
      new URL(`https://${teamDomain}/cdn-cgi/access/certs`),
    );
    keySets.set(teamDomain, keys);
  }
  return keys;
}

export type AccessConfig = {
  /** e.g. `lumphammer.cloudflareaccess.com` */
  teamDomain: string;
  /** The Access application's "Application Audience (AUD) Tag". */
  audience: string;
  keys: KeyResolver;
};

/**
 * Check the token Cloudflare Access adds to every request it lets through.
 * Access already blocks everyone else at the edge; this makes sure a routing
 * mistake (say, the Worker being reachable some other way) can't expose the
 * dashboard. Returns the user's email, or null if the request isn't allowed.
 */
export async function verifyAccess(
  request: Request,
  { teamDomain, audience, keys }: AccessConfig,
): Promise<string | null> {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || !teamDomain || !audience) return null;
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, keys, {
      issuer: `https://${teamDomain}`,
      audience,
      algorithms: ["RS256"],
    }));
  } catch {
    return null;
  }
  return typeof payload["email"] === "string" ? payload["email"] : "";
}

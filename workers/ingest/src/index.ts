import { parseReport } from "@lumphammer/fvtt-telemetry-schema";

import { runMaintenance, utcDay } from "./maintenance.ts";
import { storeReport } from "./store.ts";

export const reportPath = "/v1/report";
export const maxBodyBytes = 64 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function respond(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
  });
}

/**
 * Cloudflare's guess at the country, if it's a real one. ("XX" is unknown, and
 * "T1" is Tor.)
 */
function getCountry(request: Request) {
  const country = request.cf?.country;
  return typeof country === "string" &&
    /^[A-Z]{2}$/.test(country) &&
    country !== "XX" &&
    country !== "T1"
    ? country
    : null;
}

/** Read the body, or undefined if it's too big. */
async function readBody(request: Request) {
  const declared = Number(request.headers.get("Content-Length"));
  if (declared > maxBodyBytes) return undefined;
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > maxBodyBytes) return undefined;
  return new TextDecoder().decode(bytes);
}

async function handleReport(request: Request, env: Env) {
  // The IP address is the rate limiter's key, and goes nowhere else.
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const { success } = await env.REPORT_LIMITER.limit({ key: ip });
  if (!success) return respond(429, { error: "Too many reports" });

  const body = await readBody(request);
  if (body === undefined) return respond(413, { error: "Report too large" });

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return respond(400, { error: "Not JSON" });
  }

  const result = parseReport(json);
  if (!result.success) {
    return respond(400, { error: "Invalid report", issues: result.issues });
  }
  const packageIds = env.PACKAGE_IDS.split(",").map((id) => id.trim());
  if (!packageIds.includes(result.report.package.id)) {
    return respond(400, { error: "Unknown package" });
  }

  const now = new Date();
  await storeReport(env.DB, result.report, {
    day: utcDay(now),
    country: getCountry(request),
    receivedAt: now.toISOString(),
  });
  return respond(204);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== reportPath)
      return respond(404, { error: "Not found" });
    if (request.method === "OPTIONS") return respond(204);
    if (request.method !== "POST") {
      const response = respond(405, { error: "Method not allowed" });
      response.headers.set("Allow", "POST, OPTIONS");
      return response;
    }
    return handleReport(request, env);
  },

  async scheduled(controller, env) {
    await runMaintenance(
      env.DB,
      new Date(controller.scheduledTime),
      Number(env.RAW_RETENTION_DAYS),
    );
  },
} satisfies ExportedHandler<Env>;

/**
 * Public site-stats endpoint, backed by Cloudflare Web Analytics.
 *
 * This is a Cloudflare Pages Function — it runs server-side on the
 * Pages edge and is NOT bundled into the SPA. The CF API token lives
 * in Pages environment variables and never reaches the client.
 *
 * Required Pages environment variables (set in CF Dashboard →
 * Pages → type-review → Settings → Environment variables, with
 * Production scope):
 *
 *   CF_API_TOKEN
 *     A scoped API token with permission "Account Analytics: Read".
 *     Create at dash.cloudflare.com → My Profile → API Tokens.
 *
 *   CF_ACCOUNT_TAG
 *     Your Cloudflare account id. Find at dash.cloudflare.com →
 *     right sidebar of any zone overview ("Account ID"), or
 *     dash.cloudflare.com → Workers & Pages → right sidebar.
 *
 *   CF_WEB_ANALYTICS_SITE_TAG
 *     The Web Analytics site token for type.review. Find at
 *     dash.cloudflare.com → Analytics & Logs → Web Analytics →
 *     pick the site → top-right "site_token" copy button (NOT the
 *     beacon JS snippet token — the longer hex string in the URL
 *     and in the metric filter dropdown).
 *
 * Mark CF_API_TOKEN as a Secret (encrypted) in the Pages UI; the
 * other two can be plain env vars.
 *
 * Caching: the upstream query is rate-limited per account, and the
 * data updates ~hourly at best, so we cache the raw upstream response
 * in CF's edge cache for 10 minutes. The first hit after the TTL
 * pays the upstream latency (~200-500ms); subsequent hits within the
 * window are served from cache (~5-20ms).
 *
 * The endpoint is GET-only and returns JSON. CORS is not enabled —
 * this is meant to be consumed by the same-origin SPA at type.review;
 * cross-origin embed would have to be added explicitly.
 */

interface Env {
  CF_API_TOKEN?: string;
  CF_ACCOUNT_TAG?: string;
  CF_WEB_ANALYTICS_SITE_TAG?: string;
}

// Minimal local type declarations for the Cloudflare Pages Function
// runtime. Keeps the project free of @cloudflare/workers-types as a
// dependency — the only CF-runtime APIs we touch are `caches.default`
// (Workers Cache API) and the `PagesFunction` handler shape. The main
// `tsc --noEmit` build excludes `functions/` (see tsconfig.json
// `include`), but this also lets editors / future tools type-check it
// without complaining.
interface CfEventContext<E> {
  request: Request;
  env: E;
  waitUntil: (promise: Promise<unknown>) => void;
}
type PagesFunction<E = unknown> = (context: CfEventContext<E>) => Response | Promise<Response>;
interface CfCacheStorage extends CacheStorage {
  readonly default: Cache;
}
declare const caches: CfCacheStorage;

type StatsResponse =
  | { ok: true; data: StatsPayload; generatedAt: string }
  | { ok: false; error: string };

interface StatsPayload {
  /** Window the stats cover, ISO 8601. */
  range: { start: string; end: string; days: number };
  /** Top-line counters for the full window. */
  totals: {
    /** Total page-load events. */
    pageviews: number;
    /** Unique-by-cookieless-fingerprint visitors. */
    visits: number;
  };
  /** Per-day series, ascending date. */
  byDate: ReadonlyArray<{ date: string; pageviews: number; visits: number }>;
  /** Top N referrer hosts (excludes direct / empty referrers). */
  byReferer: ReadonlyArray<{ host: string; pageviews: number }>;
  /** Top N visitor countries by name. */
  byCountry: ReadonlyArray<{ name: string; pageviews: number }>;
}

const CF_GRAPHQL = "https://api.cloudflare.com/client/v4/graphql";
const RANGE_DAYS = 30;
const CACHE_TTL_SECONDS = 600;

const QUERY = `
query SiteStats($accountTag: String!, $siteTag: String!, $start: Time!, $end: Time!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      total: rumPageloadEventsAdaptiveGroups(
        limit: 1
        filter: { siteTag: $siteTag, datetime_geq: $start, datetime_lt: $end }
      ) {
        count
        sum { visits }
      }
      byDate: rumPageloadEventsAdaptiveGroups(
        limit: 100
        filter: { siteTag: $siteTag, datetime_geq: $start, datetime_lt: $end }
        orderBy: [date_ASC]
      ) {
        dimensions { date }
        count
        sum { visits }
      }
      byReferer: rumPageloadEventsAdaptiveGroups(
        limit: 10
        filter: { siteTag: $siteTag, datetime_geq: $start, datetime_lt: $end, refererHost_neq: "" }
        orderBy: [count_DESC]
      ) {
        dimensions { refererHost }
        count
      }
      byCountry: rumPageloadEventsAdaptiveGroups(
        limit: 10
        filter: { siteTag: $siteTag, datetime_geq: $start, datetime_lt: $end }
        orderBy: [count_DESC]
      ) {
        dimensions { countryName }
        count
      }
    }
  }
}
`;

interface RumGroup {
  count?: number;
  sum?: { visits?: number };
  dimensions?: {
    date?: string;
    refererHost?: string;
    countryName?: string;
  };
}

interface GraphQLResponse {
  data?: {
    viewer?: {
      accounts?: ReadonlyArray<{
        total?: ReadonlyArray<RumGroup>;
        byDate?: ReadonlyArray<RumGroup>;
        byReferer?: ReadonlyArray<RumGroup>;
        byCountry?: ReadonlyArray<RumGroup>;
      }>;
    };
  };
  errors?: ReadonlyArray<{ message: string }>;
}

function jsonResponse(body: StatsResponse, status: number, cacheable: boolean): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheable ? `public, max-age=${CACHE_TTL_SECONDS}` : "no-store",
    },
  });
}

function reshape(
  raw: GraphQLResponse,
  start: string,
  end: string,
): StatsPayload | { error: string } {
  if (raw.errors && raw.errors.length > 0) {
    return { error: `cf graphql: ${raw.errors.map((e) => e.message).join("; ")}` };
  }
  const account = raw.data?.viewer?.accounts?.[0];
  if (!account) {
    return { error: "cf graphql: empty account result" };
  }
  const total = account.total?.[0];
  return {
    range: { start, end, days: RANGE_DAYS },
    totals: {
      pageviews: total?.count ?? 0,
      visits: total?.sum?.visits ?? 0,
    },
    byDate: (account.byDate ?? [])
      .filter((g) => typeof g.dimensions?.date === "string")
      .map((g) => ({
        date: g.dimensions!.date as string,
        pageviews: g.count ?? 0,
        visits: g.sum?.visits ?? 0,
      })),
    byReferer: (account.byReferer ?? [])
      .filter((g) => typeof g.dimensions?.refererHost === "string")
      .map((g) => ({ host: g.dimensions!.refererHost as string, pageviews: g.count ?? 0 })),
    byCountry: (account.byCountry ?? [])
      .filter((g) => typeof g.dimensions?.countryName === "string")
      .map((g) => ({ name: g.dimensions!.countryName as string, pageviews: g.count ?? 0 })),
  };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_TAG || !env.CF_WEB_ANALYTICS_SITE_TAG) {
    return jsonResponse(
      {
        ok: false,
        error:
          "Stats endpoint is not configured. Set CF_API_TOKEN, CF_ACCOUNT_TAG, and CF_WEB_ANALYTICS_SITE_TAG in CF Pages → Settings → Environment variables.",
      },
      503,
      false,
    );
  }

  // Edge cache lookup. Key by the full URL so query-string variants
  // (none today, but future-proof) don't collide.
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  // Window: last RANGE_DAYS calendar days through now, both as UTC ISO.
  const end = new Date();
  const start = new Date(end.getTime() - RANGE_DAYS * 24 * 60 * 60 * 1000);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  let upstream: Response;
  try {
    upstream = await fetch(CF_GRAPHQL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.CF_API_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: QUERY,
        variables: {
          accountTag: env.CF_ACCOUNT_TAG,
          siteTag: env.CF_WEB_ANALYTICS_SITE_TAG,
          start: startIso,
          end: endIso,
        },
      }),
    });
  } catch (err) {
    return jsonResponse(
      { ok: false, error: `upstream fetch failed: ${(err as Error).message}` },
      502,
      false,
    );
  }

  if (!upstream.ok) {
    const body = await upstream.text();
    return jsonResponse(
      {
        ok: false,
        error: `cf graphql ${upstream.status}: ${body.slice(0, 300)}`,
      },
      502,
      false,
    );
  }

  let raw: GraphQLResponse;
  try {
    raw = (await upstream.json()) as GraphQLResponse;
  } catch (err) {
    return jsonResponse(
      { ok: false, error: `cf graphql returned non-json: ${(err as Error).message}` },
      502,
      false,
    );
  }

  const shaped = reshape(raw, startIso, endIso);
  if ("error" in shaped) {
    return jsonResponse({ ok: false, error: shaped.error }, 502, false);
  }

  const response = jsonResponse(
    { ok: true, data: shaped, generatedAt: new Date().toISOString() },
    200,
    true,
  );

  // Stash in edge cache. `waitUntil` lets the response return immediately
  // while the cache write happens in the background.
  context.waitUntil(cache.put(request, response.clone()));
  return response;
};

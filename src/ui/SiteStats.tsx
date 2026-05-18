import type { JSX } from "solid-js";
import { createResource, For, Show } from "solid-js";
import { BackLink } from "./components/BackLink";
import type { RouteName } from "./router";

export interface SiteStatsProps {
  onNavigate: (to: RouteName) => void;
}

interface StatsPayload {
  range: { start: string; end: string; days: number };
  totals: { pageviews: number; visits: number };
  byDate: ReadonlyArray<{ date: string; pageviews: number; visits: number }>;
  byReferer: ReadonlyArray<{ host: string; pageviews: number }>;
  byCountry: ReadonlyArray<{ name: string; pageviews: number }>;
}

type StatsResponse =
  | { ok: true; data: StatsPayload; generatedAt: string }
  | { ok: false; error: string };

async function fetchStats(): Promise<StatsResponse> {
  const r = await fetch("/api/stats", { headers: { accept: "application/json" } });
  // Distinguish "endpoint missing" (mirror deploys, dev server) from
  // "endpoint replied with structured error" — both should land the
  // user in a friendly empty state, but for different reasons.
  if (r.status === 404) {
    return {
      ok: false,
      error:
        "The /api/stats endpoint is not available on this deploy. The public stats page only works on type.review (Cloudflare Pages).",
    };
  }
  try {
    return (await r.json()) as StatsResponse;
  } catch {
    return { ok: false, error: `unexpected response: HTTP ${r.status}` };
  }
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatDate(iso: string): string {
  // Display as YYYY-MM-DD only; the upstream returns either a date
  // string ("2026-05-18") or a full ISO timestamp depending on the
  // grouping dimension. Trim either to its date part.
  return iso.slice(0, 10);
}

function formatGenerated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

/**
 * Public site-stats dashboard, backed by `/api/stats` (a CF Pages
 * Function that proxies Cloudflare's Web Analytics GraphQL API with a
 * server-stored token — see `functions/api/stats.ts`).
 *
 * Numbers cover the last 30 days. Cached upstream for 10 min, so a
 * page refresh inside that window is free.
 */
export function SiteStats(props: SiteStatsProps): JSX.Element {
  const [stats] = createResource(fetchStats);

  return (
    <main class="stage page page--narrow">
      <header class="page__head">
        <div class="label">site stats</div>
        <h2 class="page__title">type.review, in numbers.</h2>
      </header>

      <section class="page__body">
        <p>
          Aggregate pageviews and visits from{" "}
          <a href="https://www.cloudflare.com/web-analytics/" rel="noopener">
            Cloudflare Web Analytics
          </a>{" "}
          — cookieless, no PII collected, no cross-site tracking. The numbers below cover the last
          30 days. They update roughly hourly upstream and are cached at the edge for 10 minutes, so
          refreshing the page won't re-poll.
        </p>

        <Show when={stats.loading}>
          <p class="results__note">loading…</p>
        </Show>

        <Show when={stats() && stats()?.ok === false}>
          <p class="results__note">{(stats() as { ok: false; error: string }).error}</p>
        </Show>

        <Show when={stats() && stats()?.ok === true}>
          {(_ok) => {
            const payload = stats() as { ok: true; data: StatsPayload; generatedAt: string };
            const d = payload.data;
            return (
              <>
                <div class="metric-strip">
                  <div class="metric-strip__cell">
                    <div class="metric-strip__value">{formatNumber(d.totals.pageviews)}</div>
                    <div class="metric-strip__label">pageviews · 30d</div>
                  </div>
                  <div class="metric-strip__cell">
                    <div class="metric-strip__value">{formatNumber(d.totals.visits)}</div>
                    <div class="metric-strip__label">visits · 30d</div>
                  </div>
                </div>

                <h3>By day</h3>
                <Show
                  when={d.byDate.length > 0}
                  fallback={<p class="results__note">no daily data yet.</p>}
                >
                  <table class="sessions">
                    <thead>
                      <tr>
                        <th>date</th>
                        <th>pageviews</th>
                        <th>visits</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={d.byDate}>
                        {(row) => (
                          <tr>
                            <td>{formatDate(row.date)}</td>
                            <td>{formatNumber(row.pageviews)}</td>
                            <td>{formatNumber(row.visits)}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </Show>

                <h3>Top referrers</h3>
                <Show
                  when={d.byReferer.length > 0}
                  fallback={<p class="results__note">no referrer data yet.</p>}
                >
                  <table class="sessions">
                    <thead>
                      <tr>
                        <th>referrer</th>
                        <th>pageviews</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={d.byReferer}>
                        {(row) => (
                          <tr>
                            <td>{row.host}</td>
                            <td>{formatNumber(row.pageviews)}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </Show>

                <h3>Top countries</h3>
                <Show
                  when={d.byCountry.length > 0}
                  fallback={<p class="results__note">no country data yet.</p>}
                >
                  <table class="sessions">
                    <thead>
                      <tr>
                        <th>country</th>
                        <th>pageviews</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={d.byCountry}>
                        {(row) => (
                          <tr>
                            <td>{row.name}</td>
                            <td>{formatNumber(row.pageviews)}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </Show>

                <p class="field__hint" style={{ "margin-top": "var(--space-4)" }}>
                  generated {formatGenerated(payload.generatedAt)}
                </p>
              </>
            );
          }}
        </Show>
      </section>

      <div class="actions">
        <BackLink from="site-stats" onNavigate={props.onNavigate} />
      </div>
    </main>
  );
}

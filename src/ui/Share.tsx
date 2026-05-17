import type { JSX } from "solid-js";
import { Show } from "solid-js";

export interface ShareViewProps {
  /** The URL-segment payload — base64-encoded JSON of the result fields. */
  payload: string;
  /** Click handler for "back to practice". */
  onHome: () => void;
}

interface SharePayload {
  v: number;
  wpm: number;
  acc: number;
  raw: number;
  dur: number;
  m: "adaptive" | "benchmark";
  title?: string | null;
  author?: string | null;
}

function decode(payload: string): SharePayload | null {
  if (payload === "") return null;
  try {
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const data = JSON.parse(json);
    const inRange = (n: unknown, lo: number, hi: number): n is number =>
      typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
    if (
      typeof data !== "object" ||
      data === null ||
      !inRange(data.wpm, 0, 1000) ||
      !inRange(data.acc, 0, 100) ||
      !inRange(data.raw, 0, 1000) ||
      // Duration in seconds: 0 → 24h is generous.
      !inRange(data.dur, 0, 86400) ||
      (data.m !== "adaptive" && data.m !== "benchmark")
    ) {
      return null;
    }
    return data as SharePayload;
  } catch {
    return null;
  }
}

/**
 * Renders a result card from a payload encoded in the URL. Read-only;
 * no app state involved. Lets users share a single run as a link without
 * an account or backend — the URL IS the data. Pasting this into Twitter
 * etc. just gives a link; if you want a PNG for richer previews, an
 * `og:image` endpoint (Cloudflare Worker, ~50 lines) is the standard
 * follow-on but out of scope here.
 */
export function ShareView(props: ShareViewProps): JSX.Element {
  const decoded = decode(props.payload);
  return (
    <main class="stage page page--narrow">
      <Show
        when={decoded}
        fallback={
          <div class="empty-note">
            this share link looks malformed —{" "}
            <button type="button" class="link" onClick={() => props.onHome()}>
              go to practice
            </button>
          </div>
        }
      >
        {(data) => (
          <div class="share-card">
            <p class="share-card__brand">type.review</p>
            <div class="share-card__hero">
              <span class="share-card__wpm">{data().wpm}</span>
              <span class="share-card__wpm-unit">wpm</span>
            </div>
            <div class="share-card__meta">
              <span>{data().acc}% accuracy</span>
              <span class="profile-id__sep">·</span>
              <span>{data().raw} raw</span>
              <span class="profile-id__sep">·</span>
              <span>{data().dur}s</span>
              <span class="profile-id__sep">·</span>
              <span>{data().m}</span>
            </div>
            <Show when={data().title || data().author}>
              <p class="share-card__attribution">
                <Show when={data().title}>
                  <em>{data().title}</em>
                </Show>
                <Show when={data().author}>
                  {data().title ? " — " : ""}
                  {data().author}
                </Show>
              </p>
            </Show>
            <div class="actions" style={{ "margin-top": "var(--space-6)" }}>
              <button type="button" class="btn btn--primary" onClick={() => props.onHome()}>
                try it yourself
              </button>
            </div>
          </div>
        )}
      </Show>
    </main>
  );
}

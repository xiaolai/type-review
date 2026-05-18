import type { JSX } from "solid-js";
import { BackLink } from "./components/BackLink";
import type { RouteName } from "./router";

export interface AboutProps {
  onNavigate: (to: RouteName) => void;
}

/**
 * One-screen explainer of what TYPE is and what it does — and does not —
 * do with your data. This page is the privacy summary too; doubling them
 * up keeps the user from having to read two pages of policy.
 */
export function About(props: AboutProps): JSX.Element {
  return (
    <main class="stage page page--narrow">
      <header class="page__head">
        <div class="label">about</div>
        <h2 class="page__title">A typing trainer that stays on your machine.</h2>
      </header>

      <section class="page__body">
        <nav class="hub" aria-label="info pages">
          <a class="hub__card" href="#/site-stats">
            <span class="hub__title">Site stats</span>
            <span class="hub__sub">Pageviews, visitors, top referrers — last 30 days.</span>
          </a>
          <a class="hub__card" href="#/features">
            <span class="hub__title">Features</span>
            <span class="hub__sub">Everything TYPE does, in one scan.</span>
          </a>
          <a class="hub__card" href="#/guide">
            <span class="hub__title">User guide</span>
            <span class="hub__sub">How modes, sources, and settings work.</span>
          </a>
          <a class="hub__card" href="#/credits">
            <span class="hub__title">Credits</span>
            <span class="hub__sub">Audio, corpus, fonts, libraries.</span>
          </a>
          <a class="hub__card" href="#/copyright">
            <span class="hub__title">Copyright</span>
            <span class="hub__sub">License and what's covered by what.</span>
          </a>
        </nav>

        <h3>Why typing matters</h3>
        <p>
          A short illustrated essay on what fluent typing does for a young brain — and why it still
          matters in the age of voice assistants and AI.{" "}
          <a href="#/articles/superpower-fingertips">Read: The Superpower at Your Fingertips →</a>
        </p>

        <h3>What TYPE is</h3>
        <p>A web app for getting faster and more accurate at typing. Two modes:</p>
        <ul>
          <li>
            <b>Adaptive mode</b> teaches a small alphabet first and unlocks more letters as you get
            fast and accurate on the ones you have.
          </li>
          <li>
            <b>Benchmark mode</b> is a timed run on real prose.
          </li>
        </ul>
        <p>
          Every run, regardless of mode, feeds the same per-key stats. Practising benchmark still
          sharpens the adaptive picture.
        </p>

        <h3>Privacy summary</h3>
        <p>
          TYPE runs entirely in your browser — no account, no server-side state, no cookies, no
          localStorage outside the <code>type-review:</code> namespace, fonts served from this
          origin (not Google's CDN).
        </p>
        <p>
          The one piece of third-party JS the page loads is{" "}
          <a href="https://www.cloudflare.com/web-analytics/" rel="noopener">
            Cloudflare Web Analytics
          </a>{" "}
          — cookieless, no cross-site tracking, no PII; it counts pageviews and visits by country /
          referrer. Those aggregate numbers are public — see{" "}
          <a href="#/site-stats">live site stats</a>. Nothing about your practice runs, your
          keystrokes, or your uploaded text is collected or transmitted.
        </p>

        <h3>Where your data lives</h3>
        <ul>
          <li>
            Your practice history, settings, and uploaded texts live in your browser's IndexedDB
            under the database <code>type-review</code>. Two object stores:
            <code>profile</code> (your runs and settings) and <code>user-corpus</code>
            (anything you upload in the library).
          </li>
          <li>
            UI preferences (theme, sound, keyboard layout, source pick) live in localStorage, keys
            prefixed <code>type-review:</code>.
          </li>
          <li>
            Nothing is uploaded. Clearing your browser data — or using the <b>reset profile</b>
            button in Settings — removes everything.
          </li>
        </ul>

        <h3>Export</h3>
        <p>
          Settings → Data → <b>export profile</b> downloads a JSON file with your runs and settings.
          It's plain text and human-readable.
        </p>

        <h3>The text you practise on</h3>
        <p>
          TYPE ships a small library of public-domain quotes and short passages, plus a handful of
          short fair-use quotation snippets from notable modern authors. Each entry carries a{" "}
          <code>license</code> field — see <code>src/io/corpus/data/</code> in the source tree for
          full attribution. You can also drop your own <code>.txt</code> or <code>.md</code> in the{" "}
          <a href="#/library">library</a>; those stay local.
        </p>

        <h3>Source</h3>
        <p>
          MIT-licensed. Repository:{" "}
          <a href="https://github.com/xiaolai/type-review" rel="noopener">
            github.com/xiaolai/type-review
          </a>
          .
        </p>
      </section>

      <div class="actions">
        <BackLink from="about" onNavigate={props.onNavigate} />
      </div>
    </main>
  );
}

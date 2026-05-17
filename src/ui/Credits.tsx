import type { JSX } from "solid-js";
import { BackLink } from "./components/BackLink";
import type { RouteName } from "./router";

export interface CreditsProps {
  onNavigate: (to: RouteName) => void;
}

/**
 * Hand-authored attribution page. Mirrors the structure of root
 * CREDITS.md but adds the runtime / dev-tooling stack the markdown
 * file doesn't enumerate. Keep this in sync when adding a third-party
 * asset, dep, or font.
 */
export function Credits(props: CreditsProps): JSX.Element {
  return (
    <main class="stage page page--narrow">
      <header class="page__head">
        <div class="label">credits</div>
        <h2 class="page__title">Stand on shoulders.</h2>
      </header>

      <section class="page__body">
        <h3>Audio</h3>
        <ul>
          <li>
            <b>typewriter sound pack</b> — "Typewriter #1" from{" "}
            <a href="https://bigsoundbank.com/detail-1065-typewriter.html" rel="noopener">
              BigSoundBank
            </a>
            . Public domain (CC0); credited as a courtesy.
          </li>
          <li>
            <b>mechvibe and soft packs</b> — generated on-device with the Web Audio API. No assets,
            no downloads.
          </li>
        </ul>

        <h3>Corpus</h3>
        <p>
          Bundled text under <code>src/io/corpus/data/</code> carries a per-entry{" "}
          <code>license</code> field. The bulk is public-domain prose from Mark Twain, Henry David
          Thoreau, Ralph Waldo Emerson, Marcus Aurelius, Herman Melville, and similar; a handful are
          short fair-use quotation snippets from modern authors. See <code>quotes.json</code> and{" "}
          <code>code/*.json</code> in the source tree for full attribution.
        </p>

        <h3>Fonts</h3>
        <ul>
          <li>
            <b>Geist Sans + Geist Mono</b> — Vercel, SIL Open Font License. Used only if the user
            agent already has them installed; the app does <em>not</em> fetch any font at runtime.
            System sans / mono fall back cleanly.
          </li>
        </ul>

        <h3>Runtime</h3>
        <ul>
          <li>
            <a href="https://www.solidjs.com" rel="noopener">
              <b>SolidJS</b>
            </a>{" "}
            — fine-grained reactive UI; the only runtime dependency. MIT.
          </li>
        </ul>

        <h3>Build and dev tooling</h3>
        <ul>
          <li>
            <a href="https://vite.dev" rel="noopener">
              Vite
            </a>{" "}
            — bundler / dev server. MIT.
          </li>
          <li>
            <a href="https://www.typescriptlang.org" rel="noopener">
              TypeScript
            </a>{" "}
            — language. Apache-2.0.
          </li>
          <li>
            <a href="https://biomejs.dev" rel="noopener">
              Biome
            </a>{" "}
            — lint + format. MIT.
          </li>
          <li>
            <a href="https://vitest.dev" rel="noopener">
              Vitest
            </a>{" "}
            +{" "}
            <a href="https://github.com/dumbmatter/fakeIndexedDB" rel="noopener">
              fake-indexeddb
            </a>{" "}
            +{" "}
            <a href="https://github.com/jsdom/jsdom" rel="noopener">
              jsdom
            </a>{" "}
            — test runner and DOM/storage shims. MIT.
          </li>
          <li>
            <a href="https://fast-check.dev" rel="noopener">
              fast-check
            </a>{" "}
            — property-based tests for the engine. MIT.
          </li>
          <li>
            <a href="https://playwright.dev" rel="noopener">
              Playwright
            </a>{" "}
            — end-to-end browser scripts. Apache-2.0.
          </li>
          <li>
            <a href="https://lefthook.dev" rel="noopener">
              Lefthook
            </a>{" "}
            — git hook manager. MIT.
          </li>
        </ul>

        <h3>License</h3>
        <p>
          TYPE itself is MIT-licensed. Source on{" "}
          <a href="https://github.com/xiaolai/type-review" rel="noopener">
            GitHub
          </a>
          .
        </p>
      </section>

      <div class="actions">
        <BackLink from="credits" onNavigate={props.onNavigate} />
      </div>
    </main>
  );
}

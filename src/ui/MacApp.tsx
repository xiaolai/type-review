import type { JSX } from "solid-js";
import { BackLink } from "./components/BackLink";
import type { RouteName } from "./router";

export interface MacAppProps {
  onNavigate: (to: RouteName) => void;
}

/** One screenshot and the sentence that says why it is here. */
function Shot(props: { src: string; alt: string; caption: string }): JSX.Element {
  return (
    <figure class="shot">
      {/* `loading="lazy"` because four window captures is a lot of bytes for
          a page most people reach to get a download link. */}
      <img src={props.src} alt={props.alt} loading="lazy" />
      <figcaption>{props.caption}</figcaption>
    </figure>
  );
}

/**
 * The macOS app: what it is, how to get it, and what it does that the web
 * version cannot.
 *
 * Its own page rather than a section of `/features`, because the two answer
 * different questions. Features describes TYPE; this describes a *download* —
 * the reader has already decided they want it and needs a command, a system
 * requirement, and a reason to believe the thing is safe to run.
 */
export function MacApp(props: MacAppProps): JSX.Element {
  return (
    <main class="stage page page--narrow">
      <header class="page__head">
        <div class="label">macOS</div>
        <h2 class="page__title">TYPE, native on your Mac.</h2>
      </header>

      <section class="page__body">
        <p>
          The same adaptive engine as this page, built as a real Mac application — no browser, no
          web view. It practises offline, keeps your history in a file you can point at, and does
          several things a web page is not allowed to do.
        </p>

        <h3>Install</h3>
        <p>With Homebrew, which also keeps it updated:</p>
        <pre class="code-block">
          <code>brew install --cask xiaolai/tap/type-review</code>
        </pre>
        <p>
          Or download the notarised <code>.zip</code> from{" "}
          <a href="https://github.com/xiaolai/type-review-app-macos/releases" rel="noopener">
            the releases page
          </a>{" "}
          and drag <code>TYPE.app</code> to Applications. Either way the build is signed and
          notarised by Apple, so it opens without the “unidentified developer” dialogue.
        </p>
        <p class="note">Requires macOS 14 or later, on Apple silicon.</p>

        <h3>What the Mac app adds</h3>
        <ul>
          <li>
            <b>A keyboard that sounds like a keyboard, everywhere.</b> Seven packs — three
            synthesised mechanical profiles, a real typewriter recording, a muted one, a laptop one,
            and off. Optionally in every application, so a quiet laptop keyboard can be given the
            sound of a mechanical one.
          </li>
          <li>
            <b>It speaks each word as you finish it.</b> Type a word correctly and your Mac says it
            — built for children learning to read and type, with a choice of English voices. Off by
            default.
          </li>
          <li>
            <b>It lives in the menu bar.</b> Close the window and it stays. It can start at login,
            hide its Dock icon, and be summoned from any app with a shortcut.
          </li>
          <li>
            <b>Your data is a file.</b> One JSON profile you can reveal in Finder, export, and
            import back.
          </li>
        </ul>

        <h3>What it looks like</h3>
        <div class="shots">
          <Shot
            src="/mac/practice-keyboard.png"
            alt="The TYPE practice window with the on-screen keyboard drawn out below it, keys tinted by how well each one is going."
            caption="The practice window, with the keyboard drawer out. Each key is tinted by how well you type it."
          />
          <Shot
            src="/mac/statistics.png"
            alt="The Statistics window showing runs, best speed, a streak, and a table of per-key speed and error rate."
            caption="Per-key statistics, and the same numbers regrouped by the finger responsible."
          />
          <Shot
            src="/mac/sound.png"
            alt="The Sound settings pane, showing the keyboard sound pack, volume, speak-words toggle, voice picker, and the list of applications the keyboard stays silent in."
            caption="Sound settings, including the applications the keyboard stays silent in."
          />
          <Shot
            src="/mac/practice.png"
            alt="The TYPE practice window on its own, mid-run, showing typed text, live words per minute and accuracy."
            caption="Or just the text, if the keyboard is not what you need."
          />
        </div>

        <h3>Privacy</h3>
        <p>
          The Mac app makes no network requests of any kind — it links no networking framework and
          contains no HTTP client. No account, no server, no telemetry. The optional system-wide
          keyboard sound reads which physical key moved and nothing else: it cannot tell an{" "}
          <code>a</code> from a <code>q</code>, it switches itself off entirely while a password
          manager is in front, and every secure text field in macOS silences it. Full detail in the{" "}
          <a href="/privacy/">privacy policy</a>.
        </p>

        <h3>Source</h3>
        <p>
          MIT-licensed, like this site.{" "}
          <a href="https://github.com/xiaolai/type-review-app-macos" rel="noopener">
            github.com/xiaolai/type-review-app-macos
          </a>
          .
        </p>
      </section>

      <div class="actions">
        <BackLink from="mac" onNavigate={props.onNavigate} />
      </div>
    </main>
  );
}

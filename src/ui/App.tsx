import type { JSX } from "solid-js";
import { createMemo, createSignal, onCleanup, Show } from "solid-js";
import type { CorpusEntry } from "../engine/corpus";
import type { ProfileSettings, Session } from "../engine/session";
import type { ProfileStore } from "../io";
import {
  bundledCode,
  bundledQuotes,
  createCompositeCorpus,
  createCorpusSessionAdapter,
  createDifficultSource,
  createDrillsSource,
  createKeyEventBus,
  createProfileStore,
  createUserSource,
  NoPersistStore,
  validateSettings,
} from "../io";
import { About } from "./About";
import { ArticleView } from "./articles/ArticleView";
import { Copyright } from "./Copyright";
import { Credits } from "./Credits";
import type { LoadBanner, SaveBanner } from "./components/Banners";
import { Banners } from "./components/Banners";
import { BottomNav } from "./components/BottomNav";
import { Footer } from "./components/Footer";
import { PracticeStage } from "./components/PracticeStage";
import { ResultsStage } from "./components/ResultsStage";
import { Topbar } from "./components/Topbar";
import { Features } from "./Features";
import { createCorpusChannel } from "./hooks/use-corpus-channel";
import { createCrossTab } from "./hooks/use-cross-tab";
import { createKeySounds } from "./hooks/use-key-sounds";
import { createKeyboardLayout } from "./hooks/use-keyboard-layout";
import { createKeymap } from "./hooks/use-keymap";
import { createPressedKeys } from "./hooks/use-pressed-keys";
import { createSessionBootstrap } from "./hooks/use-session-bootstrap";
import { createSessionHandlers } from "./hooks/use-session-handlers";
import { createShowWhitespace } from "./hooks/use-show-whitespace";
import { createSnapshotView } from "./hooks/use-snapshot";
import { createUserCorpus } from "./hooks/use-user-corpus";
import { Library } from "./Library";
import { logFailure } from "./log";
import { exportProfileBlob, importProfileFromFile, resetProfileStore } from "./profile-actions";
import type { RouteName } from "./router";
import { createRouter } from "./router";
import { Settings } from "./Settings";
import { ShareView } from "./Share";
import { StatsView } from "./Stats";
import { createTheme } from "./theme";
import { UserGuide } from "./UserGuide";

const CROSS_TAB_CHANNEL = "type-review";

export interface AppProps {
  /** Profile store override — defaults to IndexedDB-or-memory. Used by tests. */
  store?: ProfileStore;
}

/**
 * App shell. Owns the async session lifecycle, then composes the rendered
 * tree from focused components, hooks, and the hash router.
 *
 * Routing: `#/practice` (default), `#/results`, `#/profile`, `#/library`,
 * `#/settings`, `#/about`, `#/features`, `#/guide`, `#/credits`.
 *
 * The typing hot loop is kept out of reactive state: keystrokes mutate the
 * plain `Session` and the snapshot signal is refreshed via the
 * `createSnapshotView` hook (RAF-batched).
 */
export function App(props: AppProps = {}): JSX.Element {
  const storePromise: Promise<ProfileStore> = props.store
    ? Promise.resolve(props.store)
    : createProfileStore();
  const theme = createTheme();
  const keyboardLayout = createKeyboardLayout();
  const keymap = createKeymap();
  const showWhitespace = createShowWhitespace();
  const view = createSnapshotView();
  const crossTab = createCrossTab(CROSS_TAB_CHANNEL);
  const router = createRouter();

  // Single source of truth for keyboard events. The engine input handler and
  // the on-screen keyboard's pressed-state both subscribe here; nothing else
  // in the tree touches `window.addEventListener` for keys.
  const keyBus = createKeyEventBus();
  const pressedKeys = createPressedKeys(keyBus);
  const keySounds = createKeySounds(keyBus);
  onCleanup(() => keyBus.detach());

  // Corpus stack — composite of user / quote / code / difficult / drills
  // channels, selected via the persisted `corpusChannel` signal. The
  // adapter bridges to Session's expected `adaptiveSource / benchmarkSource`
  // function shape, and exposes the entry of the most recent passage for
  // post-run attribution. `drills` is last because it can always produce
  // text from any non-empty alphabet, making it the universal fallback
  // in auto mode.
  const userCorpus = createUserCorpus();
  const corpusChannel = createCorpusChannel();
  const corpus = createCompositeCorpus({
    channels: [
      { name: "user", source: createUserSource(() => userCorpus.passages()) },
      { name: "quote", source: bundledQuotes },
      { name: "code", source: bundledCode },
      { name: "difficult", source: createDifficultSource(Math.random) },
      { name: "drills", source: createDrillsSource(Math.random) },
    ],
    activeChannel: () => corpusChannel.channel(),
  });
  const [currentEntry, setCurrentEntry] = createSignal<CorpusEntry | null>(null);
  const corpusAdapter = createCorpusSessionAdapter(corpus, Math.random, {
    onEntryPicked: setCurrentEntry,
  });

  const [loadBanner, setLoadBanner] = createSignal<LoadBanner>(null);
  const [saveBanner, setSaveBanner] = createSignal<SaveBanner>(null);
  const [runCrashed, setRunCrashed] = createSignal(false);

  /** True iff the named route is currently active. */
  const is = (name: RouteName): boolean => router.route().name === name;

  // Stale-other-tab is owned by the BroadcastChannel hook; surface it as the
  // saveBanner so App's "show one save banner at a time" rule still applies.
  // Priority: a current save failure (data-at-risk RIGHT NOW) outranks a
  // stale-other-tab notice (reload needed eventually).
  const effectiveSaveBanner = createMemo<SaveBanner>(() => {
    const local = saveBanner();
    if (local !== null) {
      return local;
    }
    return crossTab.stale() ? "stale-other-tab" : null;
  });

  let session!: Session;
  let store!: ProfileStore;
  let disposed = false;
  /** Hidden input ref for the mobile soft-keyboard capture path. */
  let hiddenInputRef: HTMLInputElement | undefined;

  onCleanup(() => {
    disposed = true;
  });

  const persist = (): void => {
    store
      .save(session.profile)
      .then(() => {
        if (!disposed && saveBanner() === "save-failed") {
          setSaveBanner(null);
        }
        crossTab.notify();
      })
      .catch((err: unknown) => {
        logFailure("save", err, {
          resultsCount: session.profile.results.length,
        });
        if (!disposed) {
          setSaveBanner("save-failed");
        }
      });
  };

  const goNext = (): void => {
    session.start();
    router.navigate("practice");
    view.syncNow();
  };

  const runCustomText = (text: string): void => {
    // Custom-text runs bypass the corpus adapter, which is where
    // `setCurrentEntry` is wired. Without an explicit clear, the
    // Results screen would still show attribution from whatever entry
    // was last picked.
    setCurrentEntry(null);
    session.startWithText(text);
    router.navigate("practice");
    view.syncNow();
  };

  // Source picker → restart the run so the new channel's passage shows
  // up immediately. Otherwise the change would sit queued until the next
  // Tab / run completion, which is what the user actually noticed.
  const handleCorpusChannelChange: typeof corpusChannel.setChannel = (next) => {
    if (next === corpusChannel.channel()) return;
    corpusChannel.setChannel(next);
    if (is("practice")) {
      session.start();
      view.syncNow();
    }
  };

  const applySettings = (next: ProfileSettings): void => {
    const validated = validateSettings(next);
    if (validated === null) {
      logFailure("settings", new Error("validateSettings rejected the input"));
      return;
    }
    session.updateSettings(validated);
    persist();
    // Settings is immediate-mode now — every control change calls this.
    // No navigation here; the user stays on the settings page until they
    // explicitly leave via the bottom nav or the "back" button.
    view.syncNow();
  };

  const exportProfile = (): void => exportProfileBlob(session.profile);

  const resetProfile = (): void => {
    void (async (): Promise<void> => {
      const outcome = await resetProfileStore(store);
      if (outcome !== "reloaded" && !disposed) {
        setSaveBanner("reset-failed");
      }
    })();
  };

  const importProfile = (file: File): void => {
    void (async (): Promise<void> => {
      const outcome = await importProfileFromFile(file, store);
      if (disposed) return;
      if (outcome === "invalid") {
        setSaveBanner("import-invalid");
      } else if (outcome === "failed") {
        setSaveBanner("import-failed");
      }
      // "reloaded" → the function already triggered window.location.reload()
    })();
  };

  /**
   * Dev-only: replace the profile's results with realistic seeded data
   * and reload the page so every dependent view re-reads from the store.
   * The seed module is imported dynamically so production builds — where
   * `seedProfile` is `undefined` and never referenced — tree-shake it
   * out of the bundle entirely.
   */
  const seedProfile: (() => void) | undefined = import.meta.env.DEV
    ? (): void => {
        void (async (): Promise<void> => {
          try {
            const { seedFakeResults } = await import("./dev/seed-profile");
            session.profile.results = seedFakeResults({ count: 60 });
            await store.save(session.profile);
            window.location.reload();
          } catch (err: unknown) {
            // Most-likely failure is the IDB save; the dynamic import
            // would only fail in dev with a broken file. Either way,
            // surface it via the same save-failed banner so the dev
            // sees something instead of an unhandled rejection.
            logFailure("save", err, { source: "dev-seed" });
            if (!disposed) {
              setSaveBanner("save-failed");
            }
          }
        })();
      }
    : undefined;

  const {
    onChar: handleSessionInput,
    onBackspace: handleBackspace,
    onRestart: handleRestart,
  } = createSessionHandlers({
    getSession: () => session,
    view,
    router,
    setRunCrashed,
  });

  createSessionBootstrap({
    storePromise,
    fallbackStore: () => new NoPersistStore(),
    bus: keyBus,
    setLoadBanner,
    adaptiveSource: corpusAdapter.adaptiveSource,
    benchmarkSource: corpusAdapter.benchmarkSource,
    onReady: (deps) => {
      session = deps.session;
      store = deps.store;
      view.attach(() => session.snapshot());
    },
    onResult: () => persist(),
    input: {
      onChar: handleSessionInput,
      onBackspace: () => handleBackspace(),
      onRestart: handleRestart,
      onConfirm: () => goNext(),
      onError: (err) => {
        logFailure("input-callback", err);
      },
    },
    enabled: {
      isEnabled: () => is("practice") && !runCrashed(),
      shouldConfirm: () => is("results"),
    },
  });

  return (
    <Show when={view.snapshot()} fallback={<div class="loading">loading…</div>}>
      {(snap) => (
        <div class="app">
          <Topbar
            snap={snap()}
            showLive={is("practice")}
            onHomeClick={() => router.navigate("practice")}
          />

          <Banners
            loadBanner={loadBanner}
            saveBanner={effectiveSaveBanner}
            runCrashed={runCrashed}
          />

          <Show when={is("practice")}>
            <PracticeStage
              snap={snap()}
              keyboardLayout={keyboardLayout.layout()}
              keymap={keymap.keymap()}
              keySoundPack={keySounds.packName()}
              onKeySoundPackChange={keySounds.setPackName}
              corpusChannel={corpusChannel.channel()}
              onCorpusChannelChange={handleCorpusChannelChange}
              pressedKeys={pressedKeys}
              bindHiddenInput={(el) => (hiddenInputRef = el)}
              onStageTap={() => hiddenInputRef?.focus()}
              onSoftKeyboardChar={handleSessionInput}
              onSoftKeyboardBackspace={handleBackspace}
              showWhitespace={showWhitespace.visible()}
              onCustomText={runCustomText}
            />
          </Show>

          <Show when={is("results")}>
            <ResultsStage
              snap={snap()}
              entry={currentEntry()}
              profile={session.profile}
              onNext={goNext}
              onSettings={() => router.navigate("settings")}
            />
          </Show>

          <Show when={is("stats")}>
            <StatsView
              profile={session.profile}
              onStart={() => router.navigate("practice")}
              {...(seedProfile ? { onSeed: seedProfile } : {})}
            />
          </Show>

          <Show when={is("library")}>
            <Library
              passages={userCorpus.passages()}
              onAdd={userCorpus.add}
              onRemove={userCorpus.remove}
              onBack={() => router.navigate("practice")}
            />
          </Show>

          <InfoPages routeName={router.route().name} onNavigate={(to) => router.navigate(to)} />

          <Show when={is("share")}>
            <ShareView
              payload={router.route().segments[0] ?? ""}
              onHome={() => router.navigate("practice")}
            />
          </Show>

          <Show when={is("articles")}>
            <ArticleView
              articleId={router.route().segments[0] ?? ""}
              onBack={() => router.navigate("about")}
            />
          </Show>

          <Show when={is("settings")}>
            <main class="stage">
              <Settings
                initial={session.profile.settings}
                theme={theme.theme()}
                onThemeChange={theme.setTheme}
                keyboardLayout={keyboardLayout.layout()}
                onKeyboardLayoutChange={keyboardLayout.setLayout}
                keymap={keymap.keymap()}
                onKeymapChange={keymap.setKeymap}
                keySoundPack={keySounds.packName()}
                onKeySoundPackChange={keySounds.setPackName}
                keySoundVolume={keySounds.volume()}
                onKeySoundVolumeChange={keySounds.setVolume}
                showWhitespace={showWhitespace.visible()}
                onShowWhitespaceChange={showWhitespace.setVisible}
                onSave={applySettings}
                onExport={exportProfile}
                onImport={importProfile}
                onReset={resetProfile}
              />
            </main>
          </Show>

          <BottomNav
            activePractice={is("practice")}
            activeStats={is("stats")}
            activeLibrary={is("library")}
            activeSettings={is("settings")}
            onPractice={() => router.navigate("practice")}
            onStats={() => router.navigate("stats")}
            onLibrary={() => router.navigate("library")}
            onSettings={() => router.navigate("settings")}
          />

          <Footer
            activeAbout={is("about")}
            activeCopyright={is("copyright")}
            onAbout={() => router.navigate("about")}
            onCopyright={() => router.navigate("copyright")}
          />
        </div>
      )}
    </Show>
  );
}

/**
 * Dispatcher for the five "info" pages — they all take the same
 * `onNavigate` prop and are mutually exclusive, so collapsing them
 * into one switch shaves the obvious copy-paste from App's render
 * tree without losing the per-route guarantee that exactly one is
 * mounted at a time.
 */
function InfoPages(props: {
  routeName: RouteName;
  onNavigate: (to: RouteName) => void;
}): JSX.Element {
  return (
    <>
      <Show when={props.routeName === "about"}>
        <About onNavigate={props.onNavigate} />
      </Show>
      <Show when={props.routeName === "features"}>
        <Features onNavigate={props.onNavigate} />
      </Show>
      <Show when={props.routeName === "guide"}>
        <UserGuide onNavigate={props.onNavigate} />
      </Show>
      <Show when={props.routeName === "credits"}>
        <Credits onNavigate={props.onNavigate} />
      </Show>
      <Show when={props.routeName === "copyright"}>
        <Copyright onNavigate={props.onNavigate} />
      </Show>
    </>
  );
}

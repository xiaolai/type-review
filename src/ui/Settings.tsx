import type { JSX } from "solid-js";
import { createSignal, Show } from "solid-js";
import { UI_BOUNDS } from "../engine/bounds";
import type { Mode, PassageLength, ProfileSettings, TestMode } from "../engine/session";
import { KEY_SOUND_PACKS } from "../io";
import type { KeyboardLayoutName } from "./components/keyboard-layouts";
import type { KeyMap } from "./components/keymaps";
import { RadioGroup } from "./components/RadioGroup";
import type { Theme } from "./theme";

const WORD_COUNTS = [10, 25, 30, 50] as const;
type WordCount = (typeof WORD_COUNTS)[number];

const MODE_OPTIONS = [
  { value: "adaptive" as Mode, label: "adaptive" },
  { value: "benchmark" as Mode, label: "benchmark" },
];
const WORD_OPTIONS = WORD_COUNTS.map((count) => ({ value: count, label: String(count) }));
const TEST_MODE_OPTIONS = [
  { value: "words" as TestMode, label: "words" },
  { value: "time" as TestMode, label: "time" },
];
const TIME_DURATIONS = [15, 30, 60, 120] as const;
const TIME_OPTIONS = TIME_DURATIONS.map((s) => ({ value: s as number, label: `${s} s` }));
const PASSAGE_LENGTH_OPTIONS = [
  { value: "any" as PassageLength, label: "any" },
  { value: "short" as PassageLength, label: "short" },
  { value: "medium" as PassageLength, label: "medium" },
  { value: "long" as PassageLength, label: "long" },
];
const THEME_OPTIONS = [
  { value: "dark" as Theme, label: "dark" },
  { value: "light" as Theme, label: "light" },
  { value: "sepia" as Theme, label: "sepia" },
  { value: "high-contrast" as Theme, label: "high contrast" },
];
const KEYBOARD_LAYOUT_OPTIONS = [
  { value: "mac" as KeyboardLayoutName, label: "mac" },
  { value: "windows" as KeyboardLayoutName, label: "windows" },
];
const KEYMAP_OPTIONS = [
  { value: "qwerty" as KeyMap, label: "qwerty" },
  { value: "colemak" as KeyMap, label: "colemak" },
  { value: "dvorak" as KeyMap, label: "dvorak" },
];
const SOUND_PACK_OPTIONS = KEY_SOUND_PACKS.map((p) => ({ value: p.name, label: p.label }));

type SettingsTab = "practice" | "appearance" | "sound" | "data";
const TAB_LABELS: ReadonlyArray<{ value: SettingsTab; label: string }> = [
  { value: "practice", label: "practice" },
  { value: "appearance", label: "appearance" },
  { value: "sound", label: "sound" },
  { value: "data", label: "data" },
];

function clamp(value: number, lo: number, hi: number, integer: boolean, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const v = integer ? Math.round(value) : value;
  return Math.min(hi, Math.max(lo, v));
}

export interface SettingsProps {
  initial: ProfileSettings;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  keyboardLayout: KeyboardLayoutName;
  onKeyboardLayoutChange: (layout: KeyboardLayoutName) => void;
  /** Active character keymap — qwerty / colemak / dvorak. Purely visual. */
  keymap: KeyMap;
  onKeymapChange: (next: KeyMap) => void;
  /** Active sound pack name. Applies immediately (not draft) so audio preview works. */
  keySoundPack: string;
  onKeySoundPackChange: (name: string) => void;
  /** Master volume 0..1. Applies immediately. */
  keySoundVolume: number;
  onKeySoundVolumeChange: (value: number) => void;
  /** Whether the typing area renders faint markers for invisible chars. */
  showWhitespace: boolean;
  onShowWhitespaceChange: (next: boolean) => void;
  onSave: (settings: ProfileSettings) => void;
  /** Trigger a download of the persisted profile as JSON. App wires the file write. */
  onExport: () => void;
  /**
   * Import a profile JSON exported earlier. The handler validates and
   * overwrites the current profile, then reloads. Caller asks for
   * confirmation since this is destructive.
   */
  onImport: (file: File) => void;
  /** Wipe the persisted profile after the user confirms. App handles the actual reset. */
  onReset: () => void;
}

/**
 * Settings screen. Three sections per the design system:
 *   1. Practice — adaptive vs benchmark, target WPM, words per run, stop-on-error
 *   2. Appearance — theme, keyboard layout, keymap
 *   3. Sound — sound pack, volume
 *   4. Data — export, reset
 *
 * Every control applies immediately — no save / cancel cycle. Theme,
 * layout, keymap, sound, and volume call their props handlers directly
 * on change. Practice-section controls live in local signals (the UI
 * source of truth) and call `props.onSave` after each edit with the
 * full settings object rebuilt from those signals.
 */
export function Settings(props: SettingsProps): JSX.Element {
  // Local signals are the UI source of truth for the practice section.
  // `props.initial` is captured at mount and won't auto-react to session
  // updates, so we mirror it here and propagate every change up.
  const [mode, setModeSignal] = createSignal<Mode>(props.initial.mode);
  const [targetWpm, setTargetWpmSignal] = createSignal(props.initial.targetWpm);
  const [wordCount, setWordCountSignal] = createSignal<WordCount>(
    props.initial.wordCount as WordCount,
  );
  const [stopOnError, setStopOnErrorSignal] = createSignal(props.initial.stopOnError);
  const [noBackspace, setNoBackspaceSignal] = createSignal(props.initial.noBackspace);
  const [passageLength, setPassageLengthSignal] = createSignal<PassageLength>(
    props.initial.passageLength,
  );
  const [testMode, setTestModeSignal] = createSignal<TestMode>(props.initial.testMode);
  // Stored as number, not TimeDuration: an imported profile may have a
  // duration outside the four preset options (15/30/60/120) but still
  // valid per SETTINGS_BOUNDS (5..600). Coercing to the enum here would
  // silently overwrite the user's real value on the next save.
  const [testDuration, setTestDurationSignal] = createSignal<number>(props.initial.testDurationSec);
  const [includeNumbers, setIncludeNumbersSignal] = createSignal(props.initial.includeNumbers);
  const [includePunctuation, setIncludePunctuationSignal] = createSignal(
    props.initial.includePunctuation,
  );

  /** Build the full ProfileSettings from current signal values and persist. */
  const applyAll = (): void => {
    props.onSave({
      ...props.initial,
      mode: mode(),
      targetWpm: clamp(
        targetWpm(),
        UI_BOUNDS.targetWpm.lo,
        UI_BOUNDS.targetWpm.hi,
        UI_BOUNDS.targetWpm.integer,
        props.initial.targetWpm,
      ),
      wordCount: clamp(
        wordCount(),
        UI_BOUNDS.wordCount.lo,
        UI_BOUNDS.wordCount.hi,
        UI_BOUNDS.wordCount.integer,
        props.initial.wordCount,
      ),
      testMode: testMode(),
      testDurationSec: testDuration(),
      stopOnError: stopOnError(),
      noBackspace: noBackspace(),
      passageLength: passageLength(),
      includeNumbers: includeNumbers(),
      includePunctuation: includePunctuation(),
    });
  };

  // Every setter mirrors the signal and re-applies the full settings.
  const setMode = (next: Mode): void => {
    setModeSignal(next);
    applyAll();
  };
  const setTargetWpm = (next: number): void => {
    setTargetWpmSignal(next);
    applyAll();
  };
  const setWordCount = (next: WordCount): void => {
    setWordCountSignal(next);
    applyAll();
  };
  const setTestMode = (next: TestMode): void => {
    setTestModeSignal(next);
    applyAll();
  };
  const setTestDuration = (next: number): void => {
    setTestDurationSignal(next);
    applyAll();
  };
  const setStopOnError = (next: boolean): void => {
    setStopOnErrorSignal(next);
    applyAll();
  };
  const setNoBackspace = (next: boolean): void => {
    setNoBackspaceSignal(next);
    applyAll();
  };
  const setPassageLength = (next: PassageLength): void => {
    setPassageLengthSignal(next);
    applyAll();
  };
  const setIncludeNumbers = (next: boolean): void => {
    setIncludeNumbersSignal(next);
    applyAll();
  };
  const setIncludePunctuation = (next: boolean): void => {
    setIncludePunctuationSignal(next);
    applyAll();
  };

  // Active tab is session-local — fresh "practice" each time settings opens.
  // Persisting it is overkill; switching is one click.
  const [activeTab, setActiveTab] = createSignal<SettingsTab>("practice");

  const askReset = (): void => {
    const ok =
      typeof window !== "undefined" && typeof window.confirm === "function"
        ? window.confirm(
            "Reset your profile? This deletes all saved sessions and cannot be undone.",
          )
        : true;
    if (ok) {
      props.onReset();
    }
  };

  const onImportChange = (event: Event): void => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    // Reset the value so picking the SAME file twice still fires `change`.
    input.value = "";
    if (!file) return;
    const ok =
      typeof window !== "undefined" && typeof window.confirm === "function"
        ? window.confirm(
            `Import "${file.name}"? This replaces your current profile (settings + all saved sessions) and cannot be undone.`,
          )
        : true;
    if (ok) {
      props.onImport(file);
    }
  };

  return (
    <div class="settings">
      <h2 class="settings__title">settings</h2>

      <div class="settings-card">
        <div class="settings-card__tabs" role="tablist" aria-label="settings sections">
          {TAB_LABELS.map((t) => (
            <button
              type="button"
              class="settings-card__tab"
              classList={{ "settings-card__tab--active": activeTab() === t.value }}
              role="tab"
              aria-selected={activeTab() === t.value}
              onClick={() => setActiveTab(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div class="settings-card__panel">
          <Show when={activeTab() === "practice"}>
            <section aria-label="practice">
              <fieldset class="subsection" aria-labelledby="sub-session">
                <h3 id="sub-session" class="label">
                  session
                </h3>
                <div class="field">
                  <span id="lbl-mode" class="field__label">
                    mode
                  </span>
                  <RadioGroup
                    name="mode"
                    labelledBy="lbl-mode"
                    options={MODE_OPTIONS}
                    value={mode()}
                    onChange={setMode}
                    orientation="row"
                  />
                  <p class="field__hint">
                    adaptive drills your weak keys. benchmark is a plain timed test.
                  </p>
                </div>

                <div class="field">
                  <label class="field__label" for="target-wpm">
                    target speed (wpm)
                  </label>
                  <input
                    id="target-wpm"
                    class="field__input"
                    type="number"
                    min={UI_BOUNDS.targetWpm.lo}
                    max={UI_BOUNDS.targetWpm.hi}
                    value={targetWpm()}
                    // Fires on blur / Enter so we don't snap intermediate digits
                    // through clamp on every keystroke as the user types "120".
                    onChange={(event) => setTargetWpm(event.currentTarget.valueAsNumber)}
                  />
                  <p class="field__hint">the speed a key must reach to count as mastered.</p>
                </div>

                <div class="field">
                  <span id="lbl-test-mode" class="field__label">
                    benchmark stops on
                  </span>
                  <RadioGroup
                    name="testMode"
                    labelledBy="lbl-test-mode"
                    options={TEST_MODE_OPTIONS}
                    value={testMode()}
                    onChange={setTestMode}
                    orientation="row"
                  />
                  <p class="field__hint">
                    words = type a fixed-length passage. time = type freely until the timer runs
                    out.
                  </p>
                </div>

                <Show when={testMode() === "words"}>
                  <div class="field">
                    <span id="lbl-words" class="field__label">
                      words per run
                    </span>
                    <RadioGroup
                      name="words"
                      labelledBy="lbl-words"
                      options={WORD_OPTIONS}
                      value={wordCount()}
                      onChange={setWordCount}
                      orientation="row"
                    />
                  </div>
                </Show>

                <Show when={testMode() === "time"}>
                  <div class="field">
                    <span id="lbl-time" class="field__label">
                      duration
                    </span>
                    <RadioGroup
                      name="time"
                      labelledBy="lbl-time"
                      options={TIME_OPTIONS}
                      value={testDuration()}
                      onChange={setTestDuration}
                      orientation="row"
                    />
                  </div>
                </Show>

                <label class="field__checkbox">
                  <input
                    type="checkbox"
                    checked={stopOnError()}
                    onChange={(event) => setStopOnError(event.currentTarget.checked)}
                  />
                  <span>stop on error (must fix a typo before moving on)</span>
                </label>

                <label class="field__checkbox">
                  <input
                    type="checkbox"
                    checked={noBackspace()}
                    onChange={(event) => setNoBackspace(event.currentTarget.checked)}
                  />
                  <span>confidence mode (backspace disabled — commit each keystroke)</span>
                </label>

                <div class="field">
                  <span id="lbl-passage-length" class="field__label">
                    passage length
                  </span>
                  <RadioGroup
                    name="passageLength"
                    labelledBy="lbl-passage-length"
                    options={PASSAGE_LENGTH_OPTIONS}
                    value={passageLength()}
                    onChange={setPassageLength}
                    orientation="row"
                  />
                  <p class="field__hint">
                    affects quote / library text picks. short ≈ a tweet, long ≈ several paragraphs.
                    any = match word count.
                  </p>
                </div>
              </fieldset>

              <fieldset class="subsection" aria-labelledby="sub-alphabet">
                <h3 id="sub-alphabet" class="label">
                  alphabet
                </h3>
                <div class="field-group">
                  <label class="field__checkbox">
                    <input
                      type="checkbox"
                      checked={includeNumbers()}
                      onChange={(event) => setIncludeNumbers(event.currentTarget.checked)}
                    />
                    <span>include numbers in the adaptive alphabet</span>
                  </label>
                  <label class="field__checkbox">
                    <input
                      type="checkbox"
                      checked={includePunctuation()}
                      onChange={(event) => setIncludePunctuation(event.currentTarget.checked)}
                    />
                    <span>include punctuation in the adaptive alphabet</span>
                  </label>
                </div>
              </fieldset>
            </section>
          </Show>

          <Show when={activeTab() === "appearance"}>
            <section aria-label="appearance">
              <div class="field">
                <span id="lbl-theme" class="field__label">
                  theme
                </span>
                <RadioGroup
                  name="theme"
                  labelledBy="lbl-theme"
                  options={THEME_OPTIONS}
                  value={props.theme}
                  onChange={props.onThemeChange}
                  orientation="row"
                />
              </div>

              <div class="field">
                <span id="lbl-layout" class="field__label">
                  keyboard layout
                </span>
                <RadioGroup
                  name="layout"
                  labelledBy="lbl-layout"
                  options={KEYBOARD_LAYOUT_OPTIONS}
                  value={props.keyboardLayout}
                  onChange={props.onKeyboardLayoutChange}
                  orientation="row"
                />
              </div>

              <div class="field">
                <span id="lbl-keymap" class="field__label">
                  keymap
                </span>
                <RadioGroup
                  name="keymap"
                  labelledBy="lbl-keymap"
                  options={KEYMAP_OPTIONS}
                  value={props.keymap}
                  onChange={props.onKeymapChange}
                  orientation="row"
                />
                <p class="field__hint">match your OS keyboard. visual only.</p>
              </div>

              <div class="field">
                <label class="field__checkbox">
                  <input
                    type="checkbox"
                    checked={props.showWhitespace}
                    onChange={(event) => props.onShowWhitespaceChange(event.currentTarget.checked)}
                  />
                  <span>show whitespace markers (space · tab → newline ↵)</span>
                </label>
              </div>
            </section>
          </Show>

          <Show when={activeTab() === "sound"}>
            <section aria-label="sound">
              <div class="field">
                <span id="lbl-sound-pack" class="field__label">
                  pack
                </span>
                <RadioGroup
                  name="sound-pack"
                  labelledBy="lbl-sound-pack"
                  options={SOUND_PACK_OPTIONS}
                  value={props.keySoundPack}
                  onChange={props.onKeySoundPackChange}
                  orientation="row"
                />
              </div>

              <div class="field">
                <label class="field__label" for="sound-volume">
                  volume
                </label>
                <input
                  id="sound-volume"
                  class="field__range"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={props.keySoundVolume}
                  onInput={(event) =>
                    props.onKeySoundVolumeChange(event.currentTarget.valueAsNumber)
                  }
                />
                <p class="field__hint">{Math.round(props.keySoundVolume * 100)}%</p>
              </div>
            </section>
          </Show>

          <Show when={activeTab() === "data"}>
            <section aria-label="data">
              <p class="field__hint">
                everything is local. export to back up, import to restore on a new browser, reset to
                start fresh.
              </p>
              <div class="actions">
                <button type="button" class="btn" onClick={() => props.onExport()}>
                  export
                </button>
                <label class="btn" for="settings-import-file">
                  import
                </label>
                <input
                  id="settings-import-file"
                  class="sr-only"
                  type="file"
                  accept=".json,application/json"
                  onChange={onImportChange}
                />
                <button type="button" class="btn" onClick={askReset}>
                  reset
                </button>
              </div>
            </section>
          </Show>
        </div>
      </div>
    </div>
  );
}

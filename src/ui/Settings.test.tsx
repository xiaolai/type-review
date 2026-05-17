// @vitest-environment jsdom
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProfileSettings } from "../engine/session";
import type { KeyboardLayoutName } from "./components/keyboard-layouts";
import type { KeyMap } from "./components/keymaps";
import { Settings } from "./Settings";
import type { Theme } from "./theme";

function initial(): ProfileSettings {
  return {
    mode: "adaptive",
    targetWpm: 50,
    wordCount: 30,
    testMode: "words",
    testDurationSec: 30,
    stopOnError: false,
    noBackspace: false,
    passageLength: "any",
    adaptive: { minAlphabetSize: 6, alphabetExpansion: 0 },
    includeNumbers: false,
    includePunctuation: false,
  };
}

describe("Settings", () => {
  let dispose: () => void = () => {};
  afterEach(() => {
    dispose();
    dispose = () => {};
    document.body.innerHTML = "";
  });

  function mount(
    props: {
      initial?: ProfileSettings;
      theme?: Theme;
      onThemeChange?: (t: Theme) => void;
      keyboardLayout?: KeyboardLayoutName;
      onKeyboardLayoutChange?: (l: KeyboardLayoutName) => void;
      keymap?: KeyMap;
      onKeymapChange?: (k: KeyMap) => void;
      keySoundPack?: string;
      onKeySoundPackChange?: (name: string) => void;
      keySoundVolume?: number;
      onKeySoundVolumeChange?: (v: number) => void;
      showWhitespace?: boolean;
      onShowWhitespaceChange?: (next: boolean) => void;
      onSave?: (s: ProfileSettings) => void;
      onExport?: () => void;
      onImport?: (file: File) => void;
      onReset?: () => void;
    } = {},
  ): HTMLElement {
    const host = document.createElement("div");
    document.body.appendChild(host);
    dispose = render(
      () => (
        <Settings
          initial={props.initial ?? initial()}
          theme={props.theme ?? "dark"}
          onThemeChange={props.onThemeChange ?? (() => {})}
          keyboardLayout={props.keyboardLayout ?? "mac"}
          onKeyboardLayoutChange={props.onKeyboardLayoutChange ?? (() => {})}
          keymap={props.keymap ?? "qwerty"}
          onKeymapChange={props.onKeymapChange ?? (() => {})}
          keySoundPack={props.keySoundPack ?? "off"}
          onKeySoundPackChange={props.onKeySoundPackChange ?? (() => {})}
          keySoundVolume={props.keySoundVolume ?? 0.5}
          onKeySoundVolumeChange={props.onKeySoundVolumeChange ?? (() => {})}
          showWhitespace={props.showWhitespace ?? true}
          onShowWhitespaceChange={props.onShowWhitespaceChange ?? (() => {})}
          onSave={props.onSave ?? (() => {})}
          onExport={props.onExport ?? (() => {})}
          onImport={props.onImport ?? (() => {})}
          onReset={props.onReset ?? (() => {})}
        />
      ),
      host,
    );
    return host;
  }

  function clickButton(host: HTMLElement, text: string): void {
    const button = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent?.trim() === text,
    );
    if (!button) {
      throw new Error(`button with text "${text}" not found`);
    }
    button.click();
  }

  /** Pick a radio option in a RadioGroup. Clicks the label, which the
   *  browser propagates to the wrapped <input type=radio>. */
  function pickRadio(host: HTMLElement, optionText: string): void {
    const label = Array.from(host.querySelectorAll<HTMLLabelElement>("label.radio")).find(
      (l) => l.textContent?.trim() === optionText,
    );
    if (!label) {
      throw new Error(`radio option with text "${optionText}" not found`);
    }
    label.click();
  }

  it("renders all setting fields populated from the initial profile", () => {
    const host = mount();
    expect(host.querySelector<HTMLInputElement>("#target-wpm")?.value).toBe("50");
    // Initial mode is "adaptive" — its radio is the checked one.
    const checkedRadio = host.querySelector<HTMLInputElement>(
      "input[type='radio'][name='mode']:checked",
    );
    expect(checkedRadio?.value).toBe("adaptive");
  });

  it("practice changes fire onSave immediately with the updated value", () => {
    const onSave = vi.fn();
    const host = mount({ onSave });
    pickRadio(host, "benchmark");
    expect(onSave).toHaveBeenCalledTimes(1);
    expect((onSave.mock.calls[0]?.[0] as ProfileSettings).mode).toBe("benchmark");

    const wpm = host.querySelector<HTMLInputElement>("#target-wpm");
    wpm!.value = "100";
    // onChange fires on blur / Enter, not on every keystroke.
    wpm!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onSave).toHaveBeenCalledTimes(2);
    expect((onSave.mock.calls[1]?.[0] as ProfileSettings).targetWpm).toBe(100);
  });

  it("clamps targetWpm on change and falls back to the initial value on NaN", () => {
    const onSave = vi.fn();
    const host = mount({ onSave });
    const wpm = host.querySelector<HTMLInputElement>("#target-wpm");
    // Below the UI minimum (10) — clamped to 10.
    wpm!.value = "1";
    wpm!.dispatchEvent(new Event("change", { bubbles: true }));
    expect((onSave.mock.calls[0]?.[0] as ProfileSettings).targetWpm).toBe(10);

    // Above the UI maximum (250) — clamped to 250.
    onSave.mockClear();
    dispose();
    const host2 = mount({ onSave });
    const wpm2 = host2.querySelector<HTMLInputElement>("#target-wpm");
    wpm2!.value = "9999";
    wpm2!.dispatchEvent(new Event("change", { bubbles: true }));
    expect((onSave.mock.calls[0]?.[0] as ProfileSettings).targetWpm).toBe(250);

    // Empty input → NaN → falls back to initial.
    onSave.mockClear();
    dispose();
    const host3 = mount({ onSave, initial: { ...initial(), targetWpm: 77 } });
    const wpm3 = host3.querySelector<HTMLInputElement>("#target-wpm");
    wpm3!.value = "";
    wpm3!.dispatchEvent(new Event("change", { bubbles: true }));
    expect((onSave.mock.calls[0]?.[0] as ProfileSettings).targetWpm).toBe(77);
  });

  it("theme picker fires onThemeChange immediately on click", () => {
    const onThemeChange = vi.fn();
    const host = mount({ onThemeChange, theme: "dark" });
    clickButton(host, "appearance"); // switch to the appearance tab
    pickRadio(host, "light");
    expect(onThemeChange).toHaveBeenCalledWith("light");
  });

  it("keyboard layout picker fires onKeyboardLayoutChange immediately on click", () => {
    const onKeyboardLayoutChange = vi.fn();
    const host = mount({ onKeyboardLayoutChange, keyboardLayout: "mac" });
    clickButton(host, "appearance");
    pickRadio(host, "windows");
    expect(onKeyboardLayoutChange).toHaveBeenCalledWith("windows");
  });

  it("export button fires onExport", () => {
    const onExport = vi.fn();
    const host = mount({ onExport });
    clickButton(host, "data");
    clickButton(host, "export");
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("reset asks for confirmation and fires onReset only when accepted", () => {
    const onReset = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    let host = mount({ onReset });
    clickButton(host, "data");
    clickButton(host, "reset");
    expect(onReset).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    dispose();
    host = mount({ onReset });
    clickButton(host, "data");
    clickButton(host, "reset");
    expect(onReset).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });

  it("tabs render the four sections one at a time, defaulting to practice", () => {
    const host = mount();
    // The visible section is the one whose <section> carries the matching
    // aria-label — no h3 heading is rendered (the tab itself is the label).
    const visibleSectionLabel = (): string =>
      host.querySelector("section")?.getAttribute("aria-label") ?? "";
    expect(visibleSectionLabel()).toBe("practice");
    clickButton(host, "appearance");
    expect(visibleSectionLabel()).toBe("appearance");
    clickButton(host, "sound");
    expect(visibleSectionLabel()).toBe("sound");
    clickButton(host, "data");
    expect(visibleSectionLabel()).toBe("data");
  });

  it("keyboard sound applies immediately (not draft) — picking a pack fires onKeySoundPackChange", () => {
    const onKeySoundPackChange = vi.fn();
    const host = mount({ onKeySoundPackChange, keySoundPack: "off" });
    clickButton(host, "sound");
    pickRadio(host, "mechvibe");
    expect(onKeySoundPackChange).toHaveBeenCalledWith("mechvibe");
  });

  it("volume slider applies immediately — onKeySoundVolumeChange fires with the new value", () => {
    const onKeySoundVolumeChange = vi.fn();
    const host = mount({ onKeySoundVolumeChange, keySoundVolume: 0.5 });
    clickButton(host, "sound");
    const slider = host.querySelector<HTMLInputElement>("#sound-volume");
    expect(slider).not.toBeNull();
    slider!.value = "0.8";
    slider!.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onKeySoundVolumeChange).toHaveBeenCalledWith(0.8);
  });

  it("displays the current volume as a percentage", () => {
    const host = mount({ keySoundVolume: 0.42 });
    clickButton(host, "sound");
    // The hint paragraph below the slider shows '42%'.
    const text = host.textContent ?? "";
    expect(text).toContain("42%");
  });
});

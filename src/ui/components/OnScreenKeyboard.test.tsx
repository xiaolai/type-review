// @vitest-environment jsdom
import type { Accessor } from "solid-js";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import type { LessonKey, LessonPlan } from "../../engine/adaptive";
import type { KeyboardLayoutName } from "./keyboard-layouts";
import { OnScreenKeyboard } from "./OnScreenKeyboard";

function makeKey(letter: string, overrides: Partial<LessonKey> = {}): LessonKey {
  return {
    letter,
    included: true,
    forced: false,
    focused: false,
    confidence: 1.2,
    bestConfidence: 1.2,
    ...overrides,
  };
}

function planFrom(keys: LessonKey[], options: { focus?: string | null } = {}): LessonPlan {
  return {
    included: keys.filter((k) => k.included).map((k) => k.letter),
    focus: options.focus ?? null,
    keys,
    weakBigrams: [],
  };
}

describe("OnScreenKeyboard", () => {
  let dispose: () => void = () => {};
  let setPressed: (next: ReadonlySet<string>) => void = () => {};

  afterEach(() => {
    dispose();
    dispose = () => {};
    setPressed = () => {};
    document.body.innerHTML = "";
  });

  function mount(
    layout: KeyboardLayoutName,
    plan: LessonPlan | null = null,
    initialPressed: ReadonlySet<string> = new Set(),
    keymap: "qwerty" | "colemak" | "dvorak" = "qwerty",
  ): HTMLElement {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const [pressed, setter] = createSignal<ReadonlySet<string>>(initialPressed);
    setPressed = setter as (next: ReadonlySet<string>) => void;
    const pressedAccessor: Accessor<ReadonlySet<string>> = pressed;
    dispose = render(
      () => (
        <OnScreenKeyboard layout={layout} keymap={keymap} plan={plan} pressed={pressedAccessor} />
      ),
      host,
    );
    return host;
  }

  function findById(host: HTMLElement, id: string): HTMLElement | null {
    return (
      Array.from(host.querySelectorAll<HTMLElement>(".kb__key")).find(
        (el) => el.getAttribute("data-key") === id,
      ) ?? null
    );
  }

  describe("layout structure", () => {
    it("renders all 6 rows for both layouts", () => {
      for (const layout of ["mac", "windows"] as const) {
        const host = mount(layout);
        expect(host.querySelectorAll(".kb__row")).toHaveLength(6);
        dispose();
        dispose = () => {};
        document.body.innerHTML = "";
      }
    });

    it("renders the full letter row, digit row, and function row in mac layout", () => {
      const host = mount("mac");
      for (const ch of "qwertyuiopasdfghjklzxcvbnm") {
        expect(findById(host, ch), `letter ${ch} missing`).not.toBeNull();
      }
      for (const d of "1234567890") {
        expect(findById(host, d), `digit ${d} missing`).not.toBeNull();
      }
      for (let i = 1; i <= 12; i++) {
        expect(findById(host, `f${i}`), `F${i} missing`).not.toBeNull();
      }
      expect(findById(host, "esc")).not.toBeNull();
    });

    it("mac layout mirrors control / option / command across space, with no arrow cluster", () => {
      const host = mount("mac");
      expect(findById(host, "fn")?.textContent).toContain("fn");
      // Left-side mods carry glyph + text, aligned to the left edge.
      expect(findById(host, "ctrl")?.textContent).toContain("⌃");
      expect(findById(host, "ctrl")?.textContent).toContain("control");
      expect(findById(host, "opt")?.textContent).toContain("⌥");
      expect(findById(host, "opt")?.textContent).toContain("option");
      expect(findById(host, "cmd")?.textContent).toContain("⌘");
      expect(findById(host, "cmd")?.textContent).toContain("command");
      // Right-side mods mirror them with end-alignment.
      expect(findById(host, "cmd2")?.textContent).toContain("command");
      expect(findById(host, "opt2")?.textContent).toContain("option");
      expect(findById(host, "ctrl2")?.textContent).toContain("control");
      // Arrow cluster removed — minimalist single-row bottom.
      expect(findById(host, "left")).toBeNull();
      expect(findById(host, "right")).toBeNull();
      expect(findById(host, "updown")).toBeNull();
      // Touch ID: rendered as an SVG circle on the right edge of the function row.
      expect(findById(host, "touchid")?.querySelector(".kb__key__icon--touch-id")).not.toBeNull();
      // Edge keys carry glyph only — no spelled-out words.
      expect(findById(host, "backspace")?.textContent).toContain("⌫");
      expect(findById(host, "backspace")?.textContent ?? "").not.toContain("delete");
      expect(findById(host, "tab")?.textContent).toContain("⇥");
      expect(findById(host, "caps")?.textContent).toContain("⇪");
      expect(findById(host, "enter")?.textContent).toContain("⏎");
      expect(findById(host, "enter")?.textContent ?? "").not.toContain("return");
      expect(findById(host, "lshift")?.textContent).toContain("⇧");
      expect(findById(host, "rshift")?.textContent).toContain("⇧");
    });

    it("windows layout uses Ctrl/Alt + ≡ menu + PrtSc + Backspace/Enter words", () => {
      const host = mount("windows");
      expect(findById(host, "ctrl")?.textContent).toContain("Ctrl");
      expect(findById(host, "alt")?.textContent).toContain("Alt");
      expect(findById(host, "menu")?.textContent).toContain("≡");
      // Win + Menu text subs removed — the logo and ≡ glyph carry meaning alone.
      expect(findById(host, "menu")?.textContent ?? "").not.toContain("Menu");
      expect(findById(host, "win")).not.toBeNull();
      expect(findById(host, "prtsc")).not.toBeNull();
      expect(findById(host, "backspace")?.textContent).toContain("Backspace");
      expect(findById(host, "enter")?.textContent).toContain("Enter");
      expect(findById(host, "fn")).toBeNull();
      expect(findById(host, "updown")).toBeNull();
      expect(findById(host, "touchid")).toBeNull();
    });
  });

  describe("keymap (qwerty / colemak)", () => {
    it("renders qwerty letters by default", () => {
      const host = mount("mac");
      // QWERTY: KeyE position shows "e".
      expect(findById(host, "e")?.querySelector(".kb__key__label")?.textContent).toBe("e");
      expect(findById(host, "s")?.querySelector(".kb__key__label")?.textContent).toBe("s");
      expect(findById(host, "n")?.querySelector(".kb__key__label")?.textContent).toBe("n");
    });

    it("remaps the 17 colemak-moved letters at their physical positions", () => {
      // We mount with keymap="colemak" and assert a handful of moved
      // positions render the Colemak letter, not the QWERTY one.
      const host = mount("mac", null, new Set(), "colemak");
      // KeyE physical → "f" in Colemak
      expect(findById(host, "e")?.querySelector(".kb__key__label")?.textContent).toBe("f");
      // KeyS physical → "r"
      expect(findById(host, "s")?.querySelector(".kb__key__label")?.textContent).toBe("r");
      // KeyJ physical → "n"
      expect(findById(host, "j")?.querySelector(".kb__key__label")?.textContent).toBe("n");
      // KeyN physical → "k"
      expect(findById(host, "n")?.querySelector(".kb__key__label")?.textContent).toBe("k");
      // Stationary key: KeyQ unchanged.
      expect(findById(host, "q")?.querySelector(".kb__key__label")?.textContent).toBe("q");
    });

    it("heatmap lookup uses the remapped letter under colemak", () => {
      // Plan has a LessonKey for "f" with high confidence. Under Colemak,
      // the cap at physical KeyE position should pick up that tint.
      const plan = planFrom([makeKey("f", { confidence: 0.5 })]);
      const host = mount("mac", plan, new Set(), "colemak");
      expect(findById(host, "e")?.style.background).toContain("var(--heat-3)");
    });

    it("remaps positions under dvorak, including punctuation and brackets", () => {
      // Dvorak moves ~30 positions including all home-row letters and the
      // surrounding punctuation. Spot-check the iconic ones.
      const host = mount("mac", null, new Set(), "dvorak");
      // top row: q → ', w → ',', e → '.', r → p, t → y
      expect(findById(host, "q")?.querySelector(".kb__key__label")?.textContent).toBe("'");
      expect(findById(host, "w")?.querySelector(".kb__key__label")?.textContent).toBe(",");
      expect(findById(host, "e")?.querySelector(".kb__key__label")?.textContent).toBe(".");
      // home-row vowels on the left: s → o, d → e, f → u, g → i
      expect(findById(host, "s")?.querySelector(".kb__key__label")?.textContent).toBe("o");
      expect(findById(host, "d")?.querySelector(".kb__key__label")?.textContent).toBe("e");
      expect(findById(host, "f")?.querySelector(".kb__key__label")?.textContent).toBe("u");
      expect(findById(host, "g")?.querySelector(".kb__key__label")?.textContent).toBe("i");
      // home-row consonants on the right: j → h, k → t, l → n
      expect(findById(host, "j")?.querySelector(".kb__key__label")?.textContent).toBe("h");
      expect(findById(host, "k")?.querySelector(".kb__key__label")?.textContent).toBe("t");
      expect(findById(host, "l")?.querySelector(".kb__key__label")?.textContent).toBe("n");
      // punctuation rebound: ; → s, ' → -
      expect(findById(host, ";")?.querySelector(".kb__key__label")?.textContent).toBe("s");
      // stationary: a, m
      expect(findById(host, "a")?.querySelector(".kb__key__label")?.textContent).toBe("a");
      expect(findById(host, "m")?.querySelector(".kb__key__label")?.textContent).toBe("m");
    });
  });

  describe("heat tint from LessonPlan", () => {
    it("paints letter keys with an inline heat-tint background when included with a confidence", () => {
      // heatTint buckets: [0,0.2)→heat-1, [0.2,0.4)→heat-2, [0.4,0.6)→heat-3,
      // [0.6,0.8)→heat-4, [0.8,1]→heat-5. Boundary values land in the higher bucket.
      const plan = planFrom([
        makeKey("a", { confidence: 0.1 }),
        makeKey("s", { confidence: 0.3 }),
        makeKey("d", { confidence: 0.5 }),
        makeKey("e", { confidence: 0.7 }),
        makeKey("r", { confidence: 1.5 }),
        makeKey("f", { included: false, confidence: null, bestConfidence: null }),
        makeKey("g", { confidence: null }),
      ]);
      const host = mount("mac", plan);
      expect(findById(host, "a")?.style.background).toContain("var(--heat-1)");
      expect(findById(host, "s")?.style.background).toContain("var(--heat-2)");
      expect(findById(host, "d")?.style.background).toContain("var(--heat-3)");
      expect(findById(host, "e")?.style.background).toContain("var(--heat-4)");
      expect(findById(host, "r")?.style.background).toContain("var(--heat-5)");
      expect(findById(host, "f")?.style.background).toBe("");
      expect(findById(host, "g")?.style.background).toBe("");
      expect(findById(host, "q")?.style.background).toBe("");
    });

    it("applies the focused outline class to the focus letter only", () => {
      const plan = planFrom([makeKey("a"), makeKey("s")], { focus: "a" });
      const host = mount("mac", plan);
      expect(findById(host, "a")?.classList.contains("kb__key--focused")).toBe(true);
      expect(findById(host, "s")?.classList.contains("kb__key--focused")).toBe(false);
    });

    it("applies the slow class for confidence < 0.3", () => {
      const plan = planFrom([makeKey("a", { confidence: 0.1 })]);
      const host = mount("mac", plan);
      expect(findById(host, "a")?.classList.contains("kb__key--slow")).toBe(true);
    });
  });

  describe("pressed-state reads from the prop", () => {
    it("reflects whatever codes are in the pressed accessor", () => {
      const host = mount("mac");
      expect(findById(host, "a")?.classList.contains("kb__key--pressed")).toBe(false);
      setPressed(new Set(["KeyA"]));
      expect(findById(host, "a")?.classList.contains("kb__key--pressed")).toBe(true);
      setPressed(new Set());
      expect(findById(host, "a")?.classList.contains("kb__key--pressed")).toBe(false);
    });

    it("distinguishes left and right shift by event.code via the prop", () => {
      const host = mount("mac");
      setPressed(new Set(["ShiftLeft"]));
      expect(findById(host, "lshift")?.classList.contains("kb__key--pressed")).toBe(true);
      expect(findById(host, "rshift")?.classList.contains("kb__key--pressed")).toBe(false);
      setPressed(new Set(["ShiftRight"]));
      expect(findById(host, "lshift")?.classList.contains("kb__key--pressed")).toBe(false);
      expect(findById(host, "rshift")?.classList.contains("kb__key--pressed")).toBe(true);
    });

    it("does NOT subscribe to window events itself (window keydown alone does not paint)", () => {
      // The component now reads exclusively from the prop. A bare window
      // keydown bypasses the bus and so must NOT mark any cap pressed.
      const host = mount("mac");
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA", key: "a" }));
      expect(findById(host, "a")?.classList.contains("kb__key--pressed")).toBe(false);
    });

    it("suppresses heat-tint background while pressed (pressed class takes over)", () => {
      const plan = planFrom([makeKey("a", { confidence: 0.5 })]);
      const host = mount("mac", plan);
      const aKey = findById(host, "a");
      expect(aKey?.style.background).toContain("var(--heat-3)");
      setPressed(new Set(["KeyA"]));
      // While pressed the inline heat-tint background is dropped, leaving the
      // .kb__key--pressed CSS rule to colour it accent-blue.
      expect(aKey?.style.background).toBe("");
    });
  });
});

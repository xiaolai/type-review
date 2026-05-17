// @vitest-environment jsdom
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { createKeyEventBus, type KeyEventBus } from "../../io";
import { createPressedKeys } from "./use-pressed-keys";

let bus: KeyEventBus | null = null;
let dispose: () => void = () => {};

afterEach(() => {
  dispose();
  dispose = () => {};
  bus?.detach();
  bus = null;
});

function setup(): { bus: KeyEventBus; pressed: () => ReadonlySet<string> } {
  bus = createKeyEventBus();
  let pressedFn: (() => ReadonlySet<string>) | undefined;
  createRoot((d) => {
    dispose = d;
    pressedFn = createPressedKeys(bus as KeyEventBus);
  });
  if (!pressedFn) throw new Error("createPressedKeys failed to return");
  if (!bus) throw new Error("bus not created");
  return { bus, pressed: pressedFn };
}

describe("createPressedKeys", () => {
  it("adds event.code on keydown and removes it on keyup", () => {
    const { pressed } = setup();
    expect(pressed().has("KeyA")).toBe(false);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA" }));
    expect(pressed().has("KeyA")).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "a", code: "KeyA" }));
    expect(pressed().has("KeyA")).toBe(false);
  });

  it("ignores autorepeat keydowns (already pressed → no re-set)", () => {
    const { pressed } = setup();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA" }));
    const firstSnapshot = pressed();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA", repeat: true }));
    // Same reference proves no re-allocation happened — the signal didn't churn.
    expect(pressed()).toBe(firstSnapshot);
  });

  it("clears the set on focus loss (window blur)", () => {
    const { pressed } = setup();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", code: "KeyB" }));
    expect(pressed().size).toBe(2);
    window.dispatchEvent(new Event("blur"));
    expect(pressed().size).toBe(0);
  });

  it("tracks multiple codes simultaneously", () => {
    const { pressed } = setup();
    // Real browsers set `shiftKey: true` on every event fired while
    // Shift is held — the synthesised events must do the same or the
    // pressed-keys modifier-reconcile step (see use-pressed-keys.ts)
    // would correctly read Shift as released between the two keydowns.
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Shift", code: "ShiftLeft", shiftKey: true }),
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA", shiftKey: true }));
    expect(pressed().has("ShiftLeft")).toBe(true);
    expect(pressed().has("KeyA")).toBe(true);
    window.dispatchEvent(
      // shiftKey:false on the release reflects what the browser fires
      // for the modifier's own keyup.
      new KeyboardEvent("keyup", { key: "Shift", code: "ShiftLeft", shiftKey: false }),
    );
    expect(pressed().has("ShiftLeft")).toBe(false);
    expect(pressed().has("KeyA")).toBe(true);
  });

  it("reconciles stuck modifiers when a subsequent event flag disagrees", () => {
    // Simulates the macOS Cmd+Shift+4 case: keydown for Meta is
    // received, but the OS-level screenshot capture eats the keyup.
    // The next non-modifier keystroke arrives with metaKey:false, so
    // the reconcile step removes the stranded modifier code.
    const { pressed } = setup();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Meta", code: "MetaLeft", metaKey: true }),
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Shift",
        code: "ShiftLeft",
        shiftKey: true,
        metaKey: true,
      }),
    );
    expect(pressed().has("MetaLeft")).toBe(true);
    expect(pressed().has("ShiftLeft")).toBe(true);
    // User completes the screenshot, returns, types `a`. No keyup
    // for Meta/Shift was ever received. The next keydown's flags
    // (all false) signal both modifiers are released.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA" }));
    expect(pressed().has("MetaLeft")).toBe(false);
    expect(pressed().has("ShiftLeft")).toBe(false);
    expect(pressed().has("KeyA")).toBe(true);
  });

  it("unsubscribes from the bus on dispose", () => {
    const { pressed } = setup();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA" }));
    expect(pressed().has("KeyA")).toBe(true);
    dispose();
    dispose = () => {};
    // After dispose, further events must not touch the (now-orphaned) signal.
    expect(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", code: "KeyB" }));
    }).not.toThrow();
  });
});

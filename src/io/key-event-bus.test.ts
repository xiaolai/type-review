// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeyEventBus } from "./key-event-bus";
import { createKeyEventBus } from "./key-event-bus";

let bus: KeyEventBus | null = null;

afterEach(() => {
  bus?.detach();
  bus = null;
});

describe("createKeyEventBus", () => {
  it("fans out keydown to every subscriber", () => {
    bus = createKeyEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.onKeyDown(a);
    bus.onKeyDown(b);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "x", code: "KeyX" }));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect((a.mock.calls[0]?.[0] as KeyboardEvent).code).toBe("KeyX");
  });

  it("fans out keyup to every subscriber", () => {
    bus = createKeyEventBus();
    const a = vi.fn();
    bus.onKeyUp(a);
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "x", code: "KeyX" }));
    expect(a).toHaveBeenCalledTimes(1);
  });

  it("returns an unsubscribe that stops further calls without affecting peers", () => {
    bus = createKeyEventBus();
    const a = vi.fn();
    const b = vi.fn();
    const offA = bus.onKeyDown(a);
    bus.onKeyDown(b);
    offA();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "x", code: "KeyX" }));
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("fires onFocusLoss when the window blurs", () => {
    bus = createKeyEventBus();
    const lost = vi.fn();
    bus.onFocusLoss(lost);
    window.dispatchEvent(new Event("blur"));
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it("fires onFocusLoss on visibilitychange ONLY when the document is hidden", () => {
    const fakeDoc = {
      hidden: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    // Capture the visibilitychange handler the bus registers.
    let visibilityHandler: (() => void) | undefined;
    fakeDoc.addEventListener.mockImplementation((type: string, h: () => void) => {
      if (type === "visibilitychange") visibilityHandler = h;
    });
    bus = createKeyEventBus({ doc: fakeDoc });
    const lost = vi.fn();
    bus.onFocusLoss(lost);

    fakeDoc.hidden = false;
    visibilityHandler?.();
    expect(lost).not.toHaveBeenCalled();

    fakeDoc.hidden = true;
    visibilityHandler?.();
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it("ignores synthetic non-KeyboardEvents on the keydown/keyup channels", () => {
    bus = createKeyEventBus();
    const onDown = vi.fn();
    const onUp = vi.fn();
    bus.onKeyDown(onDown);
    bus.onKeyUp(onUp);
    window.dispatchEvent(new Event("keydown"));
    window.dispatchEvent(new Event("keyup"));
    expect(onDown).not.toHaveBeenCalled();
    expect(onUp).not.toHaveBeenCalled();
  });

  it("detach removes window listeners and silences further dispatch", () => {
    bus = createKeyEventBus();
    const onDown = vi.fn();
    bus.onKeyDown(onDown);
    bus.detach();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "x", code: "KeyX" }));
    expect(onDown).not.toHaveBeenCalled();
  });

  it("detach is idempotent", () => {
    bus = createKeyEventBus();
    bus.detach();
    expect(() => bus?.detach()).not.toThrow();
  });

  it("survives a subscriber unsubscribing itself mid-dispatch (snapshot iteration)", () => {
    bus = createKeyEventBus();
    const peer = vi.fn();
    let off: (() => void) | undefined;
    const selfRemoving = vi.fn(() => {
      off?.();
    });
    off = bus.onKeyDown(selfRemoving);
    bus.onKeyDown(peer);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "x", code: "KeyX" }));
    // Both subscribers fired in this dispatch — the snapshot iteration
    // protects peers from a mid-loop unsubscribe.
    expect(selfRemoving).toHaveBeenCalledTimes(1);
    expect(peer).toHaveBeenCalledTimes(1);
    // On the next dispatch, only the peer fires.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "y", code: "KeyY" }));
    expect(selfRemoving).toHaveBeenCalledTimes(1);
    expect(peer).toHaveBeenCalledTimes(2);
  });
});

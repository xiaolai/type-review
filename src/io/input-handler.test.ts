// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InputHandlerCallbacks, InputHandlerHandle } from "./input-handler";
import { attachInputHandler } from "./input-handler";
import { createKeyEventBus, type KeyEventBus } from "./key-event-bus";

let handle: InputHandlerHandle | null = null;
let bus: KeyEventBus | null = null;

afterEach(() => {
  handle?.detach();
  bus?.detach();
  handle = null;
  bus = null;
});

function callbacks(): {
  onChar: ReturnType<typeof vi.fn>;
  onBackspace: ReturnType<typeof vi.fn>;
  onRestart: ReturnType<typeof vi.fn>;
  onConfirm: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
} {
  return {
    onChar: vi.fn(),
    onBackspace: vi.fn(),
    onRestart: vi.fn(),
    onConfirm: vi.fn(),
    onError: vi.fn(),
  };
}

function attach(
  cb: InputHandlerCallbacks,
  options?: Parameters<typeof attachInputHandler>[2],
): InputHandlerHandle {
  bus = createKeyEventBus();
  return attachInputHandler(bus, cb, options);
}

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    cancelable: true,
    ...init,
  });
  window.dispatchEvent(event);
  return event;
}

describe("attachInputHandler", () => {
  it("reports printable characters with a timestamp from the injected clock", () => {
    const cb = callbacks();
    handle = attach(cb, { clock: () => 42 });
    const event = press("a");
    press(" ");
    expect(cb.onChar).toHaveBeenNthCalledWith(1, "a", 42);
    expect(cb.onChar).toHaveBeenNthCalledWith(2, " ", 42);
    expect(event.defaultPrevented).toBe(true);
  });

  it("lets Shift through so capital letters are typed", () => {
    const cb = callbacks();
    handle = attach(cb, { clock: () => 0 });
    press("A", { shiftKey: true });
    expect(cb.onChar).toHaveBeenCalledWith("A", 0);
  });

  it("routes Backspace and Tab to their own callbacks", () => {
    const cb = callbacks();
    handle = attach(cb, { clock: () => 7 });
    press("Backspace");
    press("Tab");
    expect(cb.onBackspace).toHaveBeenCalledWith(7);
    expect(cb.onRestart).toHaveBeenCalledTimes(1);
    expect(cb.onChar).not.toHaveBeenCalled();
  });

  it("ignores modifier shortcuts and named keys", () => {
    const cb = callbacks();
    handle = attach(cb, { clock: () => 0 });
    press("a", { ctrlKey: true });
    press("c", { metaKey: true });
    press("z", { altKey: true });
    press("Shift");
    expect(cb.onChar).not.toHaveBeenCalled();
  });

  it("stops reporting after detach (unsubscribes from the bus)", () => {
    const cb = callbacks();
    handle = attach(cb, { clock: () => 0 });
    handle.detach();
    press("a");
    expect(cb.onChar).not.toHaveBeenCalled();
  });

  it("ignores events while disabled and does not preventDefault them", () => {
    const cb = callbacks();
    let enabled = false;
    handle = attach(cb, { isEnabled: () => enabled });
    const blocked = press("a");
    expect(cb.onChar).not.toHaveBeenCalled();
    expect(blocked.defaultPrevented).toBe(false);
    enabled = true;
    press("b");
    expect(cb.onChar).toHaveBeenCalledTimes(1);
  });

  it("ignores IME composition keystrokes (isComposing or keyCode 229)", () => {
    const cb = callbacks();
    handle = attach(cb);
    // KeyboardEventInit doesn't expose isComposing through the constructor, so
    // dispatch with a synthetic dict via Object.defineProperty on the event.
    const evt = new KeyboardEvent("keydown", { key: "a", cancelable: true });
    Object.defineProperty(evt, "isComposing", { value: true, configurable: true });
    window.dispatchEvent(evt);
    expect(cb.onChar).not.toHaveBeenCalled();
    expect(evt.defaultPrevented).toBe(false);

    // keyCode 229 path
    press("a", { keyCode: 229 });
    expect(cb.onChar).not.toHaveBeenCalled();
  });

  it("ignores autorepeat keystrokes", () => {
    const cb = callbacks();
    handle = attach(cb);
    const evt = press("a", { repeat: true });
    expect(cb.onChar).not.toHaveBeenCalled();
    expect(evt.defaultPrevented).toBe(false);
  });

  it("ignores synthetic events that aren't real KeyboardEvents", () => {
    const cb = callbacks();
    handle = attach(cb);
    window.dispatchEvent(new Event("keydown", { cancelable: true }));
    expect(cb.onChar).not.toHaveBeenCalled();
    expect(cb.onBackspace).not.toHaveBeenCalled();
    expect(cb.onRestart).not.toHaveBeenCalled();
  });

  it("fires onConfirm on Enter when shouldConfirm returns true", () => {
    const cb = callbacks();
    let confirming = false;
    handle = attach(cb, { shouldConfirm: () => confirming });
    const blocked = press("Enter");
    expect(cb.onConfirm).not.toHaveBeenCalled();
    expect(blocked.defaultPrevented).toBe(false);
    confirming = true;
    const fired = press("Enter");
    expect(cb.onConfirm).toHaveBeenCalledTimes(1);
    expect(fired.defaultPrevented).toBe(true);
  });

  it("does not fire any typing callback on Enter even when typing is enabled", () => {
    const cb = callbacks();
    handle = attach(cb, { isEnabled: () => true });
    press("Enter");
    expect(cb.onChar).not.toHaveBeenCalled();
    expect(cb.onBackspace).not.toHaveBeenCalled();
    expect(cb.onRestart).not.toHaveBeenCalled();
    expect(cb.onConfirm).not.toHaveBeenCalled(); // shouldConfirm defaults to false
  });

  it("reports a thrown callback via onError instead of escaping the dispatch", () => {
    const cb = callbacks();
    cb.onChar.mockImplementation(() => {
      throw new Error("kaboom");
    });
    handle = attach(cb);
    expect(() => press("a")).not.toThrow();
    expect(cb.onError).toHaveBeenCalledTimes(1);
    expect((cb.onError.mock.calls[0]?.[0] as Error)?.message).toBe("kaboom");
  });

  it("does not fire after the bus itself is detached", () => {
    const cb = callbacks();
    handle = attach(cb);
    bus?.detach();
    press("a");
    expect(cb.onChar).not.toHaveBeenCalled();
  });
});

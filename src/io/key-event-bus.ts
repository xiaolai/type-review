/**
 * Single window-level dispatch point for keyboard events.
 *
 * Both `attachInputHandler` (the engine input path) and `createPressedKeys`
 * (the on-screen keyboard visualisation) subscribe through this bus. Nothing
 * else in the app touches `window.addEventListener` for keys — adding a new
 * consumer means subscribing here, not racing a second listener.
 *
 * The bus is deliberately dumb: it does not filter, deduplicate, or
 * pre-process events. Each subscriber owns its own filtering rules
 * (modifier-aware typing in `input-handler`, `event.repeat`-aware pressed
 * tracking in `use-pressed-keys`). Centralising filtering would either
 * leak consumer-specific policy into the bus or force every consumer to
 * undo the bus's filters.
 *
 * Focus loss (window blur OR document hidden) gets a single `onFocusLoss`
 * channel because the "stuck-key" problem it solves is the same for any
 * consumer that tracks press state: alt-tab swallows the keyup, the held
 * key shows as still-down forever, the consumer clears its state.
 */

export type KeyEventListener = (event: KeyboardEvent) => void;
export type FocusLossListener = () => void;
export type Unsubscribe = () => void;

export interface KeyEventBus {
  /** Fired on every `keydown`. Order: subscription order. */
  onKeyDown(listener: KeyEventListener): Unsubscribe;
  /** Fired on every `keyup`. */
  onKeyUp(listener: KeyEventListener): Unsubscribe;
  /** Fired when the document becomes hidden or the window loses focus. */
  onFocusLoss(listener: FocusLossListener): Unsubscribe;
  /** Remove every window/document listener and drop all subscribers. Idempotent. */
  detach(): void;
}

export interface KeyEventBusOptions {
  /** Defaults to global `window`. Injectable for tests. */
  target?: EventTarget;
  /** Defaults to global `document`. Injectable for tests. */
  doc?: Pick<Document, "addEventListener" | "removeEventListener" | "hidden">;
}

export function createKeyEventBus(options: KeyEventBusOptions = {}): KeyEventBus {
  const target = options.target ?? window;
  const doc = options.doc ?? document;

  const keyDownListeners = new Set<KeyEventListener>();
  const keyUpListeners = new Set<KeyEventListener>();
  const focusLossListeners = new Set<FocusLossListener>();
  let detached = false;

  const handleKeyDown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent)) return;
    // Iterate a snapshot so listeners that unsubscribe themselves while
    // firing don't skip later subscribers.
    for (const l of [...keyDownListeners]) l(event);
  };
  const handleKeyUp = (event: Event): void => {
    if (!(event instanceof KeyboardEvent)) return;
    for (const l of [...keyUpListeners]) l(event);
  };
  const fireFocusLoss = (): void => {
    for (const l of [...focusLossListeners]) l();
  };
  const handleVisibility = (): void => {
    if (doc.hidden) fireFocusLoss();
  };

  target.addEventListener("keydown", handleKeyDown);
  target.addEventListener("keyup", handleKeyUp);
  target.addEventListener("blur", fireFocusLoss);
  doc.addEventListener("visibilitychange", handleVisibility);

  return {
    onKeyDown(listener) {
      keyDownListeners.add(listener);
      return () => {
        keyDownListeners.delete(listener);
      };
    },
    onKeyUp(listener) {
      keyUpListeners.add(listener);
      return () => {
        keyUpListeners.delete(listener);
      };
    },
    onFocusLoss(listener) {
      focusLossListeners.add(listener);
      return () => {
        focusLossListeners.delete(listener);
      };
    },
    detach() {
      if (detached) return;
      detached = true;
      target.removeEventListener("keydown", handleKeyDown);
      target.removeEventListener("keyup", handleKeyUp);
      target.removeEventListener("blur", fireFocusLoss);
      doc.removeEventListener("visibilitychange", handleVisibility);
      keyDownListeners.clear();
      keyUpListeners.clear();
      focusLossListeners.clear();
    },
  };
}

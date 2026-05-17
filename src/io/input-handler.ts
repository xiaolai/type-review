import type { KeyEventBus } from "./key-event-bus";

export interface InputHandlerCallbacks {
  /** A printable character was typed. */
  onChar(char: string, timeStamp: number): void;
  /** Backspace was pressed. */
  onBackspace(timeStamp: number): void;
  /** A restart was requested (Tab). */
  onRestart(): void;
  /**
   * Enter was pressed in a screen that confirms (e.g. results → next lesson).
   * If omitted, Enter passes through to default behaviour.
   */
  onConfirm?(): void;
  /** A callback threw. Lets the host surface or log it. */
  onError?(error: unknown): void;
}

export interface InputHandlerOptions {
  /**
   * Gates the typing actions (char / backspace / restart). When it returns
   * false the handler ignores those keystrokes entirely — no callback, no
   * preventDefault — so keystrokes meant for buttons or form fields on
   * non-typing screens pass through.
   */
  isEnabled?: () => boolean;
  /** Gates Enter → onConfirm. Same semantics as `isEnabled`. */
  shouldConfirm?: () => boolean;
  /** Timestamp source. Defaults to performance.now, injectable for tests. */
  clock?: () => number;
}

export interface InputHandlerHandle {
  /** Removes the keyboard listener. */
  detach(): void;
}

/**
 * Bridges raw keyboard events to engine-level typing events. This is the
 * only DOM-aware part of the input path; everything downstream is pure.
 *
 * Subscribes to a shared `KeyEventBus` rather than `window.addEventListener`
 * directly, so the on-screen keyboard's pressed-state listener and any
 * future consumer can sit on the same dispatcher without racing a second
 * listener.
 *
 * Filters that protect the engine from junk input:
 *   - modifier shortcuts (Ctrl/Cmd/Alt + key) are skipped — they are
 *     shortcuts, not typing. Shift is allowed so capitals work.
 *   - IME composition events (event.isComposing or event.keyCode === 229) are
 *     skipped. Without this, every keystroke on a CJK or dead-key keyboard
 *     gets committed as the pre-composition raw key while the composed
 *     character is suppressed by preventDefault, silently corrupting the
 *     persisted profile.
 *   - autorepeat (event.repeat) is skipped. A held key would otherwise fire
 *     ~25 keystrokes/second, inflating hitCount and finishing a run with junk
 *     RawWPM in seconds.
 *
 * Callbacks are wrapped: a throw inside a callback is reported via onError
 * (if provided) and never escapes into the browser's event dispatch.
 */
export function attachInputHandler(
  bus: KeyEventBus,
  callbacks: InputHandlerCallbacks,
  options: InputHandlerOptions = {},
): InputHandlerHandle {
  const isEnabled = options.isEnabled ?? (() => true);
  const shouldConfirm = options.shouldConfirm ?? (() => false);
  const clock = options.clock ?? (() => performance.now());

  const safely = (fn: () => void): void => {
    try {
      fn();
    } catch (error: unknown) {
      callbacks.onError?.(error);
    }
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    // IME / dead-key composition: every keydown during composition fires with
    // the pre-composed key; committing it would suppress the actual character.
    if (event.isComposing || event.keyCode === 229) {
      return;
    }
    // Autorepeat from a held key — never intentional typing.
    if (event.repeat) {
      return;
    }

    if (event.key === "Enter") {
      if (callbacks.onConfirm !== undefined && shouldConfirm()) {
        event.preventDefault();
        const confirm = callbacks.onConfirm;
        safely(() => confirm());
      }
      return;
    }

    if (!isEnabled()) {
      return;
    }
    if (event.key === "Backspace") {
      event.preventDefault();
      const ts = clock();
      safely(() => callbacks.onBackspace(ts));
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      safely(() => callbacks.onRestart());
      return;
    }
    // A single-codepoint `key` is a printable character (letter, digit,
    // space, punctuation). Named keys ("Shift", "Enter", ...) are longer.
    if (event.key.length === 1) {
      event.preventDefault();
      const ts = clock();
      safely(() => callbacks.onChar(event.key, ts));
    }
  };

  const unsubscribe = bus.onKeyDown(handleKeyDown);
  return {
    detach: () => unsubscribe(),
  };
}

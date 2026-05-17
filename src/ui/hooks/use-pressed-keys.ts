import type { Accessor } from "solid-js";
import { createSignal, onCleanup, onMount } from "solid-js";
import type { KeyEventBus } from "../../io";

/**
 * Map from a modifier key's `KeyboardEvent.code` to the boolean event
 * flag that tracks whether that modifier is currently held. Used by
 * the modifier-reconcile step to detect a stuck modifier whose keyup
 * never reached the browser (OS-level shortcut hijacked the release).
 */
const MODIFIER_FLAGS: ReadonlyArray<[code: string, flag: keyof KeyboardEvent]> = [
  ["ShiftLeft", "shiftKey"],
  ["ShiftRight", "shiftKey"],
  ["MetaLeft", "metaKey"],
  ["MetaRight", "metaKey"],
  ["AltLeft", "altKey"],
  ["AltRight", "altKey"],
  ["ControlLeft", "ctrlKey"],
  ["ControlRight", "ctrlKey"],
];

/**
 * Reactive set of `KeyboardEvent.code` values currently held down, sourced
 * from a shared `KeyEventBus`. The on-screen keyboard reads this to paint
 * its pressed-state overlay; no other component touches `window` for keys.
 *
 * Filtering rules:
 *  - `event.repeat` is ignored — autorepeat keydowns don't toggle the set.
 *  - On focus loss (window blur or document hidden), the set is cleared.
 *    Without this a key released while the tab was backgrounded would
 *    appear stuck — alt-tab swallows the keyup.
 *  - On every keydown / keyup, the event's modifier flags
 *    (`shiftKey`, `metaKey`, `altKey`, `ctrlKey`) are reconciled
 *    against the pressed set: any modifier code in the set whose
 *    matching flag is `false` gets removed. Catches the macOS
 *    Cmd+Shift+4 screenshot case where the OS intercepts the modifier
 *    keyup so the browser never sees it AND no blur fires (the window
 *    stays focused) — the next keystroke of any kind then clears the
 *    stranded modifier.
 */
export function createPressedKeys(bus: KeyEventBus): Accessor<ReadonlySet<string>> {
  const [pressed, setPressed] = createSignal<ReadonlySet<string>>(new Set());

  /**
   * Return the codes that should be REMOVED from the pressed set
   * because their modifier flag on the event says they aren't held.
   * Empty list ⇒ no stuck modifiers ⇒ caller can take the fast path.
   */
  const stuckModifiers = (event: KeyboardEvent, base: ReadonlySet<string>): string[] => {
    const stuck: string[] = [];
    for (const [code, flag] of MODIFIER_FLAGS) {
      if (base.has(code) && event[flag] !== true) stuck.push(code);
    }
    return stuck;
  };

  onMount(() => {
    const offDown = bus.onKeyDown((event) => {
      if (event.repeat) return;
      setPressed((prev) => {
        const stuck = stuckModifiers(event, prev);
        if (stuck.length === 0 && prev.has(event.code)) return prev;
        const next = new Set(prev);
        for (const code of stuck) next.delete(code);
        next.add(event.code);
        return next;
      });
    });
    const offUp = bus.onKeyUp((event) => {
      setPressed((prev) => {
        const stuck = stuckModifiers(event, prev);
        if (stuck.length === 0 && !prev.has(event.code)) return prev;
        const next = new Set(prev);
        for (const code of stuck) next.delete(code);
        next.delete(event.code);
        return next;
      });
    });
    const offFocus = bus.onFocusLoss(() => {
      setPressed((prev) => (prev.size === 0 ? prev : new Set<string>()));
    });
    onCleanup(() => {
      offDown();
      offUp();
      offFocus();
    });
  });

  return pressed;
}

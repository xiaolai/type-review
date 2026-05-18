import type { KeyEventBus } from "./key-event-bus";
import type { KeySoundPack, SoundCategory } from "./sound-packs";
import { createPack, findPack } from "./sound-packs";

/**
 * How far off-centre to pan a single-hand keystroke. Range is [-1, +1]
 * where 0 is centre, -1 is full left, +1 is full right. 0.3 is "noticeable
 * on headphones, not theatrical on speakers" — the goal is to add spatial
 * texture that maps to where the keys physically are without dominating the
 * sound. Tune here if it feels too subtle or too wide.
 */
const HAND_PAN_AMOUNT = 0.3;

/**
 * QWERTY left-hand columns: every physical key the LEFT hand types,
 * including the centre columns 5 / T / G / B. Plus the column-zero
 * non-character keys to the LEFT of the alphanumeric block (Tab, CapsLock,
 * ShiftLeft) and the top-left fixed keys (Backquote, Escape).
 *
 * Keyed by `KeyboardEvent.code` (the PHYSICAL position), not `event.key`
 * (the produced character). That keeps the mapping correct for Dvorak /
 * Colemak users — the OS translates the physical position to a different
 * character, but the hand that hits it is the same.
 */
const LEFT_CODES: ReadonlySet<string> = new Set([
  "Backquote",
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Tab",
  "KeyQ",
  "KeyW",
  "KeyE",
  "KeyR",
  "KeyT",
  "CapsLock",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyF",
  "KeyG",
  "ShiftLeft",
  "KeyZ",
  "KeyX",
  "KeyC",
  "KeyV",
  "KeyB",
  "Escape",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
]);

/**
 * QWERTY right-hand columns: every physical key the RIGHT hand types,
 * including the centre columns 6 / Y / H / N. Plus the column-end keys to
 * the RIGHT of the alphanumeric block (Backspace, Enter, ShiftRight) and
 * the typical right-hand navigation cluster (arrows, Insert / Delete /
 * Home / End / PageUp / PageDown).
 */
const RIGHT_CODES: ReadonlySet<string> = new Set([
  "Digit6",
  "Digit7",
  "Digit8",
  "Digit9",
  "Digit0",
  "Minus",
  "Equal",
  "Backspace",
  "KeyY",
  "KeyU",
  "KeyI",
  "KeyO",
  "KeyP",
  "BracketLeft",
  "BracketRight",
  "Backslash",
  "KeyH",
  "KeyJ",
  "KeyK",
  "KeyL",
  "Semicolon",
  "Quote",
  "Enter",
  "KeyN",
  "KeyM",
  "Comma",
  "Period",
  "Slash",
  "ShiftRight",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Insert",
  "Delete",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

/**
 * Returns the stereo pan value in [-1, +1] for a physical key code. Left-
 * hand keys pan slightly LEFT, right-hand keys pan slightly RIGHT, and
 * everything else (Space, which is hit by both thumbs; unknown codes;
 * modifier-only presses that never sound anyway) stays CENTRE.
 *
 * Exported so the mapping is unit-testable without an `AudioContext`.
 */
export function panForCode(code: string): number {
  if (LEFT_CODES.has(code)) return -HAND_PAN_AMOUNT;
  if (RIGHT_CODES.has(code)) return HAND_PAN_AMOUNT;
  return 0;
}

/**
 * Maps a `KeyboardEvent.key` to a sound category, or `null` for keys that
 * should not produce sound. Modifier-only keystrokes (Shift / Control / Alt
 * / Meta) are silent because they don't represent typing. `null` is also
 * returned for unknown keys (e.g. dead "Unidentified") to be safe.
 *
 * Backspace shares the `esc` slice on purpose. A real mechanical typewriter
 * has no backspace, so there's no historically-correct sound to borrow; the
 * `esc` slice is the shortest/crispest in every pack, which reads as "small
 * corrective tick" rather than a full keystroke. Routes through the same
 * category in every pack (typewriter, mechvibe, soft) so the choice is
 * consistent regardless of which pack the user has selected.
 *
 * Exported so the routing logic is unit-testable without an `AudioContext`.
 */
export function categorizeKey(key: string): SoundCategory | null {
  switch (key) {
    case "Shift":
    case "Control":
    case "Alt":
    case "Meta":
      return null;
    case "Tab":
      return "tab";
    case "Enter":
      return "enter";
    case "Escape":
    case "Backspace":
      return "esc";
    case " ":
      return "space";
    case "":
    case "Unidentified":
      return null;
    default:
      return "default";
  }
}

export interface KeySoundsOptions {
  /** Initial pack name. Defaults to `"off"` (silent). */
  initialPack?: string;
  /** Initial master volume 0..1. Defaults to 0.5. */
  initialVolume?: number;
  /**
   * Override the `AudioContext` factory. Tests inject a fake; production
   * defaults to `() => new AudioContext()`.
   */
  createAudioContext?: () => AudioContext;
}

export interface KeySoundsPlayer {
  /** Switch active pack by name. `"off"` (or an unknown name) silences. */
  setPack(name: string): void;
  /** Clamp v to 0..1 and set the master gain. */
  setVolume(value: number): void;
  /** Unsubscribe from the bus and (best-effort) close the audio context. */
  detach(): void;
}

const DEFAULT_PACK = "off";
const DEFAULT_VOLUME = 0.5;

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Attach a keystroke sound layer to a `KeyEventBus`. Lazy-initialises the
 * `AudioContext` on the first non-silent keystroke — browsers require a user
 * gesture before audio plays, and a keystroke counts. While the active pack
 * is `"off"` no context is created at all.
 */
export function attachKeySounds(bus: KeyEventBus, options: KeySoundsOptions = {}): KeySoundsPlayer {
  const createCtx = options.createAudioContext ?? ((): AudioContext => new AudioContext());

  let packName = options.initialPack ?? DEFAULT_PACK;
  let volume = clampVolume(options.initialVolume ?? DEFAULT_VOLUME);
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let pack: KeySoundPack | null = null;

  const buildPack = (): void => {
    if (ctx === null || master === null) {
      pack = null;
      return;
    }
    const data = findPack(packName);
    pack = data && data.name !== "off" ? createPack(data, ctx, master) : null;
  };

  /** Idempotent. Creates the audio context on first call. */
  const ensureContext = (): void => {
    if (ctx !== null) return;
    try {
      ctx = createCtx();
    } catch {
      // Audio output unavailable (HTTP-only context, browser policy, etc.).
      ctx = null;
      return;
    }
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    buildPack();
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    // Autorepeat is never intentional typing — the engine input handler
    // also filters this; we duplicate so the sound layer is independent.
    if (event.repeat) return;
    if (packName === "off") return;
    const category = categorizeKey(event.key);
    if (category === null) return;

    // Pan from PHYSICAL key position (event.code), not the produced
    // character (event.key) — keeps the mapping correct for Dvorak /
    // Colemak layouts where the same hand still hits the same physical
    // spot. Falls back to centre for unknown codes (mobile soft keyboards
    // often report empty string here, in which case no pan is applied).
    const pan = panForCode(event.code);

    ensureContext();
    // Some browsers start the context in 'suspended' state until a user
    // gesture; resume is cheap and silently a no-op when already running.
    if (ctx?.state === "suspended") {
      void ctx.resume().catch(() => {
        /* swallow — best-effort, no user-visible signal */
      });
    }
    pack?.play(category, pan);
  };

  const unsubscribe = bus.onKeyDown(handleKeyDown);

  return {
    setPack(name) {
      if (name === packName) return;
      packName = name;
      buildPack();
    },
    setVolume(value) {
      volume = clampVolume(value);
      if (master !== null && ctx !== null) {
        // Schedule the change at currentTime to avoid clicks from instant jumps.
        master.gain.setTargetAtTime(volume, ctx.currentTime, 0.01);
      }
    },
    detach() {
      unsubscribe();
      master?.disconnect();
      master = null;
      pack = null;
      if (ctx !== null) {
        void ctx.close().catch(() => undefined);
        ctx = null;
      }
    },
  };
}

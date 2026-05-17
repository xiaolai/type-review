import type { KeyEventBus } from "./key-event-bus";
import type { KeySoundPack, SoundCategory } from "./sound-packs";
import { createPack, findPack } from "./sound-packs";

/**
 * Maps a `KeyboardEvent.key` to a sound category, or `null` for keys that
 * should not produce sound. Modifier-only keystrokes (Shift / Control / Alt
 * / Meta) are silent because they don't represent typing. `null` is also
 * returned for unknown keys (e.g. dead "Unidentified") to be safe.
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

    ensureContext();
    // Some browsers start the context in 'suspended' state until a user
    // gesture; resume is cheap and silently a no-op when already running.
    if (ctx?.state === "suspended") {
      void ctx.resume().catch(() => {
        /* swallow — best-effort, no user-visible signal */
      });
    }
    pack?.play(category);
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

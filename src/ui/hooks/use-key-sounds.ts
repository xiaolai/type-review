import type { Accessor } from "solid-js";
import { createEffect, createSignal, onCleanup } from "solid-js";
import type { KeyEventBus, KeySoundsOptions } from "../../io";
import { attachKeySounds, findPack } from "../../io";

const PACK_STORAGE_KEY = "type-review:sound-pack";
const VOLUME_STORAGE_KEY = "type-review:sound-volume";

const DEFAULT_PACK = "typewriter";
const DEFAULT_VOLUME = 1.0;

function readStoredPack(): string {
  try {
    if (typeof localStorage === "undefined") return DEFAULT_PACK;
    const raw = localStorage.getItem(PACK_STORAGE_KEY);
    if (raw === null) return DEFAULT_PACK;
    // Only accept names that resolve to a known pack — otherwise silently
    // fall back so an out-of-date stored value can't break the app.
    return findPack(raw) ? raw : DEFAULT_PACK;
  } catch {
    return DEFAULT_PACK;
  }
}

function readStoredVolume(): number {
  try {
    if (typeof localStorage === "undefined") return DEFAULT_VOLUME;
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw === null) return DEFAULT_VOLUME;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_VOLUME;
    return Math.min(1, Math.max(0, parsed));
  } catch {
    return DEFAULT_VOLUME;
  }
}

function write(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    }
  } catch {
    // Best-effort.
  }
}

export interface KeySoundsControl {
  packName: Accessor<string>;
  setPackName: (name: string) => void;
  volume: Accessor<number>;
  setVolume: (v: number) => void;
}

export interface CreateKeySoundsOverrides {
  /** Test seam — forwarded to `attachKeySounds`. */
  createAudioContext?: KeySoundsOptions["createAudioContext"];
}

/**
 * Reactive layer over `attachKeySounds`. Owns the pack-name and volume
 * signals (localStorage-backed) and keeps the player in sync via effects.
 *
 * Returned setters apply IMMEDIATELY — the sound section in Settings is not
 * a draft, unlike theme/keyboard-layout. Auditory feedback is the point of
 * the control; deferring it to Save would make picking by ear impossible.
 */
export function createKeySounds(
  bus: KeyEventBus,
  overrides: CreateKeySoundsOverrides = {},
): KeySoundsControl {
  const [packName, setPackNameSignal] = createSignal<string>(readStoredPack());
  const [volume, setVolumeSignal] = createSignal<number>(readStoredVolume());

  const player = attachKeySounds(bus, {
    initialPack: packName(),
    initialVolume: volume(),
    ...(overrides.createAudioContext ? { createAudioContext: overrides.createAudioContext } : {}),
  });

  createEffect(() => {
    player.setPack(packName());
  });
  createEffect(() => {
    player.setVolume(volume());
  });

  onCleanup(() => player.detach());

  return {
    packName,
    setPackName: (name) => {
      setPackNameSignal(name);
      write(PACK_STORAGE_KEY, name);
    },
    volume,
    setVolume: (v) => {
      const clamped = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
      setVolumeSignal(clamped);
      write(VOLUME_STORAGE_KEY, String(clamped));
    },
  };
}

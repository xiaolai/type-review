/**
 * Keyboard sound packs. Two kinds:
 *
 *   1. `synth` — per-category synth config (noise burst + optional
 *      decaying oscillator), rendered on the fly via Web Audio. Zero
 *      bundle, zero fetch, zero licensing. Used for `mechvibes`, `soft`.
 *
 *   2. `sprite` — single audio file lazy-fetched from `/public/sounds`,
 *      decoded once into an AudioBuffer, played per keystroke as a
 *      random slice. Used for `typewriter` (a real recording of a
 *      mechanical typewriter). All sprite assets are OGG — one format,
 *      one decoder path.
 *
 * Each category gets a slightly different envelope (synth) or slice
 * length (sprite) so Tab / Enter / Esc / Space feel distinct without
 * being jarring.
 */

export type SoundCategory = "default" | "tab" | "enter" | "esc" | "space";

export const SOUND_CATEGORIES: readonly SoundCategory[] = [
  "default",
  "tab",
  "enter",
  "esc",
  "space",
];

interface NoiseConfig {
  /** Burst duration in milliseconds. */
  durationMs: number;
  /** Filter shape. */
  filter: BiquadFilterType;
  /** Centre / cutoff frequency in Hz. */
  freq: number;
  /** Filter Q. Higher = more peaky / ringy. */
  q: number;
  /** Peak gain 0..1 applied at attack apex. */
  peak: number;
}

interface OscConfig {
  /** Waveform. */
  type: OscillatorType;
  /** Frequency in Hz. */
  freq: number;
  /** Decay duration in milliseconds. */
  durationMs: number;
  /** Peak gain 0..1 applied at attack apex. */
  peak: number;
}

export interface SynthConfig {
  /** Filtered noise burst — the "click" / "ring" component. */
  noise?: NoiseConfig;
  /** Optional decaying oscillator — the "body" / "thock" component. */
  osc?: OscConfig;
}

export interface SynthPackData {
  readonly kind: "synth";
  /** Stable id used in localStorage and settings labels. */
  name: string;
  /** Display label. */
  label: string;
  /** Per-category configs. `default` is required; others fall back to it. */
  sounds: Partial<Record<SoundCategory, SynthConfig>> & { default: SynthConfig };
}

export interface SpritePackData {
  readonly kind: "sprite";
  name: string;
  label: string;
  /**
   * Static asset URL (root-relative; Vite serves `public/` at root).
   * Fetched lazily on first use, decoded once, then played per
   * keystroke as a random ~120 ms slice. Format: OGG — the project
   * standard for sample-based packs.
   */
  url: string;
  /**
   * Per-category slice duration in ms. `default` is required; others
   * fall back to it. Longer slices = more "body"; the random offset
   * within the source clip gives natural variation across keystrokes.
   */
  sliceMs: Partial<Record<SoundCategory, number>> & { default: number };
}

export type KeySoundPackData = SynthPackData | SpritePackData;

/* ───────────────────────── pack data ─────────────────────────── */

const MECHVIBE: SynthPackData = {
  kind: "synth",
  name: "mechvibe",
  label: "mechvibe",
  sounds: {
    default: {
      noise: { durationMs: 50, filter: "bandpass", freq: 3000, q: 1.5, peak: 0.4 },
      osc: { type: "sine", freq: 90, durationMs: 60, peak: 0.15 },
    },
    tab: {
      noise: { durationMs: 60, filter: "bandpass", freq: 2400, q: 1.5, peak: 0.45 },
      osc: { type: "sine", freq: 75, durationMs: 70, peak: 0.18 },
    },
    enter: {
      noise: { durationMs: 70, filter: "bandpass", freq: 2200, q: 2, peak: 0.5 },
      osc: { type: "sine", freq: 70, durationMs: 90, peak: 0.22 },
    },
    esc: {
      // Light, bright tick — no body.
      noise: { durationMs: 40, filter: "bandpass", freq: 3500, q: 1.5, peak: 0.35 },
    },
    space: {
      // Wide, low spacebar kachunk.
      noise: { durationMs: 70, filter: "bandpass", freq: 1800, q: 1.0, peak: 0.45 },
      osc: { type: "sine", freq: 60, durationMs: 95, peak: 0.22 },
    },
  },
};

/**
 * Real mechanical-typewriter recording, sliced randomly per keystroke.
 * Source: BigSoundBank "Typewriter #1" — CC0 (public domain).
 * https://bigsoundbank.com/detail-1065-typewriter.html
 * See CREDITS.md.
 */
const TYPEWRITER: SpritePackData = {
  kind: "sprite",
  name: "typewriter",
  label: "typewriter",
  url: "/sounds/typewriter.ogg",
  sliceMs: {
    // A real mechanical-typewriter keystroke is ~50-70 ms of audible
    // attack + decay. The slice length matches that so two keystrokes
    // at ~150 WPM (one every ~80 ms) don't overlap into mud.
    default: 80,
    tab: 95,
    space: 110, // spacebar has a touch more body
    enter: 130, // carriage-return feel
    esc: 65,
  },
};

const SOFT: SynthPackData = {
  kind: "synth",
  name: "soft",
  label: "soft",
  sounds: {
    default: {
      noise: { durationMs: 35, filter: "lowpass", freq: 1200, q: 1, peak: 0.25 },
    },
    tab: {
      noise: { durationMs: 40, filter: "lowpass", freq: 1000, q: 1, peak: 0.28 },
    },
    enter: {
      noise: { durationMs: 50, filter: "lowpass", freq: 800, q: 1, peak: 0.32 },
    },
    esc: {
      noise: { durationMs: 25, filter: "lowpass", freq: 1500, q: 1, peak: 0.22 },
    },
    space: {
      noise: { durationMs: 50, filter: "lowpass", freq: 900, q: 1, peak: 0.32 },
    },
  },
};

const OFF: SynthPackData = {
  kind: "synth",
  name: "off",
  label: "off",
  // Empty noise spec → no audio nodes created → silence.
  sounds: { default: {} },
};

export const KEY_SOUND_PACKS: readonly KeySoundPackData[] = [OFF, MECHVIBE, TYPEWRITER, SOFT];

export function findPack(name: string): KeySoundPackData | null {
  return KEY_SOUND_PACKS.find((p) => p.name === name) ?? null;
}

/* ───────────────────────── synthesis ────────────────────────── */

/**
 * Build a short white-noise buffer. Cheap: ~50 ms × 44.1 kHz = ~2200 floats.
 * We allocate per click — that's fine at typing speed; pool if a profiler
 * ever points here.
 */
function makeNoiseBuffer(ctx: BaseAudioContext, durationMs: number): AudioBuffer {
  const length = Math.max(1, Math.floor((ctx.sampleRate * durationMs) / 1000));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function playNoiseBurst(ctx: AudioContext, dest: AudioNode, cfg: NoiseConfig): void {
  const src = ctx.createBufferSource();
  src.buffer = makeNoiseBuffer(ctx, cfg.durationMs);
  const filter = ctx.createBiquadFilter();
  filter.type = cfg.filter;
  filter.frequency.value = cfg.freq;
  filter.Q.value = cfg.q;
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  const end = now + cfg.durationMs / 1000;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(cfg.peak, now + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  src.connect(filter).connect(gain).connect(dest);
  src.start(now);
  src.stop(end + 0.02);
}

function playOscBurst(ctx: AudioContext, dest: AudioNode, cfg: OscConfig): void {
  const osc = ctx.createOscillator();
  osc.type = cfg.type;
  osc.frequency.value = cfg.freq;
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  const end = now + cfg.durationMs / 1000;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(cfg.peak, now + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(gain).connect(dest);
  osc.start(now);
  osc.stop(end + 0.02);
}

/* ───────────────────────── sprite playback ──────────────────────── */

/**
 * Tunables for the sprite playback path.
 *
 *   PEAK_THRESHOLD     — amplitude above which a sample is considered
 *                        a keystroke onset (range 0..1). 0.3 picks up
 *                        the real attacks in the BigSoundBank clip
 *                        while ignoring ambient noise floor.
 *   PEAK_MIN_GAP_MS    — minimum gap between two detected peaks so we
 *                        don't capture two samples of the same attack.
 *   PRE_ROLL_SEC       — back the slice start off slightly before the
 *                        detected peak so the fade-in lands on the
 *                        rising edge, not in silence before it.
 *   FADE_IN_SEC        — short enough to preserve the attack transient
 *                        (5 ms was eating the click; 1.5 ms is enough
 *                        to suppress the boundary pop, no audible
 *                        envelope softening).
 *   FADE_OUT_SEC       — slightly longer than fade-in; clipped tails
 *                        from a buffer slice ring more than starts.
 */
const PEAK_THRESHOLD = 0.3;
const PEAK_MIN_GAP_MS = 100;
const PRE_ROLL_SEC = 0.002;
const FADE_IN_SEC = 0.0015;
const FADE_OUT_SEC = 0.008;

/**
 * Scan a decoded buffer for keystroke onsets — samples above the
 * amplitude threshold, separated by at least PEAK_MIN_GAP_MS. Returns
 * the time (seconds) at which each detected slice should START
 * (with PRE_ROLL_SEC backed off). Lets the play path pick from a
 * curated list of known-good offsets instead of random positions
 * that mostly land in dead air between keystrokes.
 *
 * Pure / synchronous / runs once per pack load. Linear over the
 * channel data — ~1 ms for a 25 s clip at 48 kHz.
 */
function findPeakOffsets(buffer: AudioBuffer): number[] {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const minGapSamples = Math.max(1, Math.floor((PEAK_MIN_GAP_MS / 1000) * sr));
  const preRollSamples = Math.floor(PRE_ROLL_SEC * sr);
  const offsets: number[] = [];
  let lastPeakIdx = -minGapSamples;
  for (let i = 0; i < data.length; i++) {
    const sample = data[i];
    if (sample === undefined) continue;
    if (Math.abs(sample) >= PEAK_THRESHOLD && i - lastPeakIdx >= minGapSamples) {
      offsets.push(Math.max(0, (i - preRollSamples) / sr));
      lastPeakIdx = i;
    }
  }
  return offsets;
}

/**
 * Play a slice starting at one of the pre-computed peak offsets. The
 * randomness is what makes each keystroke sound a little different —
 * essential for the "real typewriter" texture.
 */
function playSpriteSlice(
  ctx: AudioContext,
  dest: AudioNode,
  buffer: AudioBuffer,
  offsets: readonly number[],
  sliceMs: number,
): void {
  const sliceSec = Math.min(sliceMs / 1000, buffer.duration);
  // Pick from the curated peak list when available. The empty-array
  // fallback should never fire in practice (the BigSoundBank clip has
  // ~30 detectable peaks) but keeps the path safe against a future
  // pack whose source clip is sub-threshold.
  const offset =
    offsets.length > 0
      ? (offsets[Math.floor(Math.random() * offsets.length)] ?? 0)
      : Math.random() * Math.max(0, buffer.duration - sliceSec);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + FADE_IN_SEC);
  gain.gain.setValueAtTime(1, now + Math.max(0, sliceSec - FADE_OUT_SEC));
  gain.gain.linearRampToValueAtTime(0, now + sliceSec);
  src.connect(gain).connect(dest);
  src.start(now, offset, sliceSec);
}

export interface KeySoundPack {
  /** Stable id, matches `KeySoundPackData.name`. */
  name: string;
  /** Display label. */
  label: string;
  /** Play one click for the given category. */
  play(category: SoundCategory): void;
}

/**
 * Instantiate a playable pack on a specific AudioContext. The returned
 * pack closes over the context and destination; switching packs at
 * runtime is "discard the old, create a new one against the same
 * context".
 *
 * For sprite packs, fetch+decode kicks off immediately so the buffer is
 * usually ready before the user's second keystroke even if their first
 * keystroke is what triggered pack creation.
 */
export function createPack(
  data: KeySoundPackData,
  ctx: AudioContext,
  destination: AudioNode,
): KeySoundPack {
  if (data.kind === "synth") {
    return createSynthPack(data, ctx, destination);
  }
  return createSpritePack(data, ctx, destination);
}

function createSynthPack(
  data: SynthPackData,
  ctx: AudioContext,
  destination: AudioNode,
): KeySoundPack {
  return {
    name: data.name,
    label: data.label,
    play(category) {
      const config = data.sounds[category] ?? data.sounds.default;
      if (config.noise) playNoiseBurst(ctx, destination, config.noise);
      if (config.osc) playOscBurst(ctx, destination, config.osc);
    },
  };
}

/**
 * Holds the decoded audio buffer and pre-computed peak offsets for a
 * sprite pack. Populated asynchronously by {@link loadSprite}; both
 * fields are `null` / empty until the load resolves.
 */
interface SpriteState {
  buffer: AudioBuffer | null;
  peakOffsets: readonly number[];
}

/**
 * Fetch + decode the sprite at `url` and write the result (plus
 * pre-computed peak offsets) into `state` when ready. `onReady` fires
 * exactly once after a successful decode — used by the playback layer
 * to flush a single queued pending keystroke. Load errors are
 * swallowed; silence is a fine failure mode for a sound effect.
 */
function loadSprite(url: string, ctx: AudioContext, state: SpriteState, onReady: () => void): void {
  // The <link rel="preload"> in index.html means the bytes are already
  // in the browser cache by the time this fetch runs, so the main cost
  // here is decodeAudioData — typically ~30-50 ms for a 25 s sprite.
  const load = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => ctx.decodeAudioData(bytes))
    .then((buf) => {
      state.buffer = buf;
      // Pre-compute keystroke onsets so playback never lands in the
      // silence between recorded keystrokes — that was the "not crisp"
      // bug: random offsets across the full clip mostly hit dead air.
      state.peakOffsets = findPeakOffsets(buf);
      onReady();
      return buf;
    });
  void load.catch(() => undefined);
}

function createSpritePack(
  data: SpritePackData,
  ctx: AudioContext,
  destination: AudioNode,
): KeySoundPack {
  const state: SpriteState = { buffer: null, peakOffsets: [] };
  // Remembers the most recent keystroke that fired before the buffer
  // finished loading. When the load resolves we flush it so the user's
  // first keystroke after pack-init produces a (slightly late) sound
  // instead of being silently dropped. Holding only ONE pending entry
  // avoids a "stuttering catch-up burst" on fast typing.
  let pendingCategory: SoundCategory | null = null;

  loadSprite(data.url, ctx, state, () => {
    if (pendingCategory === null || state.buffer === null) return;
    const cat = pendingCategory;
    pendingCategory = null;
    const sliceMs = data.sliceMs[cat] ?? data.sliceMs.default;
    playSpriteSlice(ctx, destination, state.buffer, state.peakOffsets, sliceMs);
  });

  return {
    name: data.name,
    label: data.label,
    play(category) {
      if (state.buffer === null) {
        // Buffer still loading — queue the most-recent category so the
        // first audible keystroke arrives as soon as we can produce it.
        pendingCategory = category;
        return;
      }
      const sliceMs = data.sliceMs[category] ?? data.sliceMs.default;
      playSpriteSlice(ctx, destination, state.buffer, state.peakOffsets, sliceMs);
    },
  };
}

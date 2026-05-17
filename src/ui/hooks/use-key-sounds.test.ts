// @vitest-environment jsdom
import { createRoot } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createKeyEventBus, type KeyEventBus } from "../../io";
import { createKeySounds, type KeySoundsControl } from "./use-key-sounds";

function makeFakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
    clear: () => data.clear(),
    key: (i) => Array.from(data.keys())[i] ?? null,
    get length() {
      return data.size;
    },
  };
}

/** Minimal AudioContext mock — enough for `attachKeySounds` to not throw. */
function fakeAudioCtxFactory(): () => AudioContext {
  return (): AudioContext =>
    ({
      state: "running",
      currentTime: 0,
      sampleRate: 44100,
      destination: { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode,
      createGain: () =>
        ({
          gain: {
            value: 0,
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
            setTargetAtTime: vi.fn(),
          },
          connect: vi.fn().mockReturnThis(),
          disconnect: vi.fn(),
        }) as unknown as GainNode,
      createBuffer: () => ({ getChannelData: () => new Float32Array(0) }) as unknown as AudioBuffer,
      createBufferSource: () =>
        ({
          buffer: null,
          connect: vi.fn().mockReturnThis(),
          start: vi.fn(),
          stop: vi.fn(),
        }) as unknown as AudioBufferSourceNode,
      createBiquadFilter: () =>
        ({
          type: "lowpass",
          frequency: { value: 0 },
          Q: { value: 0 },
          connect: vi.fn().mockReturnThis(),
        }) as unknown as BiquadFilterNode,
      createOscillator: () =>
        ({
          type: "sine",
          frequency: { value: 0 },
          connect: vi.fn().mockReturnThis(),
          start: vi.fn(),
          stop: vi.fn(),
        }) as unknown as OscillatorNode,
      resume: () => Promise.resolve(),
      close: () => Promise.resolve(),
    }) as unknown as AudioContext;
}

let storage: Storage;
let bus: KeyEventBus | null = null;
let dispose: () => void = () => {};

beforeEach(() => {
  storage = makeFakeStorage();
  vi.stubGlobal("localStorage", storage);
});

afterEach(() => {
  dispose();
  dispose = () => {};
  bus?.detach();
  bus = null;
  vi.unstubAllGlobals();
});

function setup(): KeySoundsControl {
  bus = createKeyEventBus();
  let control: KeySoundsControl | undefined;
  createRoot((d) => {
    dispose = d;
    control = createKeySounds(bus as KeyEventBus, {
      createAudioContext: fakeAudioCtxFactory(),
    });
  });
  if (!control) throw new Error("createKeySounds returned undefined");
  return control;
}

describe("createKeySounds", () => {
  it("defaults to 'typewriter' and volume 1.0 when nothing is stored", () => {
    const c = setup();
    expect(c.packName()).toBe("typewriter");
    expect(c.volume()).toBe(1.0);
  });

  it("reads a stored pack on construction", () => {
    storage.setItem("type-review:sound-pack", "mechvibe");
    const c = setup();
    expect(c.packName()).toBe("mechvibe");
  });

  it("falls back to the default pack when the stored pack name is unknown", () => {
    storage.setItem("type-review:sound-pack", "doesnt-exist");
    const c = setup();
    expect(c.packName()).toBe("typewriter");
  });

  it("reads a stored volume on construction", () => {
    storage.setItem("type-review:sound-volume", "0.8");
    const c = setup();
    expect(c.volume()).toBe(0.8);
  });

  it("clamps an out-of-range stored volume on read", () => {
    storage.setItem("type-review:sound-volume", "5");
    expect(setup().volume()).toBe(1);
    dispose();
    storage.setItem("type-review:sound-volume", "-1");
    expect(setup().volume()).toBe(0);
  });

  it("setPackName updates the signal and persists", () => {
    const c = setup();
    c.setPackName("typewriter");
    expect(c.packName()).toBe("typewriter");
    expect(storage.getItem("type-review:sound-pack")).toBe("typewriter");
  });

  it("setVolume clamps to 0..1 and persists", () => {
    const c = setup();
    c.setVolume(2);
    expect(c.volume()).toBe(1);
    expect(storage.getItem("type-review:sound-volume")).toBe("1");

    c.setVolume(-3);
    expect(c.volume()).toBe(0);

    c.setVolume(0.42);
    expect(c.volume()).toBe(0.42);
    expect(storage.getItem("type-review:sound-volume")).toBe("0.42");

    c.setVolume(Number.NaN); // → 0
    expect(c.volume()).toBe(0);
  });

  it("survives a throwing localStorage on construction and set", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", {
      ...storage,
      getItem: () => {
        throw new Error("ITP private mode");
      },
      setItem: () => {
        throw new Error("quota");
      },
    });
    const c = setup();
    expect(c.packName()).toBe("typewriter");
    expect(() => c.setPackName("mechvibe")).not.toThrow();
    expect(c.packName()).toBe("mechvibe");
  });
});

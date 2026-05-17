// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createKeyEventBus, type KeyEventBus } from "./key-event-bus";
import { attachKeySounds, categorizeKey, type KeySoundsPlayer } from "./key-sounds";

let bus: KeyEventBus | null = null;
let player: KeySoundsPlayer | null = null;

afterEach(() => {
  player?.detach();
  bus?.detach();
  player = null;
  bus = null;
});

describe("categorizeKey", () => {
  it.each([
    ["Shift", null],
    ["Control", null],
    ["Alt", null],
    ["Meta", null],
    ["", null],
    ["Unidentified", null],
  ])("returns null for modifier or empty keys: %s", (key, expected) => {
    expect(categorizeKey(key)).toBe(expected);
  });

  it.each([
    ["Tab", "tab"],
    ["Enter", "enter"],
    ["Escape", "esc"],
    [" ", "space"],
  ])("routes special key %s to category %s", (key, expected) => {
    expect(categorizeKey(key)).toBe(expected);
  });

  it.each([
    "a",
    "A",
    "z",
    "1",
    ",",
    ".",
    "/",
    "'",
    ";",
    "-",
  ])("routes printable key %s to default", (key) => {
    expect(categorizeKey(key)).toBe("default");
  });
});

/* ───────────── integration with a fake AudioContext ───────────── */

interface FakeAudioContext {
  state: AudioContextState;
  currentTime: number;
  sampleRate: number;
  destination: AudioNode;
  createGain: () => GainNode;
  createBuffer: (channels: number, length: number, sampleRate: number) => AudioBuffer;
  createBufferSource: () => AudioBufferSourceNode;
  createBiquadFilter: () => BiquadFilterNode;
  createOscillator: () => OscillatorNode;
  resume: () => Promise<void>;
  close: () => Promise<void>;
}

function fakeNode(): AudioNode {
  const node = {
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
  } as unknown as AudioNode;
  return node;
}

function fakeAudioParam(): AudioParam {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
  } as unknown as AudioParam;
}

function makeFakeAudioContext(): { ctx: FakeAudioContext; closeCalled: () => boolean } {
  let closed = false;
  const ctx = {
    state: "running" as AudioContextState,
    currentTime: 0,
    sampleRate: 44100,
    destination: fakeNode(),
    createGain: () => {
      const node = fakeNode() as GainNode & { gain: AudioParam };
      node.gain = fakeAudioParam();
      return node;
    },
    createBuffer: (channels: number, length: number, sampleRate: number) => {
      const data = new Float32Array(length);
      return {
        length,
        sampleRate,
        numberOfChannels: channels,
        getChannelData: () => data,
      } as unknown as AudioBuffer;
    },
    createBufferSource: () => {
      const node = fakeNode() as AudioBufferSourceNode;
      Object.assign(node, {
        buffer: null,
        start: vi.fn(),
        stop: vi.fn(),
      });
      return node;
    },
    createBiquadFilter: () => {
      const node = fakeNode() as BiquadFilterNode;
      Object.assign(node, {
        type: "lowpass" as BiquadFilterType,
        frequency: fakeAudioParam(),
        Q: fakeAudioParam(),
      });
      return node;
    },
    createOscillator: () => {
      const node = fakeNode() as OscillatorNode;
      Object.assign(node, {
        type: "sine" as OscillatorType,
        frequency: fakeAudioParam(),
        start: vi.fn(),
        stop: vi.fn(),
      });
      return node;
    },
    resume: () => Promise.resolve(),
    close: () => {
      closed = true;
      return Promise.resolve();
    },
  };
  return { ctx, closeCalled: () => closed };
}

function dispatch(key: string, init: KeyboardEventInit = {}): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, cancelable: true, ...init }));
}

function setup(initialPack = "mechvibe"): { ctxFactory: ReturnType<typeof makeFakeAudioContext> } {
  bus = createKeyEventBus();
  const factory = makeFakeAudioContext();
  player = attachKeySounds(bus, {
    initialPack,
    createAudioContext: () => factory.ctx as unknown as AudioContext,
  });
  return { ctxFactory: factory };
}

describe("attachKeySounds", () => {
  it("does not create an AudioContext while the pack is 'off'", () => {
    bus = createKeyEventBus();
    const factory = makeFakeAudioContext();
    const createCtx = vi.fn(() => factory.ctx as unknown as AudioContext);
    player = attachKeySounds(bus, { initialPack: "off", createAudioContext: createCtx });
    dispatch("a");
    expect(createCtx).not.toHaveBeenCalled();
  });

  it("lazy-creates the AudioContext on first sounding keystroke", () => {
    bus = createKeyEventBus();
    const factory = makeFakeAudioContext();
    const createCtx = vi.fn(() => factory.ctx as unknown as AudioContext);
    player = attachKeySounds(bus, {
      initialPack: "mechvibe",
      createAudioContext: createCtx,
    });
    expect(createCtx).not.toHaveBeenCalled();
    dispatch("a");
    expect(createCtx).toHaveBeenCalledTimes(1);
    // Subsequent keystrokes reuse the same context.
    dispatch("b");
    expect(createCtx).toHaveBeenCalledTimes(1);
  });

  it("skips modifier keys (no audio nodes created)", () => {
    const { ctxFactory } = setup("mechvibe");
    const before = (ctxFactory.ctx.createBufferSource as ReturnType<typeof vi.fn>).mock?.calls
      ?.length;
    const createSourceSpy = vi.spyOn(ctxFactory.ctx, "createBufferSource");
    for (const key of ["Shift", "Control", "Alt", "Meta"]) {
      dispatch(key);
    }
    expect(createSourceSpy).not.toHaveBeenCalled();
    expect(before).toBeUndefined(); // not the point; spy is the assertion
  });

  it("skips autorepeat keystrokes", () => {
    const { ctxFactory } = setup("mechvibe");
    const createSourceSpy = vi.spyOn(ctxFactory.ctx, "createBufferSource");
    dispatch("a", { repeat: true });
    expect(createSourceSpy).not.toHaveBeenCalled();
    dispatch("a"); // non-repeat
    expect(createSourceSpy).toHaveBeenCalled();
  });

  it("produces audio for the four special keys (Tab / Enter / Esc / Space)", () => {
    const { ctxFactory } = setup("mechvibe");
    const createSourceSpy = vi.spyOn(ctxFactory.ctx, "createBufferSource");
    for (const key of ["Tab", "Enter", "Escape", " "]) {
      dispatch(key);
    }
    // mechvibe's tab/enter/space have a noise + osc; esc has noise only.
    expect(createSourceSpy.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it("setPack('off') stops producing sound", () => {
    const { ctxFactory } = setup("mechvibe");
    const createSourceSpy = vi.spyOn(ctxFactory.ctx, "createBufferSource");
    dispatch("a");
    const callCountAfterFirst = createSourceSpy.mock.calls.length;
    expect(callCountAfterFirst).toBeGreaterThan(0);
    player?.setPack("off");
    dispatch("a");
    expect(createSourceSpy.mock.calls.length).toBe(callCountAfterFirst);
  });

  it("setPack(...) on an unknown name silences (treats as no pack)", () => {
    const { ctxFactory } = setup("mechvibe");
    const createSourceSpy = vi.spyOn(ctxFactory.ctx, "createBufferSource");
    dispatch("a");
    const before = createSourceSpy.mock.calls.length;
    player?.setPack("does-not-exist");
    dispatch("a");
    expect(createSourceSpy.mock.calls.length).toBe(before);
  });

  it("detach unsubscribes from the bus and closes the context", () => {
    const { ctxFactory } = setup("mechvibe");
    dispatch("a"); // forces context creation
    const createSourceSpy = vi.spyOn(ctxFactory.ctx, "createBufferSource");
    player?.detach();
    dispatch("b");
    expect(createSourceSpy).not.toHaveBeenCalled();
    expect(ctxFactory.closeCalled()).toBe(true);
  });

  it("setVolume clamps to 0..1 and updates the master gain via setTargetAtTime", () => {
    bus = createKeyEventBus();
    const factory = makeFakeAudioContext();
    // Capture every gain created. The first is the master; later ones are
    // per-burst envelopes.
    const gains: GainNode[] = [];
    const originalCreateGain = factory.ctx.createGain;
    factory.ctx.createGain = () => {
      const g = originalCreateGain();
      gains.push(g);
      return g;
    };
    player = attachKeySounds(bus, {
      initialPack: "mechvibe",
      initialVolume: 0.3,
      createAudioContext: () => factory.ctx as unknown as AudioContext,
    });
    // Trigger context creation.
    dispatch("a");
    expect(gains.length).toBeGreaterThan(0);
    const master = gains[0];
    if (!master) throw new Error("master gain not captured");
    const setTargetSpy = master.gain.setTargetAtTime as ReturnType<typeof vi.fn>;

    player.setVolume(2); // → clamped to 1
    player.setVolume(-0.5); // → clamped to 0
    player.setVolume(0.42);
    player.setVolume(Number.NaN); // → 0, no throw

    const passed = setTargetSpy.mock.calls.map((c) => c[0] as number);
    expect(passed).toEqual([1, 0, 0.42, 0]);
  });
});

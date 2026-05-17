import { describe, expect, it } from "vitest";
import type { CorpusEntry, CorpusSource, CorpusSourceContext } from "../../engine/corpus";
import { makeEntry } from "../../engine/corpus";
import { type ChannelName, createCompositeCorpus } from "./composite";

function fixedSource(entry: CorpusEntry | null): CorpusSource {
  return { pick: () => entry };
}

function ctx(): CorpusSourceContext {
  return { wantedChars: 100, rng: () => 0.5 };
}

describe("createCompositeCorpus", () => {
  it("auto: returns the first non-null channel in priority order", () => {
    const user = makeEntry("u1", "user", "user passage");
    const quote = makeEntry("q1", "quote", "quote passage");
    const composite = createCompositeCorpus({
      channels: [
        { name: "user", source: fixedSource(user) },
        { name: "quote", source: fixedSource(quote) },
        { name: "drills", source: fixedSource(null) },
      ],
      activeChannel: () => "auto",
    });
    expect(composite.pick(ctx())?.id).toBe("u1");
  });

  it("auto: skips empty channels and falls through to the next", () => {
    const quote = makeEntry("q1", "quote", "quote passage");
    const composite = createCompositeCorpus({
      channels: [
        { name: "user", source: fixedSource(null) },
        { name: "quote", source: fixedSource(quote) },
        { name: "drills", source: fixedSource(null) },
      ],
      activeChannel: () => "auto",
    });
    expect(composite.pick(ctx())?.id).toBe("q1");
  });

  it("auto: returns null if every channel does", () => {
    const composite = createCompositeCorpus({
      channels: [
        { name: "user", source: fixedSource(null) },
        { name: "quote", source: fixedSource(null) },
      ],
      activeChannel: () => "auto",
    });
    expect(composite.pick(ctx())).toBeNull();
  });

  it("specific channel: uses only that channel's source", () => {
    const code = makeEntry("c1", "code", "code passage");
    const quote = makeEntry("q1", "quote", "quote passage");
    let active: ChannelName = "quote";
    const composite = createCompositeCorpus({
      channels: [
        { name: "code", source: fixedSource(code) },
        { name: "quote", source: fixedSource(quote) },
      ],
      activeChannel: () => active,
    });
    expect(composite.pick(ctx())?.id).toBe("q1");
    active = "code";
    expect(composite.pick(ctx())?.id).toBe("c1");
  });

  it("specific channel: returns null when the chosen channel has none, no fallback", () => {
    const code = makeEntry("c1", "code", "code passage");
    const composite = createCompositeCorpus({
      channels: [
        { name: "code", source: fixedSource(code) },
        { name: "quote", source: fixedSource(null) },
      ],
      activeChannel: () => "quote",
    });
    expect(composite.pick(ctx())).toBeNull();
  });

  it("re-reads activeChannel on every pick (caller can flip without rebuild)", () => {
    const user = makeEntry("u1", "user", "user passage");
    const quote = makeEntry("q1", "quote", "quote passage");
    let active: ChannelName = "user";
    const composite = createCompositeCorpus({
      channels: [
        { name: "user", source: fixedSource(user) },
        { name: "quote", source: fixedSource(quote) },
      ],
      activeChannel: () => active,
    });
    expect(composite.pick(ctx())?.id).toBe("u1");
    active = "quote";
    expect(composite.pick(ctx())?.id).toBe("q1");
  });
});

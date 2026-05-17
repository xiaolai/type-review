import { describe, expect, it } from "vitest";
import type { ProfileSettings } from "../../engine/session";
import { validateSettings } from "./validators";

function validSettings(): ProfileSettings {
  return {
    mode: "adaptive",
    targetWpm: 50,
    wordCount: 30,
    stopOnError: false,
    adaptive: { minAlphabetSize: 6, alphabetExpansion: 0 },
    includeNumbers: false,
    includePunctuation: false,
    testMode: "words" as const,
    testDurationSec: 30,
    noBackspace: false,
    passageLength: "any",
  };
}

describe("validateSettings", () => {
  it("accepts a fully-valid settings object and returns a fresh copy", () => {
    const input = validSettings();
    const out = validateSettings(input);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
    expect(out?.adaptive).not.toBe(input.adaptive);
  });

  it("rejects unknown top-level or unknown adaptive keys", () => {
    const base = validSettings();
    expect(validateSettings({ ...base, extra: 1 })).toBeNull();
    expect(
      validateSettings({
        ...base,
        adaptive: { ...base.adaptive, sneaky: true },
      }),
    ).toBeNull();
  });

  it("rejects an unrecognised mode", () => {
    expect(validateSettings({ ...validSettings(), mode: "secret" as never })).toBeNull();
  });

  it("rejects out-of-bound numeric settings", () => {
    expect(validateSettings({ ...validSettings(), targetWpm: 0 })).toBeNull();
    expect(validateSettings({ ...validSettings(), targetWpm: 10_000 })).toBeNull();
    expect(validateSettings({ ...validSettings(), wordCount: 1.5 })).toBeNull();
    expect(
      validateSettings({
        ...validSettings(),
        adaptive: { minAlphabetSize: 6, alphabetExpansion: 1.5 },
      }),
    ).toBeNull();
  });

  it("rejects non-object input and primitives", () => {
    expect(validateSettings(null)).toBeNull();
    expect(validateSettings(undefined)).toBeNull();
    expect(validateSettings("settings")).toBeNull();
    expect(validateSettings(42)).toBeNull();
  });

  it("rejects when adaptive is missing or wrong-typed", () => {
    const { adaptive: _adaptive, ...rest } = validSettings();
    expect(validateSettings(rest)).toBeNull();
    expect(validateSettings({ ...rest, adaptive: "wrong" })).toBeNull();
  });
});

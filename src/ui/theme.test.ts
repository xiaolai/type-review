// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTheme } from "./theme";

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  vi.restoreAllMocks();
});

describe("createTheme", () => {
  it("defaults to dark when storage is empty", () => {
    const theme = createTheme();
    expect(theme.theme()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("loads 'light' when storage holds it", () => {
    localStorage.setItem("type-review:theme", "light");
    const theme = createTheme();
    expect(theme.theme()).toBe("light");
  });

  it("falls back to dark for any unrecognised stored value", () => {
    localStorage.setItem("type-review:theme", "rainbow");
    const theme = createTheme();
    expect(theme.theme()).toBe("dark");
  });

  it("setTheme updates the signal, the data attribute, and localStorage", () => {
    const theme = createTheme();
    theme.setTheme("light");
    expect(theme.theme()).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("type-review:theme")).toBe("light");
  });

  it("gracefully tolerates a localStorage write failure (private mode)", () => {
    const theme = createTheme();
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    expect(() => theme.setTheme("light")).not.toThrow();
    expect(theme.theme()).toBe("light");
    expect(debug).toHaveBeenCalled();
  });

  it("gracefully tolerates a localStorage read failure", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("SecurityError");
    });
    const theme = createTheme();
    expect(theme.theme()).toBe("dark");
    expect(debug).toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import type { LoadBanner, SaveBanner } from "./Banners";
import { Banners } from "./Banners";

describe("Banners", () => {
  let dispose: () => void = () => {};
  afterEach(() => {
    dispose();
    dispose = () => {};
    document.body.innerHTML = "";
  });

  function mount(opts: { load?: LoadBanner; save?: SaveBanner; crashed?: boolean }) {
    const [loadBanner] = createSignal<LoadBanner>(opts.load ?? null);
    const [saveBanner] = createSignal<SaveBanner>(opts.save ?? null);
    const [runCrashed] = createSignal(opts.crashed ?? false);
    const host = document.createElement("div");
    document.body.appendChild(host);
    dispose = render(
      () => <Banners loadBanner={loadBanner} saveBanner={saveBanner} runCrashed={runCrashed} />,
      host,
    );
    return host;
  }

  it("renders nothing when every signal is falsy", () => {
    const host = mount({});
    expect(host.textContent?.trim()).toBe("");
  });

  it("shows the corrupt-load banner", () => {
    const host = mount({ load: "corrupt" });
    expect(host.querySelector(".banner--warn")?.textContent).toMatch(/couldn't be read/);
  });

  it("shows the evicted-load banner", () => {
    const host = mount({ load: "evicted" });
    expect(host.querySelector(".banner--warn")?.textContent).toMatch(/wiped|eviction/i);
  });

  it("shows the save-failed banner", () => {
    const host = mount({ save: "save-failed" });
    expect(host.querySelector(".banner--warn")?.textContent).toMatch(/couldn't be saved/);
  });

  it("shows the stale-other-tab banner", () => {
    const host = mount({ save: "stale-other-tab" });
    expect(host.querySelector(".banner--warn")?.textContent).toMatch(/another tab/i);
  });

  it("shows the run-crashed banner with error styling and a Tab kbd hint", () => {
    const host = mount({ crashed: true });
    const banner = host.querySelector(".banner--error");
    expect(banner?.textContent).toMatch(/typing engine/);
    expect(banner?.querySelector("kbd")?.textContent).toBe("Tab");
  });

  it("can show multiple banners at once", () => {
    const host = mount({ load: "corrupt", save: "save-failed", crashed: true });
    expect(host.querySelectorAll(".banner")).toHaveLength(3);
  });
});

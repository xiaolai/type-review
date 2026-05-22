// @vitest-environment jsdom
import { createRoot } from "solid-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RouteName } from "./router";
import { createRouter, parentOf, ROUTE_PARENT, routesReach } from "./router";

describe("createRouter", () => {
  beforeEach(() => {
    window.location.hash = "";
  });
  afterEach(() => {
    window.location.hash = "";
  });

  it("defaults to practice when the hash is empty", () => {
    createRoot((dispose) => {
      const router = createRouter();
      expect(router.route().name).toBe("practice");
      dispose();
    });
  });

  it("parses a known route from the initial hash", () => {
    window.location.hash = "#/settings";
    createRoot((dispose) => {
      const router = createRouter();
      expect(router.route().name).toBe("settings");
      dispose();
    });
  });

  it("parses the DET practice route", () => {
    window.location.hash = "#/det";
    createRoot((dispose) => {
      const router = createRouter();
      expect(router.route().name).toBe("det");
      dispose();
    });
  });

  it("falls back to practice for an unknown route", () => {
    window.location.hash = "#/unknown";
    createRoot((dispose) => {
      const router = createRouter();
      expect(router.route().name).toBe("practice");
      dispose();
    });
  });

  it("parses query params", () => {
    window.location.hash = "#/results?run=42&mode=adaptive";
    createRoot((dispose) => {
      const router = createRouter();
      expect(router.route().query).toEqual({ run: "42", mode: "adaptive" });
      dispose();
    });
  });

  it("navigate updates the hash and re-emits the route", () => {
    createRoot((dispose) => {
      const router = createRouter();
      router.navigate("practice");
      expect(window.location.hash).toBe("#/practice");
      // The signal updates synchronously via the hashchange listener.
      // jsdom does fire hashchange synchronously on hash assignment.
      expect(router.route().name).toBe("practice");
      dispose();
    });
  });

  it("navigate to the same route emits a fresh route state (subscribers re-fire)", () => {
    window.location.hash = "#/practice";
    createRoot((dispose) => {
      const router = createRouter();
      const before = router.route();
      router.navigate("practice");
      const after = router.route();
      // The logical route name is unchanged, but the signal value must be a
      // new object reference. Solid's default `equals` is reference-based —
      // a setter that re-used the previous RouteState object on same-name
      // navigation would silently drop the notification. The original test
      // (reading `.name` twice) would have passed against that broken router.
      // This assertion catches the regression by checking what subscribers
      // actually depend on: the value identity.
      expect(after).not.toBe(before);
      expect(after.name).toBe("practice");
      dispose();
    });
  });

  it("encodes query values when navigating", () => {
    createRoot((dispose) => {
      const router = createRouter();
      router.navigate("results", { query: { run: "a b/c" } });
      expect(window.location.hash).toBe("#/results?run=a%20b%2Fc");
      dispose();
    });
  });

  it("cleans up the hashchange listener on dispose", () => {
    let dispose!: () => void;
    let router!: ReturnType<typeof createRouter>;
    createRoot((d) => {
      dispose = d;
      router = createRouter();
    });
    dispose();
    // After dispose, manual hashchange should not update the (now-detached) signal.
    const before = router.route().name;
    window.location.hash = "#/settings";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(router.route().name).toBe(before);
  });
});

describe("route graph", () => {
  it("every route eventually reaches the practice root", () => {
    // The ROUTE_PARENT Record<RouteName, ...> declaration already
    // forces every RouteName to have an entry — adding a route without
    // a parent is a type error. This test catches the runtime shape:
    // orphans (cycles, parents that don't reach root). Together they
    // guarantee no page can ship orphaned in the navigation graph.
    expect(routesReach("practice")).toBe(true);
  });

  it("parentOf agrees with ROUTE_PARENT for every route", () => {
    for (const name of Object.keys(ROUTE_PARENT) as RouteName[]) {
      expect(parentOf(name)).toBe(ROUTE_PARENT[name]);
    }
  });

  it("only the practice root has a null parent", () => {
    const roots = (Object.keys(ROUTE_PARENT) as RouteName[]).filter(
      (n) => ROUTE_PARENT[n] === null,
    );
    expect(roots).toEqual(["practice"]);
  });
});

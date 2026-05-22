import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [solid()],
  // Bind dev/preview to all interfaces so the server is reachable on the
  // LAN / Tailscale IP for review on other devices. strictPort prevents
  // silent fallback to a different port, which would defeat the purpose.
  // No-cache headers are critical here: without them the browser will
  // serve stale HTML / JS / CSS across dev sessions and our edits won't
  // be visible until a hard refresh. Belt-and-suspenders — Vite tags
  // module responses no-cache already, but the HTML shell and asset
  // requests through stale tabs benefit from the explicit policy.
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    headers: {
      "Cache-Control": "no-store, must-revalidate",
    },
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
    headers: {
      "Cache-Control": "no-store, must-revalidate",
    },
  },
  // Scope the dep scanner to our own entry — without this it crawls the
  // index.html files inside the cloned reference repos under reference-repo/.
  optimizeDeps: {
    entries: ["index.html"],
  },
  // NOTE on Subresource Integrity (SRI): not configured because the production
  // deploy serves HTML and bundled assets from the same origin. SRI's benefit
  // is verifying assets fetched from a different trust boundary than the HTML —
  // add `vite-plugin-sri` (or similar) only if/when assets move to a CDN.
  test: {
    setupFiles: ["src/test/setup.ts"],
    // Only our own sources — never the cloned reference repos under reference-repo/.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Engine tests are pure and run in node. UI/io tests opt into jsdom
    // per-file with `// @vitest-environment jsdom`.
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      // Exclude the prose-only info pages — they're static JSX with no
      // logic; rendering tests would just assert on copy and rot fast.
      // Same for the SVG icon and BackLink wrapper. Anything with real
      // behaviour stays in the coverage picture.
      exclude: [
        "src/**/*.test.*",
        "src/**/index.ts",
        "src/main.tsx",
        "src/ui/styles.css",
        "src/ui/About.tsx",
        "src/ui/Features.tsx",
        "src/ui/UserGuide.tsx",
        "src/ui/Credits.tsx",
        "src/ui/Copyright.tsx",
        // SiteStats is a render of a remote JSON shape from /api/stats —
        // a CF Pages Function that doesn't exist in the unit-test
        // environment. Behaviour-equivalent to About/Features (prose +
        // wiring, no logic) so excluded for the same reason.
        "src/ui/SiteStats.tsx",
        "src/ui/components/Footer.tsx",
        "src/ui/components/BackLink.tsx",
      ],
      // Floor thresholds — tuned to current measured coverage with a
      // small downward buffer so flaky-line-count drift doesn't break
      // the gate. The goal is to fail when coverage REGRESSES, not to
      // chase a number. Raise when the slack files (stats charts,
      // session-bootstrap edge paths, hooks) get tests.
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 75,
        statements: 80,
      },
    },
  },
});

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = join(__dirname);

/** Recursively walks `dir` and yields every `.ts` / `.tsx` file path. */
async function walkSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkSourceFiles(fullPath)));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Returns true if `content` reaches into the given top-level layer through ANY
 * import shape: static `import ... from "..."`, dynamic `import(...)`, or
 * legacy `require(...)`. Catches both barrel imports and deep imports
 * (`../io`, `../../io/foo/bar`). If the project later adds path aliases
 * (`@/io`, etc.), extend the alias arm of the pattern below.
 */
function importsLayer(content: string, layer: "io" | "ui"): boolean {
  const target = `(?:\\/|["'])`;
  const relative = `(?:\\.\\.\\/)+${layer}${target}`;
  const aliased = `@\\/${layer}${target}`; // path aliases (not configured today; tripwire)
  const path = `["'](?:${relative}|${aliased})`;
  const patterns = [
    new RegExp(`from\\s+${path}`),
    new RegExp(`import\\s*\\(\\s*${path}`),
    new RegExp(`require\\s*\\(\\s*${path}`),
  ];
  return patterns.some((p) => p.test(content));
}

/**
 * Layer-purity test: encodes the architectural rule that engine has no DOM /
 * framework dependencies, io has no UI dependencies, and UI is the only DOM
 * tier. The audit (modularization, item "C") flagged that this rule was
 * convention-only; this test makes it CI-enforced.
 */
describe("layer purity", () => {
  it("nothing in src/engine/ imports from io or ui", async () => {
    const engineDir = join(SRC_ROOT, "engine");
    const files = await walkSourceFiles(engineDir);
    const violations: string[] = [];
    for (const file of files) {
      const content = await readFile(file, "utf8");
      if (importsLayer(content, "io") || importsLayer(content, "ui")) {
        violations.push(relative(SRC_ROOT, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it("nothing in src/io/ imports from ui", async () => {
    const ioDir = join(SRC_ROOT, "io");
    const files = await walkSourceFiles(ioDir);
    const violations: string[] = [];
    for (const file of files) {
      const content = await readFile(file, "utf8");
      if (importsLayer(content, "ui")) {
        violations.push(relative(SRC_ROOT, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it("only main.tsx may reach into ui at the src/ root level", async () => {
    // Enumerate every file at depth 1 (src/*.ts, src/*.tsx, but not
    // subdirectories). main.tsx is the documented entry; everything else
    // must NOT import from ./ui/.
    const rootEntries = await readdir(SRC_ROOT, { withFileTypes: true });
    const rootFiles = rootEntries
      .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
      .map((entry) => entry.name);
    const violations: string[] = [];
    for (const name of rootFiles) {
      if (name === "main.tsx") {
        continue;
      }
      const content = await readFile(join(SRC_ROOT, name), "utf8");
      const reachesUi =
        /from\s+["']\.\/ui\b/.test(content) || /import\s*\(\s*["']\.\/ui\b/.test(content);
      if (reachesUi) {
        violations.push(name);
      }
    }
    expect(violations).toEqual([]);

    // Verify main.tsx itself still wires the UI — tripwire for entry-point
    // regressions ("App moved but nobody mounts it").
    const main = await readFile(join(SRC_ROOT, "main.tsx"), "utf8");
    expect(main).toMatch(/from\s+["']\.\/ui\//);
  });
});

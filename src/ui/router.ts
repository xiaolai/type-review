import type { Accessor } from "solid-js";
import { createSignal, onCleanup } from "solid-js";

/**
 * All routes the app understands. Adding a route here is the only place that
 * needs editing for the route system to recognise it — App.tsx then matches
 * on this string.
 */
export type RouteName =
  | "practice"
  | "det"
  | "results"
  | "stats"
  | "settings"
  | "library"
  | "about"
  | "features"
  | "guide"
  | "credits"
  | "copyright"
  | "share"
  | "articles"
  | "site-stats";

const VALID_ROUTES: ReadonlySet<RouteName> = new Set([
  "practice",
  "det",
  "results",
  "stats",
  "settings",
  "library",
  "about",
  "features",
  "guide",
  "credits",
  "copyright",
  "share",
  "articles",
  "site-stats",
]);

/**
 * Back-compat alias table for renamed routes. Visiting a retired
 * route name (e.g. `#/profile`) lands the user on the new equivalent
 * (`#/stats`) instead of falling back to the default. Keeps shared
 * links and bookmarks working after a rename.
 */
const ROUTE_ALIASES: Readonly<Record<string, RouteName>> = {
  profile: "stats",
  // `help` was renamed to `guide` when the inline FAQ grew into a
  // proper user guide page. Existing bookmarks land cleanly.
  help: "guide",
};

/**
 * Parent route for the in-page "back to ..." button on every screen.
 * `practice` is the root and has no parent (rendered as no back button).
 *
 * This is the single source of truth for the route graph: changing a
 * parent here updates both the back-button destination AND the visible
 * "back to <parent>" label, so the two can't drift apart the way they
 * did when the labels were hand-written per page. The `routesReach`
 * helper + its test walk this map to catch orphaned routes at build
 * time — adding a new RouteName without a parent entry fails the type
 * checker (Record<RouteName, ...> is exhaustive).
 */
export const ROUTE_PARENT: Readonly<Record<RouteName, RouteName | null>> = {
  practice: null,
  det: "practice",
  results: "practice",
  stats: "practice",
  library: "practice",
  settings: "practice",
  about: "practice",
  features: "about",
  guide: "about",
  credits: "about",
  copyright: "about",
  articles: "about",
  "site-stats": "about",
  share: "practice",
};

/** Parent route for `name`, or `null` if `name` is the root. */
export function parentOf(name: RouteName): RouteName | null {
  return ROUTE_PARENT[name];
}

/**
 * True iff every route in `ROUTE_PARENT` has a finite chain of
 * `parentOf` calls that lands on a root (parent === null). False
 * indicates an orphan (parent missing) or a cycle. Used by the
 * route-graph unit test to flag orphans before they ship.
 */
export function routesReach(root: RouteName = "practice"): boolean {
  const names = Object.keys(ROUTE_PARENT) as RouteName[];
  for (const start of names) {
    const seen = new Set<RouteName>();
    let cursor: RouteName | null = start;
    while (cursor !== null) {
      if (seen.has(cursor)) return false; // cycle
      seen.add(cursor);
      const next: RouteName | null = ROUTE_PARENT[cursor];
      if (next === null) {
        if (cursor !== root) return false; // landed on a different root
        break;
      }
      cursor = next;
    }
  }
  return true;
}

export interface RouteState {
  name: RouteName;
  /**
   * Path segments after the route name. `#/share/abc/xyz` → `["abc", "xyz"]`.
   * Empty for routes without trailing segments. Used by `/share/<payload>`
   * to encode a result card in the URL.
   */
  segments: readonly string[];
  /** Parsed `?k=v&k2=v2` after the route path. */
  query: Readonly<Record<string, string>>;
}

const DEFAULT_ROUTE: RouteState = Object.freeze({ name: "practice", segments: [], query: {} });

function parseHash(hash: string): RouteState {
  const raw = hash.replace(/^#\/?/, "");
  if (raw === "") {
    return DEFAULT_ROUTE;
  }
  const [path, queryString = ""] = raw.split("?");
  const [head, ...rest] = (path ?? "").split("/");
  const aliased = head && ROUTE_ALIASES[head] ? ROUTE_ALIASES[head] : head;
  const name: RouteName = VALID_ROUTES.has(aliased as RouteName)
    ? (aliased as RouteName)
    : "practice";
  const segments = rest.filter((s) => s !== "");
  const query: Record<string, string> = {};
  for (const part of queryString.split("&")) {
    if (!part) continue;
    const [k, v = ""] = part.split("=");
    if (k !== undefined && k !== "") {
      try {
        query[decodeURIComponent(k)] = decodeURIComponent(v);
      } catch {
        query[k] = v;
      }
    }
  }
  return { name, segments, query };
}

export interface NavigateOptions {
  /** Path segments appended after the route name. `#/articles/<id>`. */
  segments?: readonly string[];
  /** Query string fields after `?`. */
  query?: Record<string, string>;
}

export interface Router {
  route: Accessor<RouteState>;
  /** Navigates to a route. Replays the same route as a fresh navigation. */
  navigate: (name: RouteName, options?: NavigateOptions) => void;
}

/**
 * Hash-based router for the SPA. Hash routing keeps the deploy story simple
 * (no server rewrites required) and matches the React prototype's model.
 *
 * Must be called from a Solid reactive root — registers `hashchange` listener
 * with `onCleanup`.
 */
export function createRouter(): Router {
  const [route, setRoute] = createSignal<RouteState>(
    typeof window !== "undefined" ? parseHash(window.location.hash) : DEFAULT_ROUTE,
  );

  const onHashChange = (): void => {
    setRoute(parseHash(window.location.hash));
  };
  if (typeof window !== "undefined") {
    window.addEventListener("hashchange", onHashChange);
  }
  onCleanup(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("hashchange", onHashChange);
    }
  });

  const navigate = (name: RouteName, options: NavigateOptions = {}): void => {
    const segmentsPath =
      options.segments && options.segments.length > 0
        ? `/${options.segments.map(encodeURIComponent).join("/")}`
        : "";
    const queryString = options.query
      ? Object.entries(options.query)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join("&")
      : "";
    const target = `#/${name}${segmentsPath}${queryString ? `?${queryString}` : ""}`;
    if (typeof window !== "undefined" && window.location.hash !== target) {
      // Drive browser history + back/forward support.
      window.location.hash = target;
    }
    // Update the signal synchronously — don't depend on `hashchange` firing
    // (jsdom queues it, and some browsers debounce). The listener still wires
    // external navigation (browser back/forward, manual address-bar edits).
    setRoute(parseHash(target));
  };

  return { route, navigate };
}

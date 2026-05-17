import type { Session } from "../../engine/session";
import { logFailure } from "../log";
import type { RouteName, Router } from "../router";

export interface SessionHandlersDeps {
  /**
   * Late-bound `Session` accessor. The session is constructed asynchronously
   * by `createSessionBootstrap`, so the handlers cannot capture it directly.
   */
  getSession: () => Session;
  view: { sync: () => void; syncNow: () => void };
  router: Pick<Router, "navigate">;
  setRunCrashed: (v: boolean) => void;
}

export interface SessionHandlers {
  /** A printable character was typed. */
  onChar: (char: string, timeStamp: number) => void;
  /** Backspace was pressed. */
  onBackspace: () => void;
  /** Tab was pressed: start a fresh run. */
  onRestart: () => void;
}

/**
 * The three keystroke handlers App.tsx wires to both the window-level input
 * handler and the mobile soft-keyboard `beforeinput` path. Each guards
 * engine calls with a uniform try/catch that flips the `runCrashed` banner
 * — a single typing-engine throw should pause the run, not the whole app.
 */
export function createSessionHandlers(deps: SessionHandlersDeps): SessionHandlers {
  const RESULTS: RouteName = "results";
  const PRACTICE: RouteName = "practice";

  const guarded = (fn: () => void): void => {
    try {
      fn();
    } catch (err: unknown) {
      logFailure("input", err);
      deps.setRunCrashed(true);
    }
  };

  return {
    onChar: (char, timeStamp) =>
      guarded(() => {
        const feedback = deps.getSession().input(char, timeStamp);
        if (feedback === "completed") {
          deps.view.syncNow();
          deps.router.navigate(RESULTS);
        } else {
          deps.view.sync();
        }
      }),
    onBackspace: () =>
      guarded(() => {
        deps.getSession().backspace();
        deps.view.sync();
      }),
    onRestart: () => {
      deps.getSession().start();
      deps.router.navigate(PRACTICE);
      deps.setRunCrashed(false);
      deps.view.syncNow();
    },
  };
}

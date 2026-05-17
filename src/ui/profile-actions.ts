import type { Profile } from "../engine/session";
import type { ProfileStore } from "../io";
import { deserializeProfile, serializeProfile } from "../io";
import { logFailure } from "./log";

/**
 * Trigger a JSON download of the user's profile. Wraps the Blob + anchor +
 * revoke dance so the screen components stay declarative.
 *
 * Lives in `ui/` because it talks to `document` and the file-download dance
 * is a browser concern, not an `io` persistence concern.
 */
export function exportProfileBlob(profile: Profile): void {
  try {
    const blob = new Blob([JSON.stringify(serializeProfile(profile), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const a = document.createElement("a");
    a.href = url;
    a.download = `type-review-profile-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err: unknown) {
    logFailure("settings", err);
  }
}

export type ResetProfileOutcome = "reloaded" | "unsupported" | "failed";

/**
 * Wipe the profile store, then reload the app so the in-memory `Session` is
 * rebuilt from the now-empty store — the simplest correct way to guarantee
 * no stale state survives. The caller is responsible for asking the user to
 * confirm beforehand.
 *
 * Returns `"unsupported"` when the active store has no `reset` (e.g. the
 * `NoPersistStore` used when persistence init fails), so the caller can
 * surface a banner instead of reloading the user into an unchanged app.
 */
export async function resetProfileStore(store: ProfileStore): Promise<ResetProfileOutcome> {
  if (typeof store.reset !== "function") {
    logFailure("settings", new Error("store does not support reset"));
    return "unsupported";
  }
  try {
    await store.reset();
  } catch (err: unknown) {
    logFailure("settings", err);
    return "failed";
  }
  if (typeof window !== "undefined") {
    window.location.hash = "#/home";
    window.location.reload();
  }
  return "reloaded";
}

export type ImportProfileOutcome = "reloaded" | "invalid" | "failed";

/**
 * Parse profile JSON text, validate it through the same
 * `deserializeProfile` path the IndexedDB store uses at boot, and
 * write the result over the current profile. Returns:
 *
 *  - `"reloaded"` — the JSON was valid and the page is reloading
 *  - `"invalid"` — not parseable, not a profile shape, or version
 *    can't be migrated
 *  - `"failed"` — the store rejected the write (quota, IDB error, …)
 *
 * The caller is responsible for asking the user to confirm — this is
 * a destructive action.
 *
 * File-based wrapper below for the `<input type="file">` flow; this
 * text-based core is what tests exercise (jsdom's File.text() is
 * unreliable, and the underlying logic is the same either way).
 */
export async function importProfileFromText(
  text: string,
  store: ProfileStore,
): Promise<ImportProfileOutcome> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err: unknown) {
    logFailure("settings", err, { context: "import-parse" });
    return "invalid";
  }
  const result = deserializeProfile(raw);
  if (result.status !== "ok") {
    logFailure(
      "settings",
      new Error(`import rejected: ${result.status}`),
      result.status === "corrupt" ? { reason: result.reason } : {},
    );
    return "invalid";
  }
  try {
    await store.save(result.profile);
  } catch (err: unknown) {
    logFailure("settings", err, { context: "import-save" });
    return "failed";
  }
  if (typeof window !== "undefined") {
    window.location.hash = "#/home";
    window.location.reload();
  }
  return "reloaded";
}

/** File-based wrapper used by the Settings UI's `<input type="file">`. */
export async function importProfileFromFile(
  file: File,
  store: ProfileStore,
): Promise<ImportProfileOutcome> {
  let text: string;
  try {
    text = await file.text();
  } catch (err: unknown) {
    logFailure("settings", err, { context: "import-read" });
    return "invalid";
  }
  return importProfileFromText(text, store);
}

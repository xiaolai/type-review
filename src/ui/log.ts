/**
 * Structured failure logger. A thin wrapper around `console.warn` that
 * extracts the error class/name and message into a flat object — so a future
 * operator (or a user reading their devtools) sees the information they need
 * to triage rather than `[object Object]` or a stringified stack.
 *
 * Stays a wrapper, not a telemetry sink: this app sends nothing to a server.
 */
export type FailureStage =
  | "load"
  | "save"
  | "store-init"
  | "input"
  | "input-callback"
  | "settings"
  | "user-corpus";

export function logFailure(
  stage: FailureStage,
  err: unknown,
  context: Record<string, unknown> = {},
): void {
  const detail =
    err instanceof Error
      ? { name: err.name, message: err.message }
      : { name: "unknown", message: String(err) };
  console.warn(`type-review: ${stage} failed`, { ...detail, ...context });
}

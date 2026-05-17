/**
 * Single source of truth for corpus channels.
 *
 * Channel names, picker labels, and id-prefix classifiers were
 * previously spread across composite.ts (the `ChannelName` type),
 * use-corpus-channel.ts (VALID list + MIGRATION map),
 * PracticeStage.tsx (SOURCE_OPTIONS), Stats.tsx (CHANNEL_LABELS), and
 * aggregations.ts (channelOf). Adding or renaming a channel meant
 * touching all five files in lockstep — a real drift risk flagged by
 * the 2026-05-16 audit. This module owns the canonical list; everything
 * else derives from it.
 */

export interface ChannelMeta {
  /** Internal channel id; the union of these is `ChannelName`. */
  readonly name: string;
  /** Label shown to the user (source picker, stats panels). */
  readonly label: string;
  /**
   * Passage-id prefix used to classify a historical `RunResult` back
   * to this channel. `null` for `auto` (a composite strategy, not a
   * real source — no passage is ever tagged "auto:"). The prefix
   * matters because run history is stored per-passageId, so the Stats
   * page reconstructs the source channel from the id at display time.
   */
  readonly idPrefix: string | null;
}

export const CHANNELS = [
  { name: "auto", label: "auto", idPrefix: null },
  { name: "quote", label: "quotes", idPrefix: "q-" },
  { name: "code", label: "codes", idPrefix: "code-" },
  { name: "user", label: "mine", idPrefix: "u-" },
  { name: "difficult", label: "difficult", idPrefix: "difficult:" },
  { name: "drills", label: "drills", idPrefix: "pseudo:" },
] as const satisfies ReadonlyArray<ChannelMeta>;

export type ChannelName = (typeof CHANNELS)[number]["name"];

export const CHANNEL_NAMES: readonly ChannelName[] = CHANNELS.map((c) => c.name);

export const CHANNEL_LABELS: Readonly<Record<ChannelName, string>> = Object.fromEntries(
  CHANNELS.map((c) => [c.name, c.label]),
) as Record<ChannelName, string>;

/**
 * Channel classification of a passage id. Returns `"unknown"` for ids
 * that don't match any registered prefix — generic benchmark-fallback
 * passages (`plain:...`) and legacy / hand-crafted ids land here. The
 * Stats source breakdown buckets them under "other".
 */
export function classifyPassageId(id: string): ChannelName | "unknown" {
  for (const ch of CHANNELS) {
    if (ch.idPrefix !== null && id.startsWith(ch.idPrefix)) return ch.name;
  }
  return "unknown";
}

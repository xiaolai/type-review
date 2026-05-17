import type { CorpusEntry, CorpusSource, CorpusSourceContext } from "../../engine/corpus";
import type { ChannelName } from "./channel-meta";

export type { ChannelName } from "./channel-meta";

export interface CompositeChannel {
  name: ChannelName;
  source: CorpusSource;
}

export interface CompositeCorpusOptions {
  /**
   * Channels in priority order — for "auto" mode the composite tries each
   * channel's `pick` until one returns a non-null entry. Channels later in
   * this list are the fallbacks; channels earlier are preferred.
   *
   * The conventional order for adaptive mode is: user → quote → code →
   * difficult → drills (drills always succeeds, so it must be last —
   * the pseudo-word generator can produce text from any non-empty
   * unlocked alphabet).
   */
  channels: readonly CompositeChannel[];
  /**
   * Reactive accessor for the currently-selected channel — `"auto"` for the
   * smart-fallback strategy, or a specific channel name for explicit choice.
   * The composite re-reads on every `pick` call; the caller can change the
   * channel between calls without rebuilding.
   */
  activeChannel: () => ChannelName;
}

/**
 * Multi-source corpus selector. Dispatch strategy:
 *
 *  - `auto` (recommended default): try each channel in priority order;
 *    return the first non-null entry. In adaptive mode this means user →
 *    quote → code → difficult → drills as letters unlock; in benchmark
 *    mode it's the same, but with no alphabet filter the earlier
 *    channels usually have a candidate.
 *
 *  - A specific channel name (`"user"`, `"quote"`, `"code"`, …): use
 *    only that channel. If it can't fulfil the request, the composite
 *    returns null and the caller falls back to whatever default it
 *    likes (the Session layer falls back to drills pseudo-generation).
 */
export function createCompositeCorpus(opts: CompositeCorpusOptions): CorpusSource {
  const byName = new Map<ChannelName, CorpusSource>();
  for (const ch of opts.channels) {
    byName.set(ch.name, ch.source);
  }

  return {
    pick(ctx: CorpusSourceContext): CorpusEntry | null {
      const active = opts.activeChannel();
      if (active === "auto") {
        for (const ch of opts.channels) {
          const hit = ch.source.pick(ctx);
          if (hit !== null) return hit;
        }
        return null;
      }
      const single = byName.get(active);
      if (!single) return null;
      // Explicit channel pick: drop the alphabet filter so the source
      // can serve its content regardless of which letters the adaptive
      // engine has unlocked. Otherwise an early-stage user who picks
      // "code" or "quote" silently falls back to drills (pseudo-words)
      // because every code passage uses letters outside their drilled
      // alphabet. Honouring the explicit request takes priority over
      // the curriculum's letter restriction.
      const { filter: _filter, ...unfiltered } = ctx;
      return single.pick(unfiltered);
    },
  };
}

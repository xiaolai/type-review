import type { Accessor } from "solid-js";
import { createSignal } from "solid-js";
import type { ChannelName } from "../../io";
import { CHANNEL_NAMES } from "../../io";

const STORAGE_KEY = "type-review:corpus-channel";
const VALID = new Set<string>(CHANNEL_NAMES);
const DEFAULT_CHANNEL: ChannelName = "quote";

/**
 * Migration map from retired channel names (2026-05-16 corpus
 * restructure) to their current equivalents. Without this, returning
 * users with a stored "article" / "pseudo" / "common-words" silently
 * fall back to the default channel, losing their preference.
 */
const MIGRATION: Record<string, ChannelName> = {
  article: "quote",
  pseudo: "drills",
  "common-words": "difficult",
};

function readStored(): ChannelName {
  try {
    if (typeof localStorage === "undefined") return DEFAULT_CHANNEL;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_CHANNEL;
    if (VALID.has(raw)) return raw as ChannelName;
    const migrated = MIGRATION[raw];
    if (migrated !== undefined) {
      try {
        localStorage.setItem(STORAGE_KEY, migrated);
      } catch {
        /* best effort */
      }
      return migrated;
    }
    return DEFAULT_CHANNEL;
  } catch {
    return DEFAULT_CHANNEL;
  }
}

function write(value: ChannelName): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, value);
    }
  } catch {
    /* best effort */
  }
}

export interface CorpusChannelControl {
  channel: Accessor<ChannelName>;
  setChannel: (next: ChannelName) => void;
}

/**
 * Persisted corpus-channel selection. Mirrors the `auto / user / quote /
 * code / difficult / drills` semantics of the composite source. Used by
 * both the inline picker on the practice page and the Settings page.
 */
export function createCorpusChannel(): CorpusChannelControl {
  const [channel, setSignal] = createSignal<ChannelName>(readStored());
  return {
    channel,
    setChannel: (next) => {
      setSignal(next);
      write(next);
    },
  };
}

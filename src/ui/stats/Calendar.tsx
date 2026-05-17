import type { JSX } from "solid-js";
import { For } from "solid-js";
import type { StreakStat } from "./aggregations";
import { dayKey, dayKeyBack } from "./aggregations";

/**
 * Last 60 local days, oldest → newest, displayed as a Github-style
 * grid. The grid is rotated relative to Github's: rows are days of
 * week, columns are weeks, but since the user asked for "60-day
 * grid" we render a simple linear 10×6 block — easier to scan at a
 * glance and consistent regardless of which weekday today is.
 *
 * Streak is shown above the grid because behavioral consistency is
 * the headline number; the grid is the supporting evidence.
 */

const DAYS = 60;
const COLS = 10;

export interface CalendarProps {
  /** Map of local-day key (YYYY-MM-DD) → sessions on that day. */
  dailyCounts: ReadonlyMap<string, number>;
  streak: StreakStat;
  /** Anchor "today" — exposed for tests; defaults to Date.now(). */
  now?: number;
}

export function Calendar(props: CalendarProps): JSX.Element {
  const anchor = props.now ?? Date.now();
  const today = dayKey(anchor);

  /** Days oldest → newest. Newest day (column-rightmost row-bottom) is "today". */
  const days = Array.from({ length: DAYS }, (_, i) => dayKeyBack(anchor, DAYS - 1 - i));

  // Compute count range to scale opacity. Scope to the rendered window
  // only — an older high-count day outside the 60-day grid would
  // otherwise flatten every visible cell's intensity against an
  // invisible reference.
  let maxCount = 0;
  for (const key of days) {
    const count = props.dailyCounts.get(key) ?? 0;
    if (count > maxCount) maxCount = count;
  }

  return (
    <div class="calendar">
      <div class="calendar__streaks">
        <div class="calendar__streak">
          <div class="calendar__streak-value">{props.streak.current}</div>
          <div class="calendar__streak-label">current streak</div>
        </div>
        <div class="calendar__streak">
          <div class="calendar__streak-value">{props.streak.longest}</div>
          <div class="calendar__streak-label">longest streak</div>
        </div>
      </div>
      <div class="calendar__grid" style={{ "grid-template-columns": `repeat(${COLS}, 1fr)` }}>
        <For each={days}>
          {(key) => {
            const count = props.dailyCounts.get(key) ?? 0;
            const intensity =
              count === 0 ? 0 : maxCount === 0 ? 0 : 0.25 + (count / maxCount) * 0.75;
            const isToday = key === today;
            return (
              <div
                class="calendar__cell"
                classList={{
                  "calendar__cell--today": isToday,
                  "calendar__cell--empty": count === 0,
                }}
                style={{
                  "background-color":
                    count === 0
                      ? "var(--color-surface-2)"
                      : `color-mix(in oklch, var(--color-accent) ${Math.round(intensity * 100)}%, var(--color-surface-2))`,
                }}
                title={`${key} — ${count} ${count === 1 ? "session" : "sessions"}`}
              />
            );
          }}
        </For>
      </div>
      <div class="calendar__legend" aria-hidden="true">
        <span class="calendar__legend-label">{days[0]?.slice(5)}</span>
        <span class="calendar__legend-spacer" />
        <span class="calendar__legend-label">today</span>
      </div>
    </div>
  );
}

import type { JSX } from "solid-js";
import { For, Show } from "solid-js";

export interface InlineSegRadioOption<T extends string> {
  value: T;
  label: string;
}

export interface InlineSegRadioProps<T extends string> {
  /**
   * Group label shown inline before the options (e.g. `"sound"`) and used as
   * the radiogroup's accessible name.
   */
  label: string;
  options: ReadonlyArray<InlineSegRadioOption<T>>;
  value: T;
  onChange: (value: T) => void;
}

/**
 * Minimal text-button segmented control. Options are plain text separated by
 * a middot, with the active option in accent color and inactive options
 * muted — designed to sit in a hints row next to other small affordances
 * without adding visual weight.
 *
 * For the heavier "filled chip" variant used in Settings, use `SegRadio`.
 *
 * The W3C ARIA APG segmented-control pattern (radiogroup + radio buttons)
 * applies here too; Biome's `useSemanticElements` is suppressed on the
 * option buttons.
 */
export function InlineSegRadio<T extends string>(props: InlineSegRadioProps<T>): JSX.Element {
  return (
    <div class="inline-seg" role="radiogroup" aria-label={props.label}>
      <span class="inline-seg__label">{props.label}:</span>
      <For each={props.options}>
        {(opt, i) => (
          <>
            <Show when={i() > 0}>
              <span class="inline-seg__sep" aria-hidden="true">
                ·
              </span>
            </Show>
            {/* biome-ignore lint/a11y/useSemanticElements: inline segmented control — see W3C ARIA APG radiogroup/radio pattern. */}
            <button
              type="button"
              role="radio"
              aria-checked={props.value === opt.value}
              classList={{
                "inline-seg__opt": true,
                "inline-seg__opt--on": props.value === opt.value,
              }}
              onClick={() => props.onChange(opt.value)}
            >
              {opt.label}
            </button>
          </>
        )}
      </For>
    </div>
  );
}

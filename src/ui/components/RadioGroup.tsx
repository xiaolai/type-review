import type { JSX } from "solid-js";
import { For } from "solid-js";

export interface RadioOption<T extends string | number> {
  value: T;
  label: string;
}

export interface RadioGroupProps<T extends string | number> {
  /** Shared `name` for the underlying `<input type=radio>` group. */
  name: string;
  options: ReadonlyArray<RadioOption<T>>;
  value: T;
  onChange: (next: T) => void;
  /** id of the visible label that names this group (a11y). */
  labelledBy?: string;
  /**
   * `"column"` (default) stacks options vertically. `"row"` lays them
   * out in a wrap-friendly horizontal row — useful for short option
   * lists where a vertical list would feel sparse.
   */
  orientation?: "row" | "column";
}

/**
 * Standard form-style radio group — uses the `.radio` + `.radio__circle`
 * pattern from `components.css`. Visually distinct from segmented
 * `<SegRadio>` controls so that a settings page can use tabs for
 * section navigation and radios for the actual options without the two
 * looking the same.
 */
export function RadioGroup<T extends string | number>(props: RadioGroupProps<T>): JSX.Element {
  return (
    <div
      class="radio-group"
      classList={{ "radio-group--row": props.orientation === "row" }}
      role="radiogroup"
      aria-labelledby={props.labelledBy}
    >
      <For each={props.options}>
        {(opt) => (
          <label class="radio">
            <input
              type="radio"
              class="radio__input"
              name={props.name}
              value={String(opt.value)}
              checked={props.value === opt.value}
              onChange={() => props.onChange(opt.value)}
            />
            <span class="radio__circle" aria-hidden="true" />
            <span>{opt.label}</span>
          </label>
        )}
      </For>
    </div>
  );
}

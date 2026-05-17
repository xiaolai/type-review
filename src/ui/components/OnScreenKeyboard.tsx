import type { Accessor, JSX } from "solid-js";
import { createMemo, For, onCleanup, onMount, Show } from "solid-js";
import type { LessonKey, LessonPlan } from "../../engine/adaptive";
import type { KeyboardLayoutName, KeyDef } from "./keyboard-layouts";
import { KEYBOARD_LAYOUTS } from "./keyboard-layouts";
import type { KeyMap } from "./keymaps";
import { mapLetter } from "./keymaps";

export interface OnScreenKeyboardProps {
  /** Which physical layout to render. */
  layout: KeyboardLayoutName;
  /**
   * Character mapping — `qwerty` (default) or `colemak`. Affects the
   * letter rendered on each cap and the heatmap lookup key. Purely
   * visual: the engine consumes whatever the OS sends.
   */
  keymap: KeyMap;
  /**
   * The current lesson plan, used to colour letter keycaps by mastery.
   * `null` (benchmark mode) → no heat tint, just pressed-state.
   */
  plan: LessonPlan | null;
  /**
   * Currently-held `KeyboardEvent.code` values. Sourced from the shared
   * `KeyEventBus` at the app root — this component does not subscribe to
   * window events itself.
   */
  pressed: Accessor<ReadonlySet<string>>;
}

/**
 * Maps a `LessonKey` to a 0..1 score for `heatTint`. Locked / unpracticed
 * keys return `null` so the cap stays neutral.
 */
function keyScore(key: LessonKey): number | null {
  if (!key.included) return null;
  if (key.confidence === null) return null;
  return Math.min(1, Math.max(0, key.confidence));
}

/** Score buckets → design tokens. Mirrors the design's `heatTint`. */
function heatTint(score: number): string {
  if (score < 0.2) return "var(--heat-1)";
  if (score < 0.4) return "var(--heat-2)";
  if (score < 0.6) return "var(--heat-3)";
  if (score < 0.8) return "var(--heat-4)";
  return "var(--heat-5)";
}

function KeyIcon(props: { icon: KeyDef["icon"] }): JSX.Element {
  if (props.icon === "win-logo") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M3 5.5l8-1.1v7.1H3V5.5zm0 13l8 1.1v-7.1H3v6zm9 1.2l12 1.6v-8.7H12v7.1zm0-15.5v7.2h12V2.5L12 4.2z" />
      </svg>
    );
  }
  if (props.icon === "fingerprint") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M12 4c-3.5 0-6 2.5-6 6v3" />
        <path d="M12 7c-2 0-3 1.4-3 3v4" />
        <path d="M12 10v6" />
        <path d="M15 10v3c0 2 1 3 3 3" />
        <path d="M18 7v6c0 2-1 4-3 5" />
      </svg>
    );
  }
  if (props.icon === "touch-id") {
    // Sized via CSS (`.kb__key__icon--touch-id`) so the diameter scales with
    // the cap's `--u` and stays geometrically centered.
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="kb__key__icon--touch-id"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
      </svg>
    );
  }
  if (props.icon === "maximize") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <rect x="4" y="4" width="16" height="16" rx="1" />
      </svg>
    );
  }
  return null;
}

/**
 * Full ANSI keyboard visualisation, mac- or windows-variant. Subsumes the
 * old per-letter heatmap: each letter keycap carries the mastery colour for
 * that letter via inline `background`, plus a live pressed-state overlay
 * driven by the shared `KeyEventBus` (consumed via the `pressed` prop).
 *
 * The component is intentionally a pure render — no DOM event listeners
 * here. Single-source-of-truth for "what keys are held" lives in the bus
 * at the app root; everyone who needs that state (this widget, the engine
 * input handler, any future consumer) subscribes there.
 */
export function OnScreenKeyboard(props: OnScreenKeyboardProps): JSX.Element {
  /** Lookup table: letter → its LessonKey, rebuilt when the plan changes. */
  const keyByLetter = createMemo<ReadonlyMap<string, LessonKey>>(() => {
    const map = new Map<string, LessonKey>();
    if (props.plan) {
      for (const k of props.plan.keys) {
        map.set(k.letter, k);
      }
    }
    return map;
  });

  const focusLetter = (): string | null => props.plan?.focus ?? null;

  // Scale-to-fit. The keyboard renders at a FIXED natural size
  // (`--u: 22px` and an explicit `width` in CSS) so its dimensions are
  // independent of every browser's intrinsic-sizing quirks. A
  // ResizeObserver measures the wrapper's available width and applies
  // `transform: scale(wrapperW / NATURAL_WIDTH)` — uniformly shrinks
  // or modestly grows the rendered keyboard. Wrapper height gets set
  // to `naturalH × scale` so the layout collapses to the visual size.
  //
  // Why fixed natural size: every CSS-only sizing attempt (max-content,
  // fit-content, min-width: max-content on rows) hit a WebKit flex
  // intrinsic-sizing bug — Safari's parent `max-content` doesn't
  // account for grandchildren's fixed widths, so the frame shrank
  // below its rows and keys overflowed. A hard pixel width bypasses
  // intrinsic sizing entirely; `transform: scale` then shrinks the
  // rendered box uniformly, which every browser handles identically.
  //
  // 388px = 15u + 13×3px gap + 2×0.35u padding + 2px border at --u=22,
  // rounded up for a safe 1.6px of headroom. (Without that headroom
  // the widest row's 369px exceeded the content area of a 385px-wide
  // `box-sizing: border-box` frame, clipping a sliver of the last key.)
  const NATURAL_WIDTH = 388;
  // Cap upscale at 1.5× so desktop viewports don't render an absurdly
  // huge keyboard; cap downscale at 0.4× so very narrow displays still
  // render something legible (keys at ~9px wide).
  const MAX_SCALE_UP = 1.5;
  const MIN_SCALE = 0.4;

  let wrapperRef: HTMLDivElement | undefined;
  let kbRef: HTMLElement | undefined;
  onMount(() => {
    if (!wrapperRef || !kbRef) return;
    // jsdom (test env) and very old browsers don't expose
    // ResizeObserver — skip the auto-scale; the keyboard renders at
    // its natural fixed size, which is fine for structural tests.
    if (typeof ResizeObserver === "undefined") return;
    const wrapper = wrapperRef;
    const kb = kbRef;
    const update = (): void => {
      const wrapperW = wrapper.clientWidth;
      if (wrapperW === 0) return;
      const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE_UP, wrapperW / NATURAL_WIDTH));
      kb.style.setProperty("--kb-scale", String(scale));
      // Measure the POST-transform visual height directly via
      // getBoundingClientRect — it returns the scaled bounding box
      // with sub-pixel precision. (Using `offsetHeight × scale`
      // earlier rounded the natural height to an integer first, so
      // wrapper height ended up ~0.5px short of the real visual
      // extent and the bottom edge of the keyboard got covered by
      // the next element in flow.) Setting --kb-scale is a transform
      // change only — no layout — so the new rect is available
      // immediately on the next read.
      const visualH = kb.getBoundingClientRect().height;
      wrapper.style.height = `${Math.ceil(visualH)}px`;
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrapper);
    onCleanup(() => ro.disconnect());
  });

  return (
    <div class="kb-scale" ref={wrapperRef}>
      <section
        class={`kb kb--${props.layout}`}
        aria-label={`${props.layout} keyboard`}
        ref={(el) => (kbRef = el as HTMLElement)}
      >
        <For each={KEYBOARD_LAYOUTS[props.layout]}>
          {(row) => (
            <div class="kb__row">
              <For each={row}>
                {(key) => {
                  // Effective letter at this physical position under the
                  // active keymap. For letter caps (q/w/e/...), drives both
                  // the visible label and the heatmap lookup. Non-letter
                  // caps have `key.letter === undefined` and are unaffected.
                  const effectiveLetter = (): string | undefined =>
                    key.letter ? mapLetter(key.letter, props.keymap) : undefined;
                  const displayLabel = (): string => {
                    const el = effectiveLetter();
                    return el !== undefined ? el : key.label;
                  };
                  const isPressed = (): boolean =>
                    (key.codes ?? []).some((c) => props.pressed().has(c));
                  const score = (): number | null => {
                    const el = effectiveLetter();
                    if (el === undefined) return null;
                    const k = keyByLetter().get(el);
                    return k ? keyScore(k) : null;
                  };
                  const focused = (): boolean => {
                    const el = effectiveLetter();
                    if (el === undefined) return false;
                    return focusLetter() === el;
                  };
                  const style = (): JSX.CSSProperties => {
                    const css: JSX.CSSProperties = { "--w": key.width };
                    const s = score();
                    if (s !== null && !isPressed()) {
                      css.background = heatTint(s);
                    }
                    return css;
                  };
                  return (
                    <div
                      class="kb__key"
                      classList={{
                        "kb__key--mod": key.variant === "mod",
                        "kb__key--space": key.variant === "space",
                        "kb__key--pressed": isPressed(),
                        "kb__key--focused": focused(),
                        "kb__key--slow": score() !== null && (score() ?? 1) < 0.3,
                        "kb__key--align-start": key.align === "start",
                        "kb__key--align-end": key.align === "end",
                        "kb__key--dual": key.shifted !== undefined,
                      }}
                      data-key={key.id}
                      style={style()}
                      aria-hidden="true"
                    >
                      <Show when={key.shifted}>
                        {(shifted) => <span class="kb__key__shifted">{shifted()}</span>}
                      </Show>
                      <span class="kb__key__label">
                        <Show when={key.icon} fallback={displayLabel()}>
                          <KeyIcon icon={key.icon} />
                        </Show>
                      </span>
                      <Show when={key.sub}>
                        {(sub) => <span class="kb__key__sub">{sub()}</span>}
                      </Show>
                    </div>
                  );
                }}
              </For>
            </div>
          )}
        </For>
      </section>
    </div>
  );
}

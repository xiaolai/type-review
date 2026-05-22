import type { JSX } from "solid-js";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { BackLink } from "./components/BackLink";
import { InlineSegRadio, type InlineSegRadioOption } from "./components/InlineSegRadio";
import {
  checkDetAnswer,
  type DetAnswerState,
  type DetTargetLevel,
  detDisplayLetters,
  detMissingPart,
  detPrefixForTarget,
  detSlotCount,
} from "./det-practice";
import { DET_READ_COMPLETE_ITEMS, type DetPracticeItem } from "./det-practice-data";
import type { RouteName } from "./router";

const TARGET_OPTIONS: ReadonlyArray<InlineSegRadioOption<DetTargetLevel>> = [
  { value: "105", label: "105" },
  { value: "115", label: "115" },
  { value: "125", label: "125" },
];

export interface DetPracticeProps {
  onNavigate: (to: RouteName) => void;
}

export function DetPractice(props: DetPracticeProps): JSX.Element {
  let inputRef: HTMLInputElement | undefined;
  const [currentIndex, setCurrentIndex] = createSignal(0);
  const [targetLevel, setTargetLevel] = createSignal<DetTargetLevel>("115");
  const [answer, setAnswer] = createSignal("");
  const [state, setState] = createSignal<DetAnswerState | null>(null);
  const [outcomes, setOutcomes] = createSignal<readonly DetAnswerState[]>([]);

  const item = createMemo<DetPracticeItem>(
    () => DET_READ_COMPLETE_ITEMS[currentIndex()] ?? DET_READ_COMPLETE_ITEMS[0]!,
  );
  const total = DET_READ_COMPLETE_ITEMS.length;
  const correctCount = createMemo(
    () => outcomes().filter((outcome) => outcome === "correct").length,
  );
  const checkedCount = createMemo(() => outcomes().filter(Boolean).length);
  const isComplete = createMemo(() => checkedCount() >= total && state() !== null);
  const progress = createMemo(() =>
    Math.round((Math.min(currentIndex() + (state() === null ? 0 : 1), total) / total) * 100),
  );

  createEffect(() => {
    currentIndex();
    window.requestAnimationFrame(() => inputRef?.focus());
  });

  const recordOutcome = (next: DetAnswerState): void => {
    setOutcomes((prev) => {
      const copy = [...prev];
      copy[currentIndex()] = next;
      return copy;
    });
  };

  const checkCurrent = (): void => {
    const next = checkDetAnswer(item(), answer(), targetLevel());
    setState(next);
    recordOutcome(next);
  };

  const goNext = (): void => {
    if (currentIndex() >= total - 1) return;
    setCurrentIndex((index) => index + 1);
    setAnswer("");
    setState(null);
  };

  const restart = (): void => {
    setCurrentIndex(0);
    setAnswer("");
    setState(null);
    setOutcomes([]);
  };

  const changeTargetLevel = (value: DetTargetLevel): void => {
    if (value === targetLevel()) return;
    setTargetLevel(value);
    restart();
  };

  const submit = (): void => {
    if (state() === null) {
      checkCurrent();
      return;
    }
    goNext();
  };

  return (
    <main class="stage det-page">
      <header class="det-page__head">
        <div class="label">det · read and complete</div>
        <h2 class="det-page__title">One prompt. One answer.</h2>
        <p class="det-page__copy">
          Keep the visible prefix, complete the word, then press <kbd>Enter</kbd>. The answer stays
          hidden until you commit; higher targets reveal fewer letters.
        </p>
      </header>

      <section class="det-panel" aria-label="DET session status">
        <div class="det-score">
          <div class="det-score__bar" aria-hidden="true">
            <span style={{ width: `${progress()}%` }} />
          </div>
          <output class="det-score__text" aria-live="polite">
            {String(currentIndex() + 1).padStart(2, "0")} / {total} · {correctCount()} correct ·{" "}
            {checkedCount()} checked
          </output>
        </div>
        <div class="det-actions">
          <InlineSegRadio
            label="target"
            options={TARGET_OPTIONS}
            value={targetLevel()}
            onChange={changeTargetLevel}
          />
          <BackLink from="det" onNavigate={props.onNavigate} />
          <button type="button" class="hint-button" onClick={restart}>
            restart
          </button>
        </div>
      </section>

      <DetPrompt
        item={item()}
        number={currentIndex() + 1}
        answer={answer()}
        state={state()}
        complete={isComplete()}
        targetLevel={targetLevel()}
        onAnswer={setAnswer}
        onSubmit={submit}
        onNext={goNext}
        onRestart={restart}
        bindInput={(el) => {
          inputRef = el;
        }}
      />
    </main>
  );
}

function DetPrompt(props: {
  item: DetPracticeItem;
  number: number;
  answer: string;
  state: DetAnswerState | null;
  complete: boolean;
  targetLevel: DetTargetLevel;
  onAnswer: (value: string) => void;
  onSubmit: () => void;
  onNext: () => void;
  onRestart: () => void;
  bindInput: (el: HTMLInputElement) => void;
}): JSX.Element {
  const prefix = () => detPrefixForTarget(props.item, props.targetLevel);
  const missing = () => detMissingPart(props.item, props.targetLevel);
  const slotCount = () => detSlotCount(props.item, props.targetLevel);
  const display = () => detDisplayLetters(props.item, props.answer, props.targetLevel);
  const hasResult = (): boolean => props.state !== null;
  const isCorrect = (): boolean => props.state === "correct";
  const isWrong = (): boolean => props.state === "wrong";
  const feedback = (): string => {
    if (props.state === "correct") return "正确";
    if (props.state === "wrong") return "错误";
    if (props.state === "empty") return "未填写";
    return "";
  };

  return (
    <section
      class="det-single"
      classList={{
        "det-single--correct": isCorrect(),
        "det-single--wrong": isWrong(),
      }}
      aria-label="current DET item"
    >
      <div class="det-card__meta">
        <span class="det-card__num">{String(props.number).padStart(2, "0")}</span>
        <span class="det-card__topic">{props.item.topic}</span>
      </div>

      <p class="det-sentence det-sentence--single">
        {props.item.before}
        <span class="det-target">
          <span class="det-prefix">{prefix()}</span>
          <label class="det-blank" aria-label={`fill ${slotCount()} missing letters`}>
            <span class="det-slots" aria-hidden="true">
              <For each={Array.from({ length: slotCount() })}>
                {(_, slotIndex) => {
                  const char = (): string => display()[slotIndex()] ?? "";
                  return (
                    <span class="det-slot" classList={{ "det-slot--filled": char() !== "" }}>
                      {char()}
                    </span>
                  );
                }}
              </For>
            </span>
            <input
              ref={(el) => props.bindInput(el)}
              class="det-input"
              value={props.answer}
              autocomplete="off"
              autocapitalize="none"
              autocorrect="off"
              readOnly={hasResult()}
              spellcheck={false}
              aria-label={`question ${props.number} answer`}
              onInput={(event) => props.onAnswer(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  props.onSubmit();
                }
              }}
            />
          </label>
        </span>
        {props.item.after}
      </p>

      <div class="det-card__actions">
        <span class="hint">
          <kbd>Enter</kbd> {hasResult() ? "next" : "check"}
        </span>
        <Show when={hasResult()}>
          <span
            class="det-feedback"
            classList={{
              "det-feedback--correct": isCorrect(),
              "det-feedback--wrong": !isCorrect(),
            }}
            role="status"
            aria-live="polite"
          >
            {feedback()}
          </span>
        </Show>
        <Show when={hasResult() && !props.complete}>
          <button type="button" class="hint-button" onClick={props.onNext}>
            next
          </button>
        </Show>
        <Show when={props.complete}>
          <button type="button" class="hint-button" onClick={props.onRestart}>
            restart
          </button>
        </Show>
      </div>

      <Show when={hasResult()}>
        <div
          class="det-answer det-answer--result"
          classList={{
            "det-answer--correct": isCorrect(),
            "det-answer--wrong": isWrong(),
          }}
        >
          <div class="det-result-line">
            <b>{feedback()}</b>
            <span>
              {" "}
              answer: {props.item.word} · missing: {missing()}
            </span>
          </div>
          <p>{props.item.note}</p>
        </div>
      </Show>
    </section>
  );
}

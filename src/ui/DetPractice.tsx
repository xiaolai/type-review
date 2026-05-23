import type { JSX } from "solid-js";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { BackLink } from "./components/BackLink";
import {
  checkDetAnswer,
  DET_MISTAKES_STORAGE_KEY,
  type DetAnswerState,
  type DetDrillMode,
  type DetMistakeRecord,
  type DetTargetScore,
  detDisplayLetters,
  detItemsForTarget,
  detLetterStates,
  detMissingPart,
  detMistakeItems,
  detSlotCount,
  detTargetBand,
  detVisiblePrefix,
  updateDetMistakes,
} from "./det-practice";
import { DET_READ_COMPLETE_ITEMS, type DetPracticeItem } from "./det-practice-data";
import type { RouteName } from "./router";

export interface DetPracticeProps {
  onNavigate: (to: RouteName) => void;
}

function putAt<T>(items: readonly T[], index: number, value: T): readonly T[] {
  const next = [...items];
  next[index] = value;
  return next;
}

function summarizeOutcomes(outcomes: readonly (DetAnswerState | undefined)[]): {
  checked: number;
  correct: number;
} {
  let checked = 0;
  let correct = 0;
  for (const outcome of outcomes) {
    if (!outcome) continue;
    checked += 1;
    if (outcome === "correct") correct += 1;
  }
  return { checked, correct };
}

function isDetMistakeRecord(value: unknown): value is DetMistakeRecord {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<DetMistakeRecord>;
  return (
    typeof item.id === "string" &&
    typeof item.targetScore === "number" &&
    typeof item.misses === "number" &&
    typeof item.lastMissedAt === "number" &&
    typeof item.lastPracticedAt === "number"
  );
}

function loadDetMistakes(): readonly DetMistakeRecord[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DET_MISTAKES_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDetMistakeRecord);
  } catch {
    return [];
  }
}

function saveDetMistakes(mistakes: readonly DetMistakeRecord[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DET_MISTAKES_STORAGE_KEY, JSON.stringify(mistakes));
  } catch {
    // Losing this optional mistake bank should never block the practice loop.
  }
}

function clampTargetScore(value: number): DetTargetScore {
  if (!Number.isFinite(value)) return 115;
  return Math.min(160, Math.max(80, Math.round(value / 5) * 5));
}

function shuffleItems<T>(items: readonly T[]): readonly T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex]!, next[index]!];
  }
  return next;
}

function buildDetSessionItems(
  targetScore: DetTargetScore,
  mode: DetDrillMode,
  mistakes: readonly DetMistakeRecord[],
): readonly DetPracticeItem[] {
  const base = detItemsForTarget(DET_READ_COMPLETE_ITEMS, targetScore);
  return shuffleItems(mode === "missed" ? detMistakeItems(base, mistakes) : base);
}

export function DetPractice(props: DetPracticeProps): JSX.Element {
  let inputRef: HTMLInputElement | undefined;
  const [currentIndex, setCurrentIndex] = createSignal(0);
  const [targetScore, setTargetScore] = createSignal<DetTargetScore>(115);
  const [drillMode, setDrillMode] = createSignal<DetDrillMode>("all");
  const [introVisible, setIntroVisible] = createSignal(true);
  const [answer, setAnswer] = createSignal("");
  const [state, setState] = createSignal<DetAnswerState | null>(null);
  const [answers, setAnswers] = createSignal<readonly string[]>([]);
  const [outcomes, setOutcomes] = createSignal<readonly (DetAnswerState | undefined)[]>([]);
  const [mistakes, setMistakes] = createSignal<readonly DetMistakeRecord[]>(loadDetMistakes());
  const [items, setItems] = createSignal<readonly DetPracticeItem[]>(
    buildDetSessionItems(115, "all", mistakes()),
  );

  const targetItems = createMemo(() => detItemsForTarget(DET_READ_COMPLETE_ITEMS, targetScore()));
  const mistakeItems = createMemo(() => detMistakeItems(targetItems(), mistakes()));
  const item = createMemo<DetPracticeItem>(
    () => items()[currentIndex()] ?? items()[0] ?? DET_READ_COMPLETE_ITEMS[0]!,
  );
  const total = createMemo(() => items().length);
  const outcomeSummary = createMemo(() => summarizeOutcomes(outcomes()));
  const correctCount = createMemo(() => outcomeSummary().correct);
  const checkedCount = createMemo(() => outcomeSummary().checked);
  const isComplete = createMemo(
    () => currentIndex() >= total() - 1 && checkedCount() >= total() && state() !== null,
  );
  const progress = createMemo(() =>
    Math.round(
      (Math.min(currentIndex() + (state() === null ? 0 : 1), total()) / Math.max(total(), 1)) * 100,
    ),
  );

  createEffect(() => {
    currentIndex();
    window.requestAnimationFrame(() => inputRef?.focus());
  });

  const checkCurrent = (): void => {
    const next = checkDetAnswer(item(), answer());
    setState(next);
    setAnswers((prev) => putAt(prev, currentIndex(), answer()));
    setOutcomes((prev) => {
      const nextOutcomes = putAt(prev, currentIndex(), next);
      return nextOutcomes;
    });
    const nextMistakes = updateDetMistakes(mistakes(), item(), targetScore(), next);
    setMistakes(nextMistakes);
    saveDetMistakes(nextMistakes);
  };

  const goToIndex = (index: number): void => {
    if (index < 0 || index >= total()) return;
    setCurrentIndex(index);
    setAnswer(answers()[index] ?? "");
    setState(outcomes()[index] ?? null);
  };

  const goPrevious = (): void => {
    goToIndex(currentIndex() - 1);
  };

  const goNext = (): void => {
    goToIndex(currentIndex() + 1);
  };

  const startNewSession = (nextTarget = targetScore(), nextMode = drillMode()): void => {
    const clamped = clampTargetScore(nextTarget);
    setTargetScore(clamped);
    setDrillMode(nextMode);
    setItems(buildDetSessionItems(clamped, nextMode, mistakes()));
    setCurrentIndex(0);
    setAnswer("");
    setState(null);
    setOutcomes([]);
    setAnswers([]);
  };

  const restart = (): void => {
    startNewSession();
  };

  const changeTargetScore = (value: number): void => {
    const next = clampTargetScore(value);
    if (next === targetScore()) return;
    startNewSession(next);
  };

  const changeDrillMode = (value: DetDrillMode): void => {
    if (value === drillMode()) return;
    startNewSession(targetScore(), value);
  };

  const toggleDrillMode = (): void => {
    changeDrillMode(drillMode() === "missed" ? "all" : "missed");
  };

  const updateAnswer = (value: string): void => {
    setIntroVisible(false);
    if (state() !== null) {
      setState(null);
      setOutcomes((prev) => putAt(prev, currentIndex(), undefined));
    }
    setAnswer(value);
    setAnswers((prev) => putAt(prev, currentIndex(), value));
  };

  const retryCurrent = (): void => {
    setAnswer("");
    setState(null);
    setAnswers((prev) => putAt(prev, currentIndex(), ""));
    setOutcomes((prev) => putAt(prev, currentIndex(), undefined));
    window.requestAnimationFrame(() => inputRef?.focus());
  };

  const submit = (): void => {
    setIntroVisible(false);
    if (state() === null) {
      checkCurrent();
      return;
    }
    if (isComplete()) {
      restart();
      return;
    }
    goNext();
  };

  return (
    <main class="stage det-page">
      <section class="det-panel" aria-label="DET session status">
        <div class="det-score">
          <div class="det-score__bar" aria-hidden="true">
            <span style={{ width: `${progress()}%` }} />
          </div>
          <output class="det-score__text" aria-live="polite">
            item {String(currentIndex() + 1).padStart(2, "0")} · {correctCount()} correct ·{" "}
            {checkedCount()} checked · {drillMode()} · weak {mistakeItems().length}
          </output>
          <label class="det-target-score">
            <span>target</span>
            <input
              type="number"
              min="80"
              max="160"
              step="5"
              value={targetScore()}
              onChange={(event) => changeTargetScore(event.currentTarget.valueAsNumber)}
              aria-label="target score"
            />
            <small>bank {detTargetBand(targetScore())}</small>
          </label>
        </div>
        <div class="det-actions">
          <Show when={mistakeItems().length > 0 || drillMode() === "missed"}>
            <button type="button" class="hint-button" onClick={toggleDrillMode}>
              {drillMode() === "missed" ? "all" : "weak"}
            </button>
          </Show>
          <BackLink from="det" onNavigate={props.onNavigate} />
          <button type="button" class="hint-button" onClick={restart}>
            restart
          </button>
        </div>
      </section>

      <Show when={introVisible() && checkedCount() === 0}>
        <p class="det-intro">
          DET Fill in the Blanks · complete the word, then press <kbd>Enter</kbd>
        </p>
      </Show>

      <Show
        when={total() > 0}
        fallback={
          <section class="det-empty" aria-label="empty weak bank">
            <p>No weak items for this target yet.</p>
            <button type="button" class="hint-button" onClick={() => changeDrillMode("all")}>
              practice all
            </button>
          </section>
        }
      >
        <DetPrompt
          item={item()}
          number={currentIndex() + 1}
          answer={answer()}
          state={state()}
          complete={isComplete()}
          canPrevious={currentIndex() > 0}
          canNext={currentIndex() < total() - 1}
          onAnswer={updateAnswer}
          onSubmit={submit}
          onPrevious={goPrevious}
          onNext={goNext}
          onRetry={retryCurrent}
          onRestart={restart}
          bindInput={(el) => {
            inputRef = el;
          }}
        />
      </Show>
    </main>
  );
}

function DetPrompt(props: {
  item: DetPracticeItem;
  number: number;
  answer: string;
  state: DetAnswerState | null;
  complete: boolean;
  canPrevious: boolean;
  canNext: boolean;
  onAnswer: (value: string) => void;
  onSubmit: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onRetry: () => void;
  onRestart: () => void;
  bindInput: (el: HTMLInputElement) => void;
}): JSX.Element {
  const prefix = () => detVisiblePrefix(props.item);
  const missing = () => detMissingPart(props.item);
  const slotCount = () => detSlotCount(props.item);
  const display = () => detDisplayLetters(props.item, props.answer);
  const letterStates = () => detLetterStates(props.item, props.answer);
  const hasResult = (): boolean => props.state !== null;
  const isCorrect = (): boolean => props.state === "correct";
  const isWrong = (): boolean => props.state === "wrong";
  const enterAction = (): string => {
    if (!hasResult()) return "check";
    return props.complete ? "restart" : "next";
  };
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
                  const letterState = () => letterStates()[slotIndex()] ?? "empty";
                  const showLetterFeedback = (): boolean => hasResult() && char() !== "";
                  return (
                    <span
                      class="det-slot"
                      classList={{
                        "det-slot--filled": char() !== "",
                        "det-slot--correct": showLetterFeedback() && letterState() === "correct",
                        "det-slot--incorrect":
                          showLetterFeedback() && letterState() === "incorrect",
                      }}
                    >
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
          <kbd>Enter</kbd> {enterAction()}
        </span>
        <Show when={props.canPrevious}>
          <button type="button" class="hint-button" onClick={props.onPrevious}>
            prev
          </button>
        </Show>
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
        <Show when={hasResult()}>
          <button type="button" class="hint-button" onClick={props.onRetry}>
            retry
          </button>
        </Show>
        <Show when={hasResult() && props.canNext}>
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
          data-missing={missing()}
          classList={{
            "det-answer--correct": isCorrect(),
            "det-answer--wrong": isWrong(),
          }}
        >
          <div class="det-result-line">
            <b>{feedback()}</b>
            <span> answer: {props.item.word}</span>
          </div>
          <p>{props.item.note}</p>
        </div>
      </Show>
    </section>
  );
}

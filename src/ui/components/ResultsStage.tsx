import type { JSX } from "solid-js";
import { Show } from "solid-js";
import type { CorpusEntry } from "../../engine/corpus";
import type { Profile, SessionSnapshot } from "../../engine/session";
import { Results } from "../Results";
import { newlyReached } from "../stats/aggregations";

export interface ResultsStageProps {
  snap: SessionSnapshot;
  /** Corpus entry of the run that just completed — drives attribution. May be null for generated text. */
  entry: CorpusEntry | null;
  /** Full profile — needed to diff milestones for the achievement banner. */
  profile: Profile;
  onNext: () => void;
  onSettings: () => void;
}

/**
 * Results screen wrapper. Renders the `Results` view when a run is in the
 * snapshot; otherwise (direct nav to or refresh on `#/results`) renders a
 * recoverable empty state so the user is not left looking at a blank page.
 */
export function ResultsStage(props: ResultsStageProps): JSX.Element {
  return (
    <>
      <Show when={props.snap.lastResult}>
        {(result) => (
          <main class="stage">
            <Results
              result={result()}
              plan={props.snap.plan}
              entry={props.entry}
              unlocked={newlyReached(props.profile.results)}
              onNext={props.onNext}
              onSettings={props.onSettings}
            />
          </main>
        )}
      </Show>
      <Show when={!props.snap.lastResult}>
        <main class="stage">
          <div class="empty-note">
            no recent result —{" "}
            <button type="button" class="link" onClick={() => props.onNext()}>
              start a new run
            </button>
          </div>
        </main>
      </Show>
    </>
  );
}

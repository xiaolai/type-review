import type { Accessor, JSX } from "solid-js";
import { Show } from "solid-js";

export type LoadBanner = "corrupt" | "evicted" | null;
export type SaveBanner =
  | "save-failed"
  | "stale-other-tab"
  | "reset-failed"
  | "import-invalid"
  | "import-failed"
  | null;

export interface BannersProps {
  loadBanner: Accessor<LoadBanner>;
  saveBanner: Accessor<SaveBanner>;
  runCrashed: Accessor<boolean>;
}

/**
 * All the user-facing failure messages in one component. App owns the signals
 * that drive each banner; this component owns the copy and the markup so the
 * banners can be styled/reordered/internationalised in one place later.
 */
export function Banners(props: BannersProps): JSX.Element {
  return (
    <>
      <Show when={props.loadBanner() === "corrupt"}>
        <p class="banner banner--warn">your saved profile couldn't be read — starting fresh.</p>
      </Show>
      <Show when={props.loadBanner() === "evicted"}>
        <p class="banner banner--warn">
          your saved progress was wiped by the browser (eviction). starting fresh.
        </p>
      </Show>
      <Show when={props.saveBanner() === "save-failed"}>
        <p class="banner banner--warn">
          your last run couldn't be saved — local storage may be full.
        </p>
      </Show>
      <Show when={props.saveBanner() === "stale-other-tab"}>
        <p class="banner banner--warn">
          another tab updated this profile — reload to continue from the latest.
        </p>
      </Show>
      <Show when={props.saveBanner() === "reset-failed"}>
        <p class="banner banner--error">
          couldn't reset your profile — close other tabs of this app and try again.
        </p>
      </Show>
      <Show when={props.saveBanner() === "import-invalid"}>
        <p class="banner banner--warn">that file isn't a valid type.review profile export.</p>
      </Show>
      <Show when={props.saveBanner() === "import-failed"}>
        <p class="banner banner--error">
          couldn't write the imported profile — local storage may be full.
        </p>
      </Show>
      <Show when={props.runCrashed()}>
        <p class="banner banner--error">
          something went wrong with the typing engine. press <kbd>Tab</kbd> to restart.
        </p>
      </Show>
    </>
  );
}

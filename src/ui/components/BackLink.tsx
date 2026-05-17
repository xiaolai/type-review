import type { JSX } from "solid-js";
import { Show } from "solid-js";
import type { RouteName } from "../router";
import { parentOf } from "../router";

export interface BackLinkProps {
  /** The route the user is currently on. Parent is looked up in ROUTE_PARENT. */
  from: RouteName;
  /** Navigate handler — usually `router.navigate`. */
  onNavigate: (to: RouteName) => void;
}

/**
 * The single "back to ..." button for any info page. Destination and
 * label both come from `ROUTE_PARENT` so they cannot drift apart.
 * Renders nothing on root routes (no parent). Pages just drop this in
 * their `.actions` row and don't think about back navigation themselves.
 */
export function BackLink(props: BackLinkProps): JSX.Element {
  const parent = (): RouteName | null => parentOf(props.from);
  return (
    <Show when={parent()}>
      {(target) => (
        <button type="button" class="btn" onClick={() => props.onNavigate(target())}>
          back to {target()}
        </button>
      )}
    </Show>
  );
}

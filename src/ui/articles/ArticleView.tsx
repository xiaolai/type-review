import type { JSX } from "solid-js";
import { createMemo, createResource, Show } from "solid-js";
import { type Article, getArticle, loadArticleMarkdown } from "./articles";
import { renderArticle } from "./render-article";

export interface ArticleViewProps {
  /** Article slug from the URL — e.g. `"superpower-fingertips"`. */
  articleId: string;
  /** Back button — usually navigates to About or the home practice page. */
  onBack: () => void;
}

/**
 * Intercept clicks on in-article anchors that jump within the
 * article: `#ref-N` (body footnote marker → reference) and
 * `#fnref-N-i` (reference back-link → body marker). The SPA uses
 * hash-based routing, so letting the browser follow them would
 * clobber the route hash and unmount the article. We scroll the
 * target into view manually and briefly highlight it. Bound on the
 * article container so any anchor the renderer produced is covered.
 */
function onArticleClick(event: MouseEvent): void {
  // Modifier-click (open in new tab) and middle-click should keep
  // their normal browser behaviour. The hash isn't a useful URL to
  // share anyway, but we don't want to surprise power users.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = (event.target as HTMLElement | null)?.closest?.(
    "a[href^='#ref-'], a[href^='#fnref-']",
  );
  if (!(target instanceof HTMLAnchorElement)) return;
  event.preventDefault();
  const id = target.getAttribute("href")?.slice(1) ?? "";
  const dest = id === "" ? null : document.getElementById(id);
  if (dest === null) return;
  // For body markers (`fnref-…`), `block: "center"` lands the
  // jumped-to spot in the middle of the viewport rather than glued to
  // the top — the surrounding paragraph is what the reader wants to
  // re-read. References at the bottom are short, so `start` is fine.
  const block: ScrollLogicalPosition = id.startsWith("fnref-") ? "center" : "start";
  dest.scrollIntoView({ behavior: "smooth", block });
  // Visual cue so the user can tell which target they jumped to.
  // CSS removes the class on animation end; the timeout is a fallback
  // in case the transition is interrupted.
  dest.classList.add("reference--target");
  window.setTimeout(() => dest.classList.remove("reference--target"), 2000);
}

/**
 * Renders one bundled article. Looks up the metadata by id (sync),
 * then async-fetches the markdown body from `public/articles/<id>/`
 * via `createResource`. Loading and error states each get their own
 * fallback; the rendered HTML drops into the page via `innerHTML`
 * (safe — markdown is our own authored content, not third-party).
 */
export function ArticleView(props: ArticleViewProps): JSX.Element {
  const article = createMemo(() => getArticle(props.articleId));
  // `createResource` re-runs the fetcher when its source signal
  // changes. The source returns `null` when there's no matching
  // article so the resource short-circuits to `undefined` (skipped).
  const [markdown] = createResource<string | null, Article>(
    () => article(),
    async (a: Article) => await loadArticleMarkdown(a),
  );
  const html = createMemo(() => {
    const a = article();
    const md = markdown();
    if (a === null || typeof md !== "string") return "";
    return renderArticle(md, { assetsBaseUrl: a.assetsBaseUrl });
  });

  return (
    <main class="stage page page--narrow">
      <Show
        when={article()}
        fallback={
          <div class="empty-note">
            article not found —{" "}
            <button type="button" class="link" onClick={() => props.onBack()}>
              back to practice
            </button>
          </div>
        }
      >
        {(a) => (
          <>
            <header class="page__head">
              <div class="label">article</div>
              <h2 class="page__title">{a().title}</h2>
            </header>

            <Show when={markdown.error}>
              <div class="empty-note">
                couldn't load this article ({String(markdown.error)}) —{" "}
                <button type="button" class="link" onClick={() => props.onBack()}>
                  back to practice
                </button>
              </div>
            </Show>
            <Show when={!markdown.error && markdown.loading}>
              <div class="empty-note">loading…</div>
            </Show>
            <Show when={!markdown.error && !markdown.loading}>
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard activation of the in-article anchor links works without extra binding (Enter on a focused <a> follows it; our click handler then catches it). */}
              <article class="article-prose" innerHTML={html()} onClick={onArticleClick} />
            </Show>

            <div class="actions" style={{ "margin-top": "var(--space-6)" }}>
              <button type="button" class="btn" onClick={() => props.onBack()}>
                back
              </button>
            </div>
          </>
        )}
      </Show>
    </main>
  );
}

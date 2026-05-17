import type { JSX } from "solid-js";

/**
 * Canonical URLs referenced by the footer (and elsewhere — Credits,
 * Copyright). If any of these move, update here and grep for the old
 * value.
 */
const REPO_URL = "https://github.com/xiaolai/type-review";
const AUTHOR_NAME = "xiaolai";
const AUTHOR_HOMEPAGE = "https://lixiaolai.com";

export interface FooterProps {
  activeAbout: boolean;
  activeCopyright: boolean;
  onAbout: () => void;
  onCopyright: () => void;
}

/**
 * Meta-link footer — sits below the primary BottomNav. Carries the
 * site-level info nav (about, copyright), the author homepage link,
 * and the source-repo mark. Kept deliberately quiet so it reads as
 * chrome, not nav; About itself is still the hub that fans out to the
 * full info tree.
 */
export function Footer(props: FooterProps): JSX.Element {
  return (
    <nav class="footer" aria-label="meta navigation">
      <button
        type="button"
        class="footer__link"
        classList={{ "footer__link--active": props.activeAbout }}
        aria-current={props.activeAbout ? "page" : undefined}
        onClick={() => props.onAbout()}
      >
        about
      </button>
      <button
        type="button"
        class="footer__link"
        classList={{ "footer__link--active": props.activeCopyright }}
        aria-current={props.activeCopyright ? "page" : undefined}
        onClick={() => props.onCopyright()}
      >
        copyright
      </button>
      <a
        class="footer__link footer__link--author"
        href={AUTHOR_HOMEPAGE}
        target="_blank"
        rel="noopener"
        aria-label={`author homepage: ${AUTHOR_NAME} (${AUTHOR_HOMEPAGE})`}
        title={`author: ${AUTHOR_NAME}`}
      >
        <GlobeMark />
        <span>{AUTHOR_NAME}</span>
      </a>
      <a
        class="footer__icon"
        href={REPO_URL}
        target="_blank"
        rel="noopener"
        aria-label="source on GitHub"
        title="source on GitHub"
      >
        <GitHubMark />
      </a>
    </nav>
  );
}

/**
 * Stroke-style globe mark — meridian + equator over an outlined sphere.
 * Stroke (vs the filled GitHub mark) so the two icons read as distinct
 * silhouettes when sat next to each other in the footer. Inherits color
 * via `stroke: currentColor` so it tracks the link's color state.
 */
function GlobeMark(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
    >
      <circle cx="12" cy="12" r="9.5" />
      <ellipse cx="12" cy="12" rx="9.5" ry="4" />
      <line x1="2.5" y1="12" x2="21.5" y2="12" />
      <line x1="12" y1="2.5" x2="12" y2="21.5" />
    </svg>
  );
}

/**
 * Inline GitHub Octocat mark — bundled SVG, no asset request, no CDN.
 * Path data is the simplified mono mark from GitHub's brand assets.
 * `currentColor` so the icon tracks the link's color state.
 */
function GitHubMark(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.07 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.6.23 2.78.11 3.07.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.68.8.56C20.21 21.38 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

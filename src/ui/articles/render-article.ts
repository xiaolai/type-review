/**
 * Minimal markdown → HTML renderer for the project's own articles
 * (sourced from `public/articles/<slug>/article.md`). NOT a
 * general-purpose parser — only handles the constructs the project's
 * own articles use:
 *
 *   - ATX headings (#, ##, ###)
 *   - Paragraphs (blank-line separated)
 *   - `**bold**`, `*italic*`
 *   - `[text](url)` links (rendered with `rel=noopener` and absolute
 *     URLs only — relative-link safety isn't a concern for content we
 *     author ourselves)
 *   - `<https://...>` autolinks (CommonMark angle-bracket form); each
 *     becomes a clickable anchor with its URL as the visible label.
 *     Citations / references in our articles use this form, so it's
 *     not optional.
 *   - `![alt](path)` images, with `assetsBaseUrl` prepended to relative
 *     paths so the source markdown can stay portable (the same
 *     `assets/foo.png` works in a sibling preview tool AND in-app)
 *   - `---` horizontal rules
 *   - Footnote convention: a `[N]` inline marker in body text becomes
 *     a superscript link to the matching reference at the bottom; the
 *     references section starts at a heading whose title begins with
 *     "References" (case-insensitive), and any paragraph in that
 *     section that begins with `[N]` is assigned `id="ref-N"`.
 *
 * We deliberately reach for a dedicated dependency only if the article
 * set outgrows this. Today: ~120 lines vs. 30 KB+ for a `marked`-style
 * package.
 */

export interface RenderArticleOptions {
  /**
   * Prefix prepended to any relative image src. Trailing slash
   * required. Example: "/articles/superpower-fingertips/".
   */
  assetsBaseUrl: string;
}

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

interface InlineContext {
  assetsBaseUrl: string;
  /**
   * When false (body), `[N]` becomes a superscript footnote link.
   * When true (inside the references section), `[N]` is rendered as
   * plain text so the reference list doesn't end up linking each
   * back-reference to itself.
   */
  inReferences: boolean;
  /**
   * Per-number occurrence counter for body `[N]` markers. Each match
   * increments `fnOccurrences[N]` and is rendered with
   * `id="fnref-N-{i}"` so the reference's back-link can target the
   * exact spot the reader jumped from. Mutated in place — shared
   * across paragraphs within one render pass.
   */
  fnOccurrences: Map<string, number>;
}

/** Inline transforms — run after the line is identified as paragraph text. */
function renderInline(raw: string, ctx: InlineContext): string {
  // Escape first so any user markup in alt/text is rendered literally.
  let s = escapeHtml(raw);

  // Image: ![alt](src). Must come before the link rule (![ matches [).
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt: string, src: string) => {
    const url = /^(https?:|\/)/.test(src) ? src : ctx.assetsBaseUrl + src.replace(/^\.\//, "");
    return `<img src="${url}" alt="${alt}" loading="lazy" />`;
  });

  // Link: [text](url) — external links open in a new tab.
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text: string, url: string) => {
    const external = /^https?:/.test(url);
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : "";
    return `<a href="${url}"${attrs}>${text}</a>`;
  });

  // Bold then italic (order matters: `**` before `*`).
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Autolink: CommonMark `<https://example.com>` becomes a clickable
  // anchor. Runs AFTER escapeHtml so we match the escaped form
  // (`&lt;…&gt;`) and emit the raw anchor we want in the output.
  s = s.replace(
    /&lt;(https?:\/\/[^\s&]+)&gt;/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  // Footnote markers: `[N]` becomes a superscript anchor to `#ref-N`.
  // Skipped inside the references section so the reference's own
  // leading `[N]` isn't turned into a self-link. The link rule above
  // already consumed any `[text](url)` so what remains is genuine
  // bracketed numerals in the body.
  if (!ctx.inReferences) {
    s = s.replace(/\[(\d+)\]/g, (_m, n: string) => {
      const count = (ctx.fnOccurrences.get(n) ?? 0) + 1;
      ctx.fnOccurrences.set(n, count);
      return `<sup class="footnote"><a id="fnref-${n}-${count}" href="#ref-${n}" data-ref="${n}">[${n}]</a></sup>`;
    });
  }

  return s;
}

/** Recognise the H2 that introduces the references section. */
const REFERENCES_HEADING = /^references\b/i;

/** Block kinds the article markdown produces. */
type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "hr" }
  | { kind: "image"; alt: string; src: string };

/** Resolve a relative asset path against the article's `assetsBaseUrl`. */
function resolveAsset(src: string, base: string): string {
  return /^(https?:|\/)/.test(src) ? src : base + src.replace(/^\.\//, "");
}

/**
 * Phase 1 — tokenize markdown into a flat `Block[]` plus per-block
 * `inReferences` flags. The flags are computed here so the render
 * phase doesn't need to re-walk for state.
 *
 * Block recognition order: blank line (flush), heading, hr, standalone
 * image, otherwise paragraph continuation.
 */
function parseArticle(md: string): { block: Block; inReferences: boolean }[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: { block: Block; inReferences: boolean }[] = [];
  let pending: string[] = [];
  let inReferences = false;
  const pushParagraph = (): void => {
    if (pending.length === 0) return;
    blocks.push({ block: { kind: "paragraph", text: pending.join(" ") }, inReferences });
    pending = [];
  };
  for (const line of lines) {
    if (/^\s*$/.test(line)) {
      pushParagraph();
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      pushParagraph();
      const level = (heading[1]?.length ?? 1) as 1 | 2 | 3;
      const text = heading[2] ?? "";
      // Toggle references mode on an H2 whose title starts with
      // "References". Any H1 (theoretically) ends the references
      // section.
      if (level === 2) inReferences = REFERENCES_HEADING.test(text.trim());
      else if (level === 1) inReferences = false;
      blocks.push({ block: { kind: "heading", level, text }, inReferences });
      continue;
    }
    if (/^\s*---\s*$/.test(line)) {
      pushParagraph();
      blocks.push({ block: { kind: "hr" }, inReferences });
      continue;
    }
    // Standalone image: a line that is only an image link, no other
    // text on it. Treated as its own block so the renderer can wrap it
    // in <figure>.
    const image = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(line);
    if (image && pending.length === 0) {
      blocks.push({
        block: { kind: "image", alt: image[1] ?? "", src: image[2] ?? "" },
        inReferences,
      });
      continue;
    }
    pending.push(line);
  }
  pushParagraph();
  return blocks;
}

/**
 * In the references section, a paragraph that opens with `[N]` becomes
 * an anchored reference entry with one back-link per body citation
 * (`↩`, or `↩₁ ↩₂` when the same reference was cited twice).
 */
function renderReferenceParagraph(
  n: string,
  rest: string,
  ctx: InlineContext,
  citations: number,
): string {
  const backlinks: string[] = [];
  for (let i = 1; i <= citations; i++) {
    const subscript = citations > 1 ? `<sub>${i}</sub>` : "";
    backlinks.push(
      ` <a class="reference__back" href="#fnref-${n}-${i}" aria-label="back to citation ${i}">↩${subscript}</a>`,
    );
  }
  return `<p id="ref-${n}" class="reference"><span class="reference__num">[${n}]</span> ${renderInline(rest, ctx)}${backlinks.join("")}</p>`;
}

/**
 * Render the given markdown to a self-contained HTML fragment. The
 * caller is expected to drop this into a sanitised container — we
 * trust our own bundled `.md` files but never run this on third-party
 * input.
 *
 * Two passes: {@link parseArticle} tokenises into blocks (also tagging
 * each block with whether it falls inside the references section);
 * this function then renders each block. Footnote markers in the body
 * are counted on the fly so back-links from the references section
 * line up one-per-citation.
 */
export function renderArticle(md: string, opts: RenderArticleOptions): string {
  const blocks = parseArticle(md);
  // Per-number count of `[N]` body occurrences — populated by the
  // inline renderer as paragraphs are emitted, consumed by the
  // references pass for back-link generation.
  const fnOccurrences = new Map<string, number>();
  const ctxFor = (inReferences: boolean): InlineContext => ({
    assetsBaseUrl: opts.assetsBaseUrl,
    inReferences,
    fnOccurrences,
  });

  const out: string[] = [];
  for (const { block, inReferences } of blocks) {
    const ctx = ctxFor(inReferences);
    switch (block.kind) {
      case "heading":
        out.push(`<h${block.level}>${renderInline(block.text, ctx)}</h${block.level}>`);
        break;
      case "hr":
        out.push("<hr />");
        break;
      case "image": {
        const url = resolveAsset(block.src, opts.assetsBaseUrl);
        out.push(
          `<figure><img src="${url}" alt="${block.alt}" loading="lazy" />${
            block.alt ? `<figcaption>${escapeHtml(block.alt)}</figcaption>` : ""
          }</figure>`,
        );
        break;
      }
      case "paragraph": {
        const refMatch = inReferences ? /^\[(\d+)\]\s+/.exec(block.text) : null;
        if (refMatch !== null) {
          const n = refMatch[1] ?? "";
          const rest = block.text.slice(refMatch[0].length);
          out.push(renderReferenceParagraph(n, rest, ctx, fnOccurrences.get(n) ?? 0));
        } else {
          out.push(`<p>${renderInline(block.text, ctx)}</p>`);
        }
        break;
      }
    }
  }
  return out.join("\n");
}

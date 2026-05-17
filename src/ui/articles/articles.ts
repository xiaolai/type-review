/**
 * Manifest of in-app articles. Each entry binds:
 *   - `id`        — URL slug used by the `#/articles/<id>` route
 *   - `title`     — human-readable title for nav / chrome
 *   - `summary`   — one-line teaser for index pages / About links
 *   - `markdownUrl` — runtime URL of the article body
 *   - `assetsBaseUrl` — prefix prepended to relative image paths in
 *                       the markdown source; same folder so the
 *                       static host serves both markdown and images
 *                       from one place
 *
 * The article body is fetched at runtime via {@link loadArticleMarkdown}
 * — keeps the JS bundle lean (each essay is its own paint-blocking
 * download, but only on the article route, not on first visit to
 * Practice). Add a new article by dropping its files into
 * `public/articles/<slug>/` and appending an entry below.
 */

export interface Article {
  id: string;
  title: string;
  summary: string;
  markdownUrl: string;
  assetsBaseUrl: string;
}

export const ARTICLES: ReadonlyArray<Article> = [
  {
    id: "superpower-fingertips",
    title: "The Superpower at Your Fingertips",
    summary: "Why typing, handwriting, and deft hands help your brain grow.",
    markdownUrl: "/articles/superpower-fingertips/article.md",
    assetsBaseUrl: "/articles/superpower-fingertips/",
  },
];

export function getArticle(id: string): Article | null {
  return ARTICLES.find((a) => a.id === id) ?? null;
}

/**
 * Fetch the markdown body for an article. Resolves to the raw text on
 * 2xx, rejects with a descriptive Error otherwise — the caller (the
 * SolidJS `<ArticleView>`) surfaces both states.
 */
export async function loadArticleMarkdown(article: Article): Promise<string> {
  const response = await fetch(article.markdownUrl);
  if (!response.ok) {
    throw new Error(`failed to load article (${response.status} ${response.statusText})`);
  }
  return response.text();
}

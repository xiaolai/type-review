// Apply persisted theme before paint to avoid a flash of the wrong theme.
// Loaded synchronously from index.html so it runs before any layout.
// Strict membership check — any other value falls back to the html
// attribute's default (dark).
//
// Lives as an external file (not inline) so the strict CSP
// `script-src 'self'` can stay in place without adding a sha256 hash.
try {
  var t = localStorage.getItem("type-review:theme");
  if (t === "light" || t === "dark" || t === "high-contrast") {
    document.documentElement.setAttribute("data-theme", t);
  } else if (window.matchMedia) {
    if (window.matchMedia("(prefers-contrast: more)").matches) {
      document.documentElement.setAttribute("data-theme", "high-contrast");
    } else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
      document.documentElement.setAttribute("data-theme", "light");
    }
  }
} catch (_) {}

import type { JSX } from "solid-js";
import { createSignal, For, Show } from "solid-js";
import type { UserPassage } from "../io";
import { MAX_PASSAGE_CHARS, parseFile, sanitize } from "../io";
import { logFailure } from "./log";

export interface LibraryProps {
  passages: readonly UserPassage[];
  onAdd: (input: { id: string; title: string; text: string }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onBack: () => void;
}

function randomId(): string {
  // crypto.randomUUID is available in modern browsers; fall back to a small
  // unique-enough timestamp+entropy combination for older environments.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `u-${crypto.randomUUID()}`;
  }
  return `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The Library screen — list / add / delete user-uploaded practice passages.
 * Paste textarea is always available; the file picker accepts .txt and
 * .md (the markdown parser lazy-loads when the user picks an .md file).
 */
export function Library(props: LibraryProps): JSX.Element {
  const [title, setTitle] = createSignal("");
  const [text, setText] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [info, setInfo] = createSignal<string | null>(null);
  const [fileName, setFileName] = createSignal<string | null>(null);

  let fileInput: HTMLInputElement | undefined;

  const submit = async (): Promise<void> => {
    setError(null);
    setInfo(null);
    const cleaned = sanitize(text());
    if (cleaned.text.length === 0) {
      setError("paste or upload some text first.");
      return;
    }
    setBusy(true);
    try {
      await props.onAdd({ id: randomId(), title: title().trim(), text: cleaned.text });
      setTitle("");
      setText("");
      setFileName(null);
      setInfo(
        cleaned.truncated
          ? `added — truncated to ${MAX_PASSAGE_CHARS.toLocaleString()} chars`
          : "added",
      );
    } catch (err: unknown) {
      logFailure("user-corpus", err);
      setError(err instanceof Error ? err.message : "couldn't save passage");
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (event: Event): Promise<void> => {
    setError(null);
    setInfo(null);
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    setBusy(true);
    setFileName(file.name);
    try {
      const raw = await parseFile(file);
      const cleaned = sanitize(raw);
      if (cleaned.text.length === 0) {
        setError("no readable text found in that file.");
        setFileName(null);
        return;
      }
      // Pre-fill the form so the user can review before saving.
      setText(cleaned.text);
      if (title().trim().length === 0) {
        // Use file name without extension as default title.
        setTitle(file.name.replace(/\.[^.]+$/, ""));
      }
      setInfo(
        cleaned.truncated
          ? `loaded — truncated to ${MAX_PASSAGE_CHARS.toLocaleString()} chars. review and save.`
          : "loaded — review and save.",
      );
    } catch (err: unknown) {
      logFailure("user-corpus", err);
      setError(err instanceof Error ? err.message : "couldn't read that file.");
      setFileName(null);
    } finally {
      setBusy(false);
      if (fileInput) fileInput.value = "";
    }
  };

  const remove = async (id: string): Promise<void> => {
    setError(null);
    setInfo(null);
    try {
      await props.onRemove(id);
    } catch (err: unknown) {
      logFailure("user-corpus", err);
      setError(err instanceof Error ? err.message : "couldn't delete passage");
    }
  };

  return (
    <main class="stage library">
      <header class="library__head">
        <h1 class="settings__title">Your library.</h1>
        <p class="field__hint">
          paste prose or upload a <code>.txt</code> / <code>.md</code>. everything stays local in
          your browser.
        </p>
      </header>

      <section class="library__add" aria-labelledby="sec-add">
        <h3 id="sec-add" class="label" style={{ "margin-bottom": "var(--space-3)" }}>
          add a passage
        </h3>

        <div class="field">
          <label class="field__label" for="lib-title">
            title (optional)
          </label>
          <input
            id="lib-title"
            class="field__input"
            type="text"
            value={title()}
            onInput={(e) => setTitle(e.currentTarget.value)}
            placeholder="e.g. Hemingway — Hills Like White Elephants"
            disabled={busy()}
          />
        </div>

        <div class="field">
          <label class="field__label" for="lib-text">
            text
          </label>
          <textarea
            id="lib-text"
            class="field__input library__textarea"
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
            placeholder="paste text here…"
            rows={8}
            disabled={busy()}
          />
        </div>

        <div class="field">
          <span class="field__label">or upload a file</span>
          <div class="library__file">
            <label
              class="btn library__file-btn"
              classList={{ "library__file-btn--disabled": busy() }}
              for="lib-file"
            >
              choose file
            </label>
            <input
              id="lib-file"
              ref={(el) => (fileInput = el)}
              class="sr-only"
              type="file"
              accept=".txt,.md,.markdown"
              onChange={(e) => void onFile(e)}
              disabled={busy()}
            />
            <span class="library__file-name">{fileName() ?? "no file chosen"}</span>
          </div>
          <p class="field__hint">
            <code>.txt</code> reads as-is. <code>.md</code> is stripped to its prose.
          </p>
        </div>

        <Show when={error()}>{(msg) => <p class="banner banner--error">{msg()}</p>}</Show>
        <Show when={info()}>{(msg) => <p class="banner banner--warn">{msg()}</p>}</Show>

        <div class="actions">
          <button
            type="button"
            class="btn btn--primary"
            disabled={busy() || text().length === 0}
            onClick={() => void submit()}
          >
            save passage
          </button>
          <button type="button" class="btn" onClick={() => props.onBack()}>
            back
          </button>
        </div>
      </section>

      <section class="library__list" aria-labelledby="sec-list">
        <h3 id="sec-list" class="label" style={{ "margin-bottom": "var(--space-3)" }}>
          your passages ({props.passages.length})
        </h3>
        <Show
          when={props.passages.length > 0}
          fallback={
            <p class="empty-note">nothing yet — paste or upload your first passage above.</p>
          }
        >
          <ul class="library__items">
            <For each={props.passages}>
              {(p) => (
                <li class="library__item">
                  <div class="library__item-body">
                    <div class="library__item-title">{p.title}</div>
                    <div class="library__item-meta">
                      {p.text.length.toLocaleString()} chars · added {formatTimestamp(p.createdAt)}
                    </div>
                    <div class="library__item-preview">{p.text.slice(0, 200)}…</div>
                  </div>
                  <button
                    type="button"
                    class="hint-button"
                    onClick={() => void remove(p.id)}
                    aria-label={`delete ${p.title}`}
                  >
                    delete
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>
    </main>
  );
}

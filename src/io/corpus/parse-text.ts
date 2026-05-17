/**
 * Extract plain text from a user-uploaded file or pasted string.
 *
 * Lazy-loads the `.md` parser so the `marked` dependency stays out of the
 * main bundle — it downloads only when the user actually picks an `.md`
 * file.
 */

export type FileKind = "txt" | "md";

export function inferFileKind(name: string): FileKind {
  const lower = name.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "md";
  return "txt";
}

/** Parse any supported file to plain text. */
export async function parseFile(file: File): Promise<string> {
  const kind = inferFileKind(file.name);
  if (kind === "txt") {
    return file.text();
  }
  // md
  const { parseMarkdown } = await import("./parse-markdown");
  return parseMarkdown(await file.text());
}

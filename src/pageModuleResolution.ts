/**
 * Resolving a page name to a module, for workspaces with no `register-pages.ts`.
 *
 * `this.create("SomePage")` names a class the calling file imports — `import
 * { SomePage } from "../primary/some-page.ts"` — so that file's own imports
 * say where the module lives, wherever it lives. The specifier is read from
 * the caller's source text rather than from its module graph, so the import
 * must be a *value* import: compilation erases a type-only one, and on the
 * QA Wolf runner it is the compiled file that executes. The
 * `require-value-import-for-created-page` lint rule enforces this at edit
 * time.
 *
 * A name no import binds does not resolve. There used to be a fallback to the
 * kebab-cased module beside the caller, but it could only ever find a page in
 * the caller's own directory — rescuing almost nothing while turning every
 * erased or missing import into a "works if the file happens to sit here"
 * lottery — so it was removed rather than left to mask a missing import.
 *
 * This is the fallback path only: a registered name never reaches it, so
 * registration always wins.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_EXTENSIONS = [".js", ".ts"] as const;

const EXTENSION_PATTERN = /\.[cm]?[jt]s$/;

/**
 * The specifier of the import that binds `name`, if the source has one.
 *
 * Matches only import statements at the start of a line, which is where module
 * syntax lives in practice, so a lazy clause match cannot run past the end of
 * its own statement. Covers `import type { X } from`, `import { type X } from`,
 * `import { X as Y } from` (matched on the imported name, which is the export
 * to read), a default binding, and a multi-line named list.
 */
export function importedSpecifier(
  name: string,
  source: string,
): string | undefined {
  const importPattern =
    /^[ \t]*import\s+(?:type\s+)?(\{[^{}]*\}|[A-Za-z_$][\w$]*(?:\s*,\s*\{[^{}]*\})?)\s+from\s*["']([^"']+)["']/gm;

  for (const [, clause = "", specifier] of source.matchAll(importPattern))
    if (specifier && boundNames(clause).includes(name)) return specifier;

  return undefined;
}

function boundNames(clause: string): string[] {
  const braceStart = clause.indexOf("{");
  const defaultBinding = (
    braceStart === -1 ? clause : clause.slice(0, braceStart)
  )
    .replace(/,\s*$/, "")
    .trim();

  const names = defaultBinding ? [defaultBinding] : [];
  if (braceStart === -1) return names;

  const named = clause.slice(braceStart + 1, clause.lastIndexOf("}"));
  for (const entry of named.split(",")) {
    const imported = entry
      .trim()
      .replace(/^type\s+/, "")
      .split(/\s+as\s+/)[0];
    if (imported) names.push(imported);
  }

  return names;
}

/**
 * File URLs to try for `name` from `callerUrl`: what the caller's import
 * points at, or nothing when no import binds the name.
 *
 * An import is followed only when it is relative or absolute — a bare
 * specifier belongs to the workspace's dependency resolution, not to this
 * file-path walk.
 */
export function moduleCandidates(name: string, callerUrl: string): string[] {
  const specifier = importedSpecifier(name, callerSource(callerUrl) ?? "");
  const isPathSpecifier =
    specifier?.startsWith(".") ||
    specifier?.startsWith("/") ||
    specifier?.startsWith("file:");

  if (!specifier || !isPathSpecifier) return [];

  const candidates = withExtensions(specifier, callerUrl);
  return candidates.filter((url, index) => candidates.indexOf(url) === index);
}

/**
 * The specifier as written, then with each known extension, so that a source
 * compiled to a different extension than it imports still resolves —
 * `"./some-page.js"` finds `some-page.ts` when TypeScript sources run directly.
 */
function withExtensions(specifier: string, callerUrl: string): string[] {
  const asWritten = new URL(specifier, callerUrl).href;
  const withoutExtension = asWritten.replace(EXTENSION_PATTERN, "");
  const written = EXTENSION_PATTERN.test(asWritten) ? [asWritten] : [];

  return [
    ...written,
    ...MODULE_EXTENSIONS.map((extension) => `${withoutExtension}${extension}`),
  ];
}

const sourceByUrl = new Map<string, string | undefined>();

function callerSource(callerUrl: string): string | undefined {
  if (!sourceByUrl.has(callerUrl))
    sourceByUrl.set(callerUrl, readIfPossible(callerUrl));

  return sourceByUrl.get(callerUrl);
}

function readIfPossible(url: string): string | undefined {
  try {
    return readFileSync(fileURLToPath(url), "utf8");
  } catch {
    // An unreadable caller — a virtual path, a deleted file — is not an error
    // here: resolution just falls back to the naming convention.
    return undefined;
  }
}

function isExistingFile(url: string): boolean {
  try {
    return existsSync(fileURLToPath(url));
  } catch {
    return false;
  }
}

export type PageModuleImport = {
  moduleNamespace: Record<string, unknown> | undefined;
  tried: string[];
  url: string | undefined;
};

/**
 * Imports the first candidate that exists, reporting every candidate so an
 * unresolved name can say what it looked for. Existence is checked before
 * importing so that a module-not-found thrown from *inside* the page object —
 * a bad import of its own — surfaces instead of being read as "no such page".
 */
export async function importPageModule(
  name: string,
  callerUrl: string,
): Promise<PageModuleImport> {
  const tried = moduleCandidates(name, callerUrl);
  const url = tried.find(isExistingFile);
  if (!url) return { moduleNamespace: undefined, tried, url: undefined };

  return {
    moduleNamespace: (await import(url)) as Record<string, unknown>,
    tried,
    url,
  };
}

/** Candidate URLs as paths relative to the caller, for error messages. */
export function describeCandidates(
  candidates: string[],
  callerUrl: string,
): string {
  const callerDirectory = dirname(fileURLToPath(callerUrl));

  return candidates
    .map((candidate) => {
      const path = relative(callerDirectory, fileURLToPath(candidate));
      return `"${path.startsWith(".") ? path : `./${path}`}"`;
    })
    .join(", ");
}

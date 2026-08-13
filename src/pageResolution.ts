/**
 * Page resolution — constructing a POM from its class name.
 *
 * `this.create("SomePage")` names a class the calling file has almost always
 * already imported for the return type, so that file's own imports say where
 * the module lives. A type-only import leaves nothing behind at runtime, so
 * the specifier comes from the caller's source text rather than from its
 * module graph; a name nothing imports falls back to the kebab-cased module
 * beside the caller. See `pageModuleResolution.ts` for both tiers.
 *
 * Importing the sibling and calling `SiblingPage.createFromPage(this.page)` is
 * equally supported and needs no name at all. Prefer it where the import is
 * already a value import.
 *
 * There is no page registry: hooks are contributed by the entry point itself
 * and through `PageSetupOptions.pageHooks` (see `entryPointPageObject.ts`), and
 * construction resolves through the caller. Nothing needs a name-keyed map.
 */
// This module intentionally does NOT import `BasePageObject` as a value —
// `basePageObject.ts` imports `createPageForCaller` from here, so importing it
// back would create a runtime cycle.
import type { Page } from "playwright";

import { callerFileUrl } from "./callerModule.js";
import type { PopupHandlerDef, RouteInterceptorDef } from "./pageHooks.js";
import {
  describeCandidates,
  importPageModule,
} from "./pageModuleResolution.js";

// Exported for the page-hook collector, which reads hook defs off instances it
// did not construct.
export type RegistrablePage = {
  popupHandlers(): PopupHandlerDef[];
  routeInterceptors(): RouteInterceptorDef[];
};

// Public: a workspace names these classes in `PageSetupOptions.pageHooks` to
// contribute page hooks (see index.ts).
export type PomClass = {
  createFromPage(page: Page): RegistrablePage;
  /** The class name, used to attribute a hook in duplicate-name errors. */
  name: string;
  prototype: RegistrablePage;
};

function isPomClass(value: unknown): value is PomClass {
  // Duck-type the static side: a PomClass constructor exposes the
  // `createFromPage` factory.
  return (
    typeof value === "function" &&
    "createFromPage" in value &&
    typeof value.createFromPage === "function"
  );
}

function assertIsPomClass(
  name: string,
  loaded: unknown,
  source: string,
): PomClass {
  if (isPomClass(loaded)) return loaded;

  throw Error(
    `${source} did not resolve to a page-object class: ` +
      `the loaded module must export "${name}" extending BasePageObject.`,
  );
}

/** Classes resolved from a calling file, keyed by that file and the page name. */
const classesByCaller = new Map<string, Promise<PomClass>>();

function unknownPageError(
  name: string,
  callerUrl: string | undefined,
  tried: string[],
): Error {
  if (!callerUrl) {
    return Error(
      `Unknown page: ${name}. The calling file could not be determined, so ` +
        `there are no imports to resolve it against — call ` +
        `${name}.createFromPage(this.page) instead.`,
    );
  }

  return Error(
    `Unknown page: ${name}. No module for it was found from ${callerUrl} ` +
      `(tried ${describeCandidates(tried, callerUrl)}). Import the class in ` +
      `that file, or call ${name}.createFromPage(this.page).`,
  );
}

async function resolvePageClass(
  name: string,
  callerUrl: string | undefined,
): Promise<PomClass> {
  if (!callerUrl) throw unknownPageError(name, callerUrl, []);

  const cacheKey = `${callerUrl}\u0000${name}`;
  const cached = classesByCaller.get(cacheKey);
  if (cached) return cached;

  const loading = importPageModule(name, callerUrl)
    .then(({ moduleNamespace, tried, url }) => {
      if (!moduleNamespace || !url)
        throw unknownPageError(name, callerUrl, tried);

      return assertIsPomClass(
        name,
        moduleNamespace[name] ?? moduleNamespace["default"],
        `The module "${url}" resolved for page "${name}"`,
      );
    })
    .catch((error: unknown) => {
      // Never memoize a rejection: a transient failure would otherwise poison
      // this name for the rest of the process.
      classesByCaller.delete(cacheKey);
      throw error;
    });

  classesByCaller.set(cacheKey, loading);
  return loading;
}

/**
 * Shared by `createPage` and `BasePageObject.create`, which each capture their
 * own caller: a name is resolved against the imports of the file that named
 * it, not against this package's.
 */
export async function createPageForCaller(
  name: string,
  page: Page,
  callerUrl: string | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- returns whichever page object the name resolves to
): Promise<any> {
  const cls = await resolvePageClass(name, callerUrl);
  return cls.createFromPage(page);
}

export async function createPage<TPageObject = RegistrablePage>(
  name: string,
  page: Page,
): Promise<TPageObject> {
  return createPageForCaller(
    name,
    page,
    callerFileUrl(1),
  ) as Promise<TPageObject>;
}

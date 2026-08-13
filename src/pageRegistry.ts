/**
 * Page Registry — POM classes stored by name. `register-pages.ts` calls
 * `registerPage`, `BasePageObject.create` calls `createPage`, and
 * `EntryPointPageObject.installPageHooks` calls
 * `getRegisteredPopupHandlers` / `getRegisteredRouteInterceptors`.
 *
 * Constructing by name is one of two options — a page object can equally
 * import a sibling and call `createFromPage` on it. Hook installation has two
 * alternatives as well: an entry point contributes its own hooks without
 * registering itself, and any POM class named in `PageSetupOptions.pageHooks`
 * contributes by value import. The registry remains the right answer when a
 * name is all the caller has, or when the module should stay out of the
 * caller's import graph until first use.
 *
 * Registration is eager (`registerPage("LoginPage", LoginPage)`) or lazy
 * (`registerPage("LoginPage", () => import("../pages/login-page.ts"))`). A
 * lazy module loads on first use and must export the class under the
 * registered name. Lazy registration keeps the barrel free of value imports.
 */
// This module intentionally does NOT import `BasePageObject` as a value —
// `basePageObject.ts` imports `createPage` from here, so importing it back
// would create a runtime cycle.
import type { Page } from "playwright";

import { callerFileUrl } from "./callerModule.js";
import type { RegisteredPages } from "./index.js";
import type { PopupHandlerDef, RouteInterceptorDef } from "./pageHooks.js";
import {
  describeCandidates,
  importPageModule,
} from "./pageModuleResolution.js";

// Exported for the sibling page-hook collector, which reads hook defs off
// instances it did not construct.
export type RegistrablePage = {
  popupHandlers(): PopupHandlerDef[];
  routeInterceptors(): RouteInterceptorDef[];
};

// Public: a workspace names these classes in `PageSetupOptions.pageHooks` to
// contribute page hooks without registering them (see index.ts).
export type PomClass = {
  createFromPage(page: Page): RegistrablePage;
  /** The class name, used to attribute a hook in duplicate-name errors. */
  name: string;
  prototype: RegistrablePage;
};

/**
 * Loads the module that exports the registered class, e.g.
 * `() => import("../pages/login-page.ts")`. The module must export the class
 * under the registered `name`; `PomModuleLoader<TName>` ties the two together
 * so a mismatched import — `registerPage("LoginPage", () => import("./other.js"))`
 * — is a compile error.
 */
export type PomModuleLoader<TName extends string = string> = () => Promise<
  Record<TName, PomClass>
>;

export type RegisterPageOptions = {
  /**
   * Pass `false` when the POM declares no `popupHandlers()` /
   * `routeInterceptors()` overrides, so page-hook installation can skip
   * loading its module. Omit when unsure — unflagged lazy entries are
   * loaded and inspected at hook-install time, which is always correct.
   */
  providesPageHooks: boolean;
};

export type RegistryEntry =
  | { cls: PomClass; kind: "eager" }
  | {
      kind: "lazy";
      loader: PomModuleLoader;
      loading: Promise<PomClass> | undefined;
      providesPageHooks: boolean | undefined;
    };

export const entries: Record<string, RegistryEntry> = {};

function isPomClass(value: unknown): value is PomClass {
  // Duck-type the static side: a PomClass constructor exposes the
  // `createFromPage` factory, a PomModuleLoader is a plain function without it.
  return (
    typeof value === "function" &&
    "createFromPage" in value &&
    typeof value.createFromPage === "function"
  );
}

export function registerPage<TName extends string>(
  name: TName,
  classOrLoader: PomClass | PomModuleLoader<TName>,
  options?: RegisterPageOptions,
): void;
export function registerPage(
  name: string,
  classOrLoader: PomClass | PomModuleLoader,
  options?: RegisterPageOptions,
): void {
  if (entries[name]) throw Error(`Page "${name}" is already registered.`);

  if (isPomClass(classOrLoader)) {
    assertHookFlagMatchesClass(name, options?.providesPageHooks, classOrLoader);
    entries[name] = { cls: classOrLoader, kind: "eager" };
    return;
  }

  entries[name] = {
    kind: "lazy",
    loader: classOrLoader,
    loading: undefined,
    providesPageHooks: options?.providesPageHooks,
  };
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

export function classDeclaresPageHooks(cls: PomClass): boolean {
  return (
    Object.hasOwn(cls.prototype, "popupHandlers") ||
    Object.hasOwn(cls.prototype, "routeInterceptors")
  );
}

/**
 * `providesPageHooks: false` promises hook installation it can skip loading
 * this module. If the POM declares a `popupHandlers()` /
 * `routeInterceptors()` override anyway, its hooks would silently never
 * install (popups stop being dismissed, with no error). Surface that
 * contradiction as early as possible: at registration for eager classes, on
 * first load for lazy ones.
 */
function assertHookFlagMatchesClass(
  name: string,
  providesPageHooks: boolean | undefined,
  cls: PomClass,
): void {
  if (providesPageHooks !== false) return;
  if (!classDeclaresPageHooks(cls)) return;

  throw Error(
    `Page "${name}" was registered with { providesPageHooks: false } but its ` +
      `class declares popupHandlers()/routeInterceptors(). Drop the flag so ` +
      `its page hooks are installed.`,
  );
}

export async function loadPageClass(
  name: string,
  entry: Extract<RegistryEntry, { kind: "lazy" }>,
): Promise<PomClass> {
  entry.loading ??= entry
    .loader()
    .then((moduleNamespace) => {
      const cls = assertIsPomClass(
        name,
        moduleNamespace[name],
        `Lazy registration for page "${name}"`,
      );
      assertHookFlagMatchesClass(name, entry.providesPageHooks, cls);
      return cls;
    })
    .catch((error: unknown) => {
      // Never memoize a rejection: a transient loader failure would otherwise
      // poison this page name for the rest of the process. Clearing lets the
      // next createPage / hook-install call retry the import.
      entry.loading = undefined;
      throw error;
    });
  return entry.loading;
}

/**
 * Classes resolved from a calling file, keyed by that file and the page name.
 * Kept out of `entries` so that resolving a page never registers it:
 * registration stays the single source of truth for duplicate detection and
 * for the page hooks that `installPageHooks` collects.
 */
const classesByCaller = new Map<string, Promise<PomClass>>();

function unknownPageError(
  name: string,
  callerUrl: string | undefined,
  tried: string[],
): Error {
  if (!callerUrl)
    return Error(`Unknown page: ${name}. Was register-pages.ts imported?`);

  return Error(
    `Unknown page: ${name}. No page is registered under that name, and no ` +
      `module for it was found from ${callerUrl} (tried ` +
      `${describeCandidates(tried, callerUrl)}). Import the class in that ` +
      `file, register the page in register-pages.ts, or call ` +
      `${name}.createFromPage(this.page).`,
  );
}

/**
 * Falls back to the module the calling file imports under `name` — or, failing
 * that, the one named for it by convention — when a name was never registered,
 * so `this.create("SomePage")` still works in a workspace with no
 * `register-pages.ts`.
 */
async function resolvePageClassFromCaller(
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
      // Same reasoning as the lazy-entry cache: a memoized rejection would
      // poison this name for the rest of the process.
      classesByCaller.delete(cacheKey);
      throw error;
    });

  classesByCaller.set(cacheKey, loading);
  return loading;
}

async function resolvePageClass(
  name: string,
  callerUrl: string | undefined,
): Promise<PomClass> {
  const entry = entries[name];
  if (!entry) return resolvePageClassFromCaller(name, callerUrl);

  return entry.kind === "eager" ? entry.cls : loadPageClass(name, entry);
}

/**
 * Shared by `createPage` and `BasePageObject.create`, which each capture their
 * own caller: an unregistered name is resolved against the imports of the file
 * that named it, not against this package's.
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

export async function createPage<TName extends keyof RegisteredPages & string>(
  name: TName,
  page: Page,
): Promise<RegisteredPages[TName]>;
export async function createPage<TPageObject = RegistrablePage>(
  name: string,
  page: Page,
): Promise<TPageObject>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- implementation of the overloads above
export async function createPage(name: string, page: Page): Promise<any> {
  return createPageForCaller(name, page, callerFileUrl(1));
}

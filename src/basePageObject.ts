import type { Locator, Page } from "playwright";

import { callerFileUrl } from "./callerModule.js";
import type { PopupHandlerDef, RouteInterceptorDef } from "./pageHooks.js";
import {
  describeCandidates,
  importPageModule,
} from "./pageModuleResolution.js";

export type BaselineScreenshotFn = (
  target: Page | Locator,
  name: string,
  options?: Record<string, unknown>,
) => Promise<void>;

/** The hook-contribution surface every page object carries; what the entry
 *  point's page-hook collector reads off instances it did not construct. */
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

export abstract class BasePageObject {
  protected page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Factory used by name resolution, by page-hook collection, and by a page
   * object constructing a sibling it imported directly.
   */
  static createFromPage<TPageObject extends BasePageObject>(
    this: new (page: Page) => TPageObject,
    page: Page,
  ): TPageObject {
    return new this(page);
  }

  /**
   * Popups owned by this POM that should be auto-dismissed when the entry
   * point installs page hooks. Override in subclasses that own popups, then
   * name the class in `installPageHooks({ pageHooks: [ThisPage] })` — an entry
   * point's own override is picked up without naming it.
   *
   * Inherited overrides are NOT picked up: the own-property check means a
   * subclass must declare `popupHandlers()` itself to contribute.
   *
   * Override bodies typically read from `this.locators` / `this.dynamicLocators`.
   */
  popupHandlers(): PopupHandlerDef[] {
    return [];
  }

  /**
   * Route interceptors owned by this POM that should be installed when the
   * entry point installs page hooks. Contributed the same way as
   * `popupHandlers` (own-property check — inherited overrides are not picked
   * up).
   */
  routeInterceptors(): RouteInterceptorDef[] {
    return [];
  }

  /**
   * Construct a sibling POM by class name, sharing this page instance. Async
   * because the sibling's module is imported on first use.
   *
   * The name is resolved through the calling file's own imports, so
   * `create("SomePage")` finds whatever that file imports `SomePage` from —
   * `import type { SomePage } from "../primary/some-page.ts"` included, since
   * the specifier is read from the source rather than the module graph. That
   * type-only import is what keeps two page objects referring to each other
   * free of a runtime cycle. A name nothing imports falls back to the
   * kebab-cased module beside the caller, `./some-page.js`. See
   * `pageModuleResolution.ts` for both tiers.
   *
   * Importing the sibling and calling `SiblingPage.createFromPage(this.page)`
   * is equally supported and needs no return-type annotation. Prefer it where
   * the import is already a value import.
   *
   * The return type comes from the call's context — a method annotated
   * `Promise<NextPage>` infers it — or from an explicit generic,
   * `this.create<NextPage>("NextPage")`. It otherwise defaults to
   * `BasePageObject`.
   */
  protected create<TPageObject extends BasePageObject = BasePageObject>(
    name: string,
  ): Promise<TPageObject>;
  protected async create(name: string): Promise<BasePageObject> {
    // Depth 1 is the page-object method that called `create`, whose imports
    // (and directory, for the kebab-case fallback) resolve the name.
    const cls = await resolvePageClass(name, callerFileUrl(1));
    // Trusted per `assertIsPomClass`: the resolved class builds page objects,
    // even when it extends a duplicated copy of this base class.
    return cls.createFromPage(this.page) as BasePageObject;
  }
}

function isPomClass(value: unknown): value is PomClass {
  // Duck-type the static side rather than checking `prototype instanceof
  // BasePageObject`: a workspace with a duplicated copy of this package loads
  // classes extending a *different* `BasePageObject` identity, which are still
  // perfectly good page objects. Structural is the safer contract for classes
  // loaded across a package boundary.
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

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

/** What hook collection reads off a page object it did not construct. */
export type RegistrablePage = {
  popupHandlers(): PopupHandlerDef[];
  routeInterceptors(): RouteInterceptorDef[];
};

/**
 * The static side of a page-object class: what `create("Name")` resolves to,
 * and what a workspace names in `PageSetupOptions.pageHooks`. Structural
 * rather than `typeof BasePageObject` because a workspace with a duplicated
 * copy of this package loads classes extending a *different* `BasePageObject`
 * identity, which are still perfectly good page objects.
 */
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
   * Factory used by `create`, by page-hook collection, and by a page object
   * constructing a sibling it imported directly.
   */
  static createFromPage<TPageObject extends BasePageObject>(
    this: new (page: Page) => TPageObject,
    page: Page,
  ): TPageObject {
    return new this(page);
  }

  /**
   * Popups owned by this POM that should be auto-dismissed when the entry
   * point installs page hooks. Override in subclasses that own popups, and
   * contribute the class through `PageSetupOptions.pageHooks` — an entry
   * point contributes its own overrides automatically. Overrides are detected
   * with an own-property check on the class's prototype, so inherited
   * overrides are NOT picked up: declare `popupHandlers()` directly on the
   * class that owns the popup.
   *
   * Override bodies typically read from `this.locators` / `this.dynamicLocators`.
   */
  popupHandlers(): PopupHandlerDef[] {
    return [];
  }

  /**
   * Route interceptors owned by this POM that should be installed when the
   * entry point installs page hooks. Override in subclasses and contribute the
   * class the same way as for `popupHandlers` (own-property check — inherited
   * overrides are not picked up).
   */
  routeInterceptors(): RouteInterceptorDef[] {
    return [];
  }

  /**
   * Construct a sibling POM, sharing this page instance. Pass the class where
   * you can — `this.create(DashboardPage)` — and its name only when a name
   * is all you have.
   *
   * The class form needs no return-type annotation and no runtime name
   * resolution: the type is inferred from the class, so there is no second
   * mention of the name to drift from the first. It also turns a type-only
   * import into a compile error (TS1361), where the name form only fails on
   * the runner. Two page objects that import each other is fine.
   * Construction is synchronous, but the result is a promise so the two forms
   * are interchangeable at a call site.
   *
   * The name form is resolved through the calling file's own imports, so
   * `create("SomePage")` finds whatever that file imports `SomePage` from.
   * The import must be a *value* import — `import { SomePage } from
   * "../primary/some-page.ts"` — because the specifier is read from the
   * executing file's source, and compilation erases a type-only import
   * (the `require-value-import-for-created-page` lint rule catches this).
   * A name nothing imports does not resolve. Async because the sibling's
   * module is imported on first use.
   *
   * The name form's return type comes from an explicit generic —
   * `this.create<NextPage>("NextPage")` — and otherwise defaults to
   * `BasePageObject`. Nothing checks that the generic and the name agree,
   * which is the other reason to prefer the class form.
   */
  protected create<TPageObject extends BasePageObject>(
    PageClass: new (page: Page) => TPageObject,
  ): Promise<TPageObject>;
  protected create<TPageObject extends BasePageObject = BasePageObject>(
    name: string,
  ): Promise<TPageObject>;
  protected create(
    nameOrClass: string | (new (page: Page) => BasePageObject),
  ): Promise<BasePageObject> {
    // A class needs no lookup at all; only a name is resolved. Not `async`, so
    // the stack `callerFileUrl` reads below is the same as before.
    if (typeof nameOrClass === "function")
      return Promise.resolve(new nameOrClass(this.page));

    // Depth 1 is the page-object method that called `create`, whose imports
    // are what the name is resolved through.
    return createPageForCaller(nameOrClass, this.page, callerFileUrl(1));
  }
}

function isPomClass(value: unknown): value is PomClass {
  // Duck-type the static side rather than checking `prototype instanceof
  // BasePageObject`: see `PomClass` for why structural is the safer contract.
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
  const passTheClass = `or pass the class instead: this.create(${name})`;

  if (!callerUrl) {
    return Error(
      `Unknown page: ${name}. The calling file could not be determined, so ` +
        `there are no imports to resolve it against — pass the class ` +
        `instead: this.create(${name}).`,
    );
  }

  if (tried.length === 0) {
    return Error(
      `Unknown page: ${name}. ${callerUrl} has no import that binds it, ` +
        `which is how a name is resolved. Add a value import of the class ` +
        `in that file (a type-only import is erased by compilation and ` +
        `cannot be followed), ${passTheClass}.`,
    );
  }

  return Error(
    `Unknown page: ${name}. No module for it was found from ${callerUrl} ` +
      `(tried ${describeCandidates(tried, callerUrl)}). Import the class in ` +
      `that file, ${passTheClass}.`,
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
 * Resolves `name` against the imports of the file at `callerUrl` and
 * constructs it. `create` captures its own caller; tests exercise resolution
 * from a synthetic one.
 */
export async function createPageForCaller(
  name: string,
  page: Page,
  callerUrl: string | undefined,
): Promise<BasePageObject> {
  const cls = await resolvePageClass(name, callerUrl);
  // Trusted per `assertIsPomClass`: the resolved class builds page objects,
  // even when it extends a duplicated copy of this base class.
  return cls.createFromPage(page) as BasePageObject;
}

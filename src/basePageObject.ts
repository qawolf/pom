import type { Locator, Page } from "playwright";

import { callerFileUrl } from "./callerModule.js";
import {
  describeCandidates,
  importPageModule,
} from "./pageModuleResolution.js";

export type BaselineScreenshotFn = (
  target: Page | Locator,
  name: string,
  options?: Record<string, unknown>,
) => Promise<void>;

/**
 * The static side of a page-object class, as `create("Name")` resolves it.
 * Structural rather than `typeof BasePageObject` because a workspace with a
 * duplicated copy of this package loads classes extending a *different*
 * `BasePageObject` identity, which are still perfectly good page objects.
 */
export type PomClass = {
  createFromPage(page: Page, options?: CreateOptions): object | Promise<object>;
};

/** How `createFromPage` and `create` construct a page object. */
export type CreateOptions = {
  /**
   * Await the instance's `waitForReady` before handing it back, so the call
   * that builds the next page does not resolve until that page is usable.
   * Defaults to `true`; pass `false` to construct without waiting.
   */
  waitForReady?: boolean;
};

export abstract class BasePageObject {
  protected page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Factory used by `create`, and by a page object constructing a sibling it
   * imported directly. Awaits the new instance's `waitForReady` unless
   * `options.waitForReady` is `false`.
   */
  static async createFromPage<TPageObject extends BasePageObject>(
    this: new (page: Page) => TPageObject,
    page: Page,
    options: CreateOptions = {},
  ): Promise<TPageObject> {
    return BasePageObject.readyInstance(new this(page), options);
  }

  /**
   * The instance, once its `waitForReady` has resolved — or at once when the
   * caller opted out. Static so `create` can stay non-`async` (see the stack
   * note there) while still returning a single promise.
   */
  private static async readyInstance<TPageObject extends BasePageObject>(
    instance: TPageObject,
    { waitForReady = true }: CreateOptions,
  ): Promise<TPageObject> {
    if (waitForReady) await instance.waitForReady();
    return instance;
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
   *
   * Either form awaits the sibling's `waitForReady` before resolving, so
   * `return this.create(NextPage)` is the whole hand-off. Pass
   * `{ waitForReady: false }` to skip it.
   */
  protected create<TPageObject extends BasePageObject>(
    PageClass: new (page: Page) => TPageObject,
    options?: CreateOptions,
  ): Promise<TPageObject>;
  protected create<TPageObject extends BasePageObject = BasePageObject>(
    name: string,
    options?: CreateOptions,
  ): Promise<TPageObject>;
  protected create(
    nameOrClass: string | (new (page: Page) => BasePageObject),
    options: CreateOptions = {},
  ): Promise<BasePageObject> {
    // A class needs no lookup at all; only a name is resolved. Not `async`, so
    // the stack `callerFileUrl` reads below is the same as before.
    if (typeof nameOrClass === "function")
      return BasePageObject.readyInstance(new nameOrClass(this.page), options);

    // Depth 1 is the page-object method that called `create`, whose imports
    // are what the name is resolved through.
    return createPageForCaller({
      callerUrl: callerFileUrl(1),
      name: nameOrClass,
      options,
      page: this.page,
    });
  }

  /**
   * Resolves once this page object is usable: its first row rendered, its
   * loading indicator gone, whatever "loaded" means for the page. `create`
   * and `createFromPage` await it before handing the instance back, so the
   * method that clicks into a page returns only once that page is ready and
   * no caller has to remember a separate wait. The default resolves at once;
   * override it on pages that need one.
   *
   * Runs against the instance before any other method does, so it should
   * only observe the page — a wait, not an action.
   */
  protected async waitForReady(): Promise<void> {}
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
export async function createPageForCaller({
  callerUrl,
  name,
  options = {},
  page,
}: {
  callerUrl: string | undefined;
  name: string;
  options?: CreateOptions;
  page: Page;
}): Promise<BasePageObject> {
  const cls = await resolvePageClass(name, callerUrl);
  // Trusted per `assertIsPomClass`: the resolved class builds page objects,
  // even when it extends a duplicated copy of this base class. That copy may
  // predate the async factory and return the instance directly, which the
  // `await` absorbs.
  return (await cls.createFromPage(page, options)) as BasePageObject;
}

import type { Locator, Page } from "playwright";

import { callerFileUrl } from "./callerModule.js";
import type { PopupHandlerDef, RouteInterceptorDef } from "./pageHooks.js";
import { createPageForCaller } from "./pageResolution.js";

export type BaselineScreenshotFn = (
  target: Page | Locator,
  name: string,
  options?: Record<string, unknown>,
) => Promise<void>;

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
   * kebab-cased module beside the caller, `./some-page.js`.
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
  protected create(name: string): Promise<BasePageObject> {
    // Depth 1 is the page-object method that called `create`, whose directory
    // is where an unregistered sibling module is looked for.
    return createPageForCaller(name, this.page, callerFileUrl(1));
  }
}

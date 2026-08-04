import type { Locator, Page } from "playwright";

import type { RegisteredPages } from "./index.js";
import type { PopupHandlerDef, RouteInterceptorDef } from "./pageHooks.js";
import { createPage } from "./pageRegistry.js";

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
   * Factory used by the page registry, and by a page object constructing a
   * sibling it imported directly.
   */
  static createFromPage<TPageObject extends BasePageObject>(
    this: new (page: Page) => TPageObject,
    page: Page,
  ): TPageObject {
    return new this(page);
  }

  /**
   * Popups owned by this POM that should be auto-dismissed when the entry
   * point installs page hooks. Override in subclasses that own popups; the
   * page registry detects the override via an own-property check on the
   * registered class's prototype at registration time, so no extra wiring is
   * needed in `register-pages.ts`. Inherited overrides are NOT picked up —
   * declare `popupHandlers()` directly on the class you register (see
   * `pageRegistry.ts` for details).
   *
   * Override bodies typically read from `this.locators` / `this.dynamicLocators`.
   */
  popupHandlers(): PopupHandlerDef[] {
    return [];
  }

  /**
   * Route interceptors owned by this POM that should be installed when the
   * entry point installs page hooks. Override in subclasses; the page
   * registry auto-detects the override the same way it does for
   * `popupHandlers` (own-property check on the registered class's
   * prototype — inherited overrides are not picked up).
   */
  routeInterceptors(): RouteInterceptorDef[] {
    return [];
  }

  /**
   * Construct a sibling POM by its registered name, sharing this page
   * instance. Async because a lazily registered module loads on first use.
   *
   * Importing the sibling and calling `SiblingPage.createFromPage(this.page)`
   * is equally supported, and needs no registry entry and no return-type
   * annotation — two page objects that import each other is fine. Reach for
   * the registry when the sibling's module should stay out of this file's
   * import graph until first use, or when a name is all you have.
   *
   * When the workspace's `register-pages.ts` augments `RegisteredPages`,
   * names in the map return their page-object type without an annotation;
   * other names default to `BasePageObject`, so annotate the call —
   * `this.create<NextPage>("NextPage")` — for a more specific type.
   */
  protected create<TName extends keyof RegisteredPages & string>(
    name: TName,
  ): Promise<RegisteredPages[TName]>;
  protected create<TPageObject extends BasePageObject = BasePageObject>(
    name: string,
  ): Promise<TPageObject>;
  protected create(name: string): Promise<BasePageObject> {
    return createPage<BasePageObject>(name, this.page);
  }
}

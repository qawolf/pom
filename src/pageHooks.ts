import type { Locator, Page, Route } from "playwright";

// Type-only, so the cycle with `entryPointPageObject.ts` (which imports the
// hook types from here) is erased at runtime.
import type { InitializeBrowserOptions } from "./entryPointPageObject.js";
import type { NetworkMonitor } from "./networkMonitor.js";
import type { PopupHandler } from "./popupHandler.js";

/**
 * A popup to dismiss automatically on every page of a browser context.
 *
 * Declared statically on an entry point (`static popupHandlers()`) or passed
 * to `initializeBrowser` by a flow, so it holds no page of its own: `trigger`
 * and `dismiss` are built against whichever page the popup appears on.
 */
export type PopupHandlerDef = {
  /** CSS selector of the popup's root element(s). With one, the popup is
   *  hidden by a `<style>` tag injected into every page of the context before
   *  any navigation (the CSS-injection shield), which cannot deadlock the way
   *  a reactive `addLocatorHandler` can when overlays stack. Without one, the
   *  popup falls back to `addLocatorHandler` on each page. */
  readonly cssSelector?: string;
  /** Dismiss the popup on `page`. Called by the `addLocatorHandler` fallback
   *  and by a flow-owned `PopupHandler`. */
  readonly dismiss: (page: Page) => Promise<void>;
  readonly name: string;
  /** The popup on `page`, for the `addLocatorHandler` fallback and a
   *  flow-owned `PopupHandler`. */
  readonly trigger: (page: Page) => Locator;
};

/** A route to intercept on every page of a browser context. */
export type RouteInterceptorDef = {
  readonly handler: (route: Route) => Promise<void>;
  readonly name: string;
  readonly pattern: string;
};

/**
 * A flow's adjustments to the page hooks its entry point declares. The
 * declared hooks are the default; most flows pass nothing here.
 *
 * Resolution: the declared hooks minus `allowPopups` / `allowRoutes`, then
 * the flow's own `popupHandlers` / `routeInterceptors` on top, a same-named
 * one replacing the declared one. A flow's own hook is therefore installed
 * even if its name is also allowed — the explicit addition wins.
 */
export type PageHookOptions = {
  /** Let these popups show: skip the entry point's handlers by name, or
   *  `"all"` of them — for a flow that tests the cookie banner itself. */
  allowPopups?: string[] | "all";
  /** Let these requests through: skip the entry point's interceptors by name,
   *  or `"all"` of them. */
  allowRoutes?: string[] | "all";
  /** Flow-owned popup handler. Every popup is registered through it on the
   *  entry point's page, and the CSS-injection shield stays out of the way. */
  handler?: PopupHandler;
  /** Flow-owned network monitor, installed on the entry point's page. `null`
   *  stays accepted because existing flow code passes `monitor: null`. */
  monitor?: NetworkMonitor | null;
  /** Popups for this flow only, on top of the entry point's. */
  popupHandlers?: PopupHandlerDef[];
  /** Route interceptors for this flow only, on top of the entry point's. */
  routeInterceptors?: RouteInterceptorDef[];
};

/** Options passed to an entry point's `create()`. */
export type PageSetupOptions = InitializeBrowserOptions & {
  /** Custom URL to navigate to instead of the default. */
  url?: string;
};

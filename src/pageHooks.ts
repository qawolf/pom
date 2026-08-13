import type { Locator, Route } from "playwright";

import type { NetworkMonitor } from "./networkMonitor.js";
// Type-only, so the cycle with `pageRegistry.ts` (which imports the hook def
// types from here) is erased at runtime.
import type { PomClass } from "./pageRegistry.js";
import type { PopupHandler } from "./popupHandler.js";

/** Popup definition declared by the POM (what popups exist on this page). */
export type PopupHandlerDef = {
  /** CSS selector targeting this popup's root element(s). Used by the default
   *  CSS-injection popup shield — if provided, popups are hidden via a <style>
   *  tag injected by addInitScript instead of reactive addLocatorHandler. */
  readonly cssSelector?: string;
  readonly dismiss: () => Promise<void>;
  readonly name: string;
  readonly trigger: Locator;
};

/** Route interceptor declared by the POM. */
export type RouteInterceptorDef = {
  readonly handler: (route: Route) => Promise<void>;
  readonly name: string;
  readonly pattern: string;
};

/** Options passed to entry point create() methods. */
export type PageSetupOptions = {
  /** Skip these POM-defined popup handlers by name. */
  allowPopups?: string[];
  /** Skip these POM-defined route interceptors by name. */
  allowRoutes?: string[];
  /** Flow-owned popup handler — POM registers its popups through it. */
  handler?: PopupHandler;
  /** Flow-owned network monitor — installed on the page for HTTP error
   *  tracking. `null` stays accepted because existing flow code passes
   *  `monitor: null` explicitly. */
  monitor?: NetworkMonitor | null;
  /** POM classes contributing page hooks by value import rather than by
   *  registry lookup. Each is constructed against the entry point's page via
   *  `createFromPage`, exactly as a registered class would be.
   *
   *  A class listed here that declares no `popupHandlers()` /
   *  `routeInterceptors()` override contributes nothing, and one the registry
   *  already walked contributes once rather than twice. */
  pageHooks?: PomClass[];
  permissions?: string[];
  proxy?: {
    password?: string;
    server: string;
    username?: string;
  };
  /** Slow down each Playwright operation by this many ms (debugging aid). */
  slowMo?: number;
  /** Custom URL to navigate to instead of the default. */
  url?: string;
};

import type { Locator, Route } from "playwright";

// Type-only, so the cycle with `basePageObject.ts` (which imports the hook
// def types from here) is erased at runtime.
import type { PomClass } from "./basePageObject.js";
import type { NetworkMonitor } from "./networkMonitor.js";
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
  /** POM classes whose page hooks the entry point should install, passed as
   *  value imports at the call site. Each is constructed against the entry
   *  point's page via `createFromPage`.
   *
   *  A class listed here that declares no `popupHandlers()` /
   *  `routeInterceptors()` override contributes nothing, and a class listed
   *  twice — or that is also the entry point itself — contributes once. */
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

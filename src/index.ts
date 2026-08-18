/**
 * Map of page-object types keyed by the name passed to `registerPage`.
 *
 * Empty by default. A workspace opts into typed `this.create("ClassName")`
 * by augmenting it from its generated `register-pages.ts`:
 *
 *   declare module "@qawolf/pom" {
 *     interface RegisteredPages {
 *       LoginPage: LoginPage;
 *     }
 *   }
 *
 * `this.create("LoginPage")` then returns `LoginPage` without a type
 * annotation. Names missing from the map keep the untyped fallback, so the
 * map can be adopted incrementally.
 *
 * The interface is declared here (in the package entry module, not in
 * `pageRegistry.ts`) because TypeScript module augmentation only merges with
 * interfaces declared directly in the augmented module — an augmentation of
 * "@qawolf/pom" would not reach an interface that is merely re-exported.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions, @typescript-eslint/no-empty-object-type, @typescript-eslint/no-empty-interface -- must be an empty interface: workspaces add entries via `declare module` augmentation, and only interfaces merge
export interface RegisteredPages {}

export { type BaselineScreenshotFn, BasePageObject } from "./basePageObject.js";
export {
  type ReportCleanupFailedParams,
  reportCleanupFailed,
  reportCleanupFailure,
} from "./cleanupUtils.js";
export {
  type InitializeBrowserOptions,
  EntryPointPageObject,
} from "./entryPointPageObject.js";
export { type NetworkError, NetworkMonitor } from "./networkMonitor.js";
export type {
  PageSetupOptions,
  PopupHandlerDef,
  RouteInterceptorDef,
} from "./pageHooks.js";
export {
  type PomModuleLoader,
  type RegisterPageOptions,
  createPage,
  registerPage,
} from "./pageRegistry.js";
export { callPlatformAPI } from "./platformClient.js";
export { PopupHandler } from "./popupHandler.js";
export type { SequencePromise } from "./sequence.js";
export { SubPageObject } from "./subPageObject.js";
export {
  assertPricesClose,
  moneyToNumber,
  numberToMoney,
} from "./testDataUtilities.js";

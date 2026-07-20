/**
 * Build the addInitScript source for the default popup shield.
 *
 * Injects a MutationObserver that hides overlay/popup elements via inline
 * styles. Inline !important always beats stylesheet !important (regardless of
 * specificity or load order), so page CSS can never override this shield.
 * Runs before any page JS on every navigation — deadlock-free, unlike
 * addLocatorHandler (see `EntryPointPageObject.installPageHooks`).
 */
export function buildPopupShieldInitScript(cssSelectors: string[]): string {
  const selectorList = cssSelectors.join(", ");
  const escaped = JSON.stringify(selectorList);
  return `
         (function() {
           var SELECTOR = ${escaped};
           function hideMatches() {
             document.querySelectorAll(SELECTOR).forEach(function(el) {
               if (el.dataset.__qawHidden) return;
               el.dataset.__qawHidden = '1';
               el.style.setProperty('display', 'none', 'important');
               el.style.setProperty('pointer-events', 'none', 'important');
               el.style.setProperty('visibility', 'hidden', 'important');
             });
           }
           // Use MutationObserver to hide overlays immediately when they appear.
           // The data-marker prevents re-trigger loops (skip already-hidden elements).
           var observer = new MutationObserver(function(mutations) {
             for (var i = 0; i < mutations.length; i++) {
               if (mutations[i].addedNodes.length > 0) { hideMatches(); return; }
             }
           });
           hideMatches();
           function startObserver() {
             observer.observe(document.documentElement, { childList: true, subtree: true });
             hideMatches();
           }
           if (document.readyState === 'loading') {
             document.addEventListener('DOMContentLoaded', startObserver);
           } else {
             startObserver();
           }
         })();
       `;
}

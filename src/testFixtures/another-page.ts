import { BasePageObject } from "../basePageObject.js";

// Gives resolution a candidate it could follow (the source text is what is
// read, and here the .ts executes); the registry must still beat it (see
// createOverride).
import type { OverridePage } from "./override-page.js";
import type { ImportedPage } from "./primary/imported-page.js";

/**
 * A page object as an old workspace writes one, with no `register-pages.ts`.
 * The `ImportedPage` import is type-only, which still resolves when the `.ts`
 * source itself executes (as under jest): the specifier is read from the
 * source text, where the import is physically present. It is banned by lint
 * because compiled output erases it. `SomePage` is named but never imported,
 * which does not resolve at all.
 */
export class AnotherPage extends BasePageObject {
  async createMissingPage(): Promise<BasePageObject> {
    return this.create("NoSuchPage");
  }

  /** The value import above resolves this, but registration must win. */
  async createOverride(): Promise<OverridePage> {
    return this.create("OverridePage");
  }

  /** Resolved through the import above, which points outside this directory. */
  async goToImported(): Promise<ImportedPage> {
    return this.create("ImportedPage");
  }

  /** Named but never imported, so nothing can resolve it. */
  async goToUnimported(): Promise<BasePageObject> {
    return this.create("SomePage");
  }
}

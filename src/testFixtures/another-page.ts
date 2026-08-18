import { BasePageObject } from "../basePageObject.js";

import type { ImportedPage } from "./primary/imported-page.js";

/**
 * A page object that names its siblings instead of importing them as values.
 * The imports here are type-only, so nothing loads those modules before
 * `create` resolves them.
 */
export class AnotherPage extends BasePageObject {
  async createMissingPage(): Promise<BasePageObject> {
    return this.create("NoSuchPage");
  }

  /** Resolved through the import above, which points outside this directory. */
  async goToImported(): Promise<ImportedPage> {
    return this.create("ImportedPage");
  }

  /** Named but never imported, so only the naming convention can find it. */
  async goToUnimported(): Promise<BasePageObject> {
    return this.create("SomePage");
  }
}

import { BasePageObject } from "../basePageObject.js";

import type { SomePage } from "./some-page.js";

/**
 * A page object as an old workspace writes one: it names its siblings instead
 * of importing them as values, and the workspace has no `register-pages.ts`.
 * `some-page.js` is imported for its type only, so nothing loads that module
 * before `create` resolves it.
 */
export class AnotherPage extends BasePageObject {
  async createMissingSibling(): Promise<BasePageObject> {
    return this.create("NoSuchPage");
  }

  async createOverride(): Promise<BasePageObject> {
    return this.create("OverridePage");
  }

  async doSomething(): Promise<SomePage> {
    return this.create("SomePage");
  }
}

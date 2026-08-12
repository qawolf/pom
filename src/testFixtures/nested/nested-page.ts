import { BasePageObject } from "../../basePageObject.js";
import type { SomePage } from "../some-page.js";

/**
 * The shape this resolution exists for: the class is named as a string and
 * imported only for the return type, from another directory. A `some-page.ts`
 * sitting next to this file must not win over that import.
 */
export class NestedPage extends BasePageObject {
  async doSomething(): Promise<SomePage> {
    return this.create("SomePage");
  }
}

import { BasePageObject } from "../../basePageObject.js";

/**
 * A decoy: the name-based convention would pick this file, but `nested-page.ts`
 * imports `SomePage` from the parent directory, and the import wins.
 */
export class SomePage extends BasePageObject {
  get origin() {
    return "testFixtures/nested/some-page.ts";
  }
}

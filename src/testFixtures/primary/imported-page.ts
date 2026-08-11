import { BasePageObject } from "../../basePageObject.js";

/** Lives outside the caller's directory, so only an import can find it. */
export class ImportedPage extends BasePageObject {
  get sharedPage() {
    return this.page;
  }
}

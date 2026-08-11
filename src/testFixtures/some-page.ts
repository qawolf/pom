import { BasePageObject } from "../basePageObject.js";

export class SomePage extends BasePageObject {
  get sharedPage() {
    return this.page;
  }
}

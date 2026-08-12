import { BasePageObject } from "../basePageObject.js";

export class SomePage extends BasePageObject {
  get origin() {
    return "testFixtures/some-page.ts";
  }

  get sharedPage() {
    return this.page;
  }
}

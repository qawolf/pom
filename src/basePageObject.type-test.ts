import { expectTypeOf } from "expect-type";

import { BasePageObject } from "./basePageObject.js";
import type { ImportedPage } from "./testFixtures/primary/imported-page.js";

class DashboardPage extends BasePageObject {
  buildGreeting(email: string): string {
    return `hello ${email}`;
  }
}

class ProbePage extends BasePageObject {
  siblingViaClass() {
    return this.create(DashboardPage);
  }

  siblingViaTypeOnlyImport() {
    // @ts-expect-error -- TS1361: a type-only import has no value to construct
    // from, so the mistake that only a cloud run catches in the name form is a
    // compile error here.
    return this.create(ImportedPage);
  }
}

describe("BasePageObject.create", () => {
  it("infers the page type from the class, with no annotation", () => {
    expectTypeOf<ReturnType<ProbePage["siblingViaClass"]>>().toEqualTypeOf<
      Promise<DashboardPage>
    >();
  });
});

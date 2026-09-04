import { BasePageObject } from "../basePageObject.js";

/**
 * A page whose `waitForReady` blocks until a test releases it, recording how
 * many times it ran. `settle` is held by the test so it can prove the factory
 * has not resolved before the wait has.
 */
export class SlowPage extends BasePageObject {
  static waits = 0;
  static reset(): void {
    SlowPage.settle = () => {};
    SlowPage.waits = 0;
  }

  static settle: () => void = () => {};

  protected override async waitForReady(): Promise<void> {
    SlowPage.waits += 1;
    await new Promise<void>((resolve) => {
      SlowPage.settle = resolve;
    });
  }
}

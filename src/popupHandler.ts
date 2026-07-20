import type { Locator, Page } from "playwright";

export class PopupHandler {
  readonly name: string;
  /** List all registered popup handler names. */
  get registered(): string[] {
    return [...this._registrations.keys()];
  }
  private _page: Page | undefined = undefined;

  private _registrations = new Map<
    string,
    { dismiss: () => Promise<void>; trigger: Locator }
  >();

  constructor(name: string) {
    this.name = name;
  }

  /** Register a popup for auto-dismissal. */
  async add(
    name: string,
    trigger: Locator,
    dismiss: () => Promise<void>,
  ): Promise<void> {
    if (!this._page) {
      throw Error(
        `PopupHandler "${this.name}" is not installed on a page yet.`,
      );
    }
    this._registrations.set(name, { dismiss, trigger });
    await this._page.addLocatorHandler(trigger, async () => {
      await dismiss();
    });
  }

  /** Check if a popup handler is registered by name. */
  has(name: string): boolean {
    return this._registrations.has(name);
  }

  /** Bind to a page. Throws if already bound — one handler per page. */
  install(page: Page): void {
    if (this._page) {
      throw Error(
        `PopupHandler "${this.name}" is already bound to a page. ` +
          `Each handler tracks exactly one page handle. For multi-page ` +
          `sessions, create a separate PopupHandler per page:\n\n` +
          `  const mainPopups      = new PopupHandler("main");\n` +
          `  const secondaryPopups = new PopupHandler("secondary");`,
      );
    }
    this._page = page;
  }

  /** Remove a popup handler by name. */
  async remove(name: string): Promise<void> {
    const reg = this._registrations.get(name);
    if (reg && this._page) {
      await this._page.removeLocatorHandler(reg.trigger);
      this._registrations.delete(name);
    }
  }
}

import type { Page, Response } from "playwright";

import { expect } from "@qawolf/flows/web";

export type NetworkError = {
  readonly method: string;
  readonly resourceType: string;
  readonly status: number;
  readonly statusText: string;
  readonly timestamp: number;
  readonly url: string;
};

export class NetworkMonitor {
  readonly name: string;
  /** Only 4xx errors. */
  get clientErrors(): readonly NetworkError[] {
    return this._errors.filter((e) => e.status < 500);
  }
  /** All recorded 4xx/5xx errors. */
  get errors(): readonly NetworkError[] {
    return [...this._errors];
  }

  /** Only 5xx errors. */
  get serverErrors(): readonly NetworkError[] {
    return this._errors.filter((e) => e.status >= 500);
  }

  private _errors: NetworkError[] = [];

  private _page: Page | undefined = undefined;

  constructor(name: string) {
    this.name = name;
  }

  /** Assert zero HTTP errors were recorded, with optional URL exclusions. */
  assertClean(options?: { exclude?: RegExp[] }): void {
    const errors = this._filtered(options?.exclude);
    expect(
      errors,
      `NetworkMonitor "${this.name}" recorded ${errors.length} HTTP error(s):\n` +
        errors
          .map((e) => `  ${e.method} ${e.status} ${e.statusText} ${e.url}`)
          .join("\n"),
    ).toHaveLength(0);
  }

  /** Assert zero 5xx errors were recorded, with optional URL exclusions. */
  assertNoServerErrors(options?: { exclude?: RegExp[] }): void {
    const errors = this._filtered(options?.exclude).filter(
      (e) => e.status >= 500,
    );
    expect(
      errors,
      `NetworkMonitor "${this.name}" recorded ${errors.length} server error(s):\n` +
        errors
          .map((e) => `  ${e.method} ${e.status} ${e.statusText} ${e.url}`)
          .join("\n"),
    ).toHaveLength(0);
  }

  /** Bind to a page. Throws if already bound — one monitor per page. */
  install(page: Page): void {
    if (this._page) {
      throw Error(
        `NetworkMonitor "${this.name}" is already tracking a page. ` +
          `Each monitor tracks exactly one page handle. For multi-page ` +
          `sessions, create a separate NetworkMonitor per page:\n\n` +
          `  const main      = new NetworkMonitor("main");\n` +
          `  const secondary = new NetworkMonitor("secondary");`,
      );
    }
    this._page = page;
    page.on("response", (response: Response) => {
      if (response.status() >= 400) {
        this._errors.push({
          method: response.request().method(),
          resourceType: response.request().resourceType(),
          status: response.status(),
          statusText: response.statusText(),
          timestamp: Date.now(),
          url: response.url(),
        });
      }
    });
  }

  /** Reset collected errors (useful mid-flow if only a specific section matters). */
  reset(): void {
    this._errors = [];
  }

  private _filtered(exclude?: RegExp[]): NetworkError[] {
    if (!exclude?.length) return [...this._errors];
    return this._errors.filter((e) => !exclude.some((rx) => rx.test(e.url)));
  }
}

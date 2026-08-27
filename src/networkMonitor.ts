import type { Response } from "playwright";

import { expect } from "@qawolf/flows/web";

export type NetworkError = {
  readonly method: string;
  readonly resourceType: string;
  readonly status: number;
  readonly statusText: string;
  readonly timestamp: number;
  readonly url: string;
};

/** What both a `BrowserContext` and a `Page` offer: a `response` event. */
export type ResponseSource = {
  on(event: "response", listener: (response: Response) => void): unknown;
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

  private _installed = false;

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

  /**
   * Record every 4xx/5xx response `source` emits. `initializeBrowser` binds
   * the monitor to the browser context, so every page the context produces --
   * a second tab, a popup window -- is covered by the one monitor. A single
   * page works too. Throws if already installed: one monitor, one source.
   */
  install(source: ResponseSource): void {
    if (this._installed) {
      throw Error(
        `NetworkMonitor "${this.name}" is already installed. One monitor ` +
          `records one browser context (or page); create another for a second.`,
      );
    }
    this._installed = true;
    source.on("response", (response: Response) => {
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

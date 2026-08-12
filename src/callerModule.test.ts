import { describe, expect, it } from "@jest/globals";

import { callerFileUrl } from "./callerModule.js";

function reportOwnFile(): string | undefined {
  // Depth 0 is this function's own frame, depth 1 is its caller.
  return callerFileUrl(0);
}

function reportCallerFile(): string | undefined {
  return callerFileUrl(1);
}

describe("[CI] callerFileUrl", () => {
  it("resolves frames to file URLs by depth", () => {
    expect(reportOwnFile()).toMatch(/callerModule\.test\.ts$/);
    expect(reportCallerFile()).toMatch(/callerModule\.test\.ts$/);
    expect(reportOwnFile()).toMatch(/^file:\/\//);
  });

  it("leaves the stack API as it found it", () => {
    const prepareStackTrace = Error.prepareStackTrace;
    const stackTraceLimit = Error.stackTraceLimit;

    callerFileUrl(1);

    expect(Error.prepareStackTrace).toBe(prepareStackTrace);
    expect(Error.stackTraceLimit).toBe(stackTraceLimit);
    expect(typeof Error().stack).toBe("string");
  });
});

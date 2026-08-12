/**
 * The file that called into this package, used to resolve a page name against
 * the calling page object's own directory (see `siblingPageResolution.ts`).
 *
 * Structured call sites are a V8 API, which covers every runtime this package
 * targets. Anywhere else — and for frames with no file behind them, such as
 * `eval` or a VM wrapper — this yields `undefined`, and the registry falls
 * back to its "unknown page" error.
 */
import { pathToFileURL } from "node:url";

type CallSite = { getFileName: () => string | undefined };

/**
 * `depth` counts frames from the function that called this one: 0 is that
 * function, 1 is whoever called it. Capture synchronously, before any `await`,
 * or the frames of interest are already gone.
 */
export function callerFileUrl(depth: number): string | undefined {
  if (typeof Error.captureStackTrace !== "function") return undefined;

  const originalPrepareStackTrace = Error.prepareStackTrace;
  const originalStackTraceLimit = Error.stackTraceLimit;
  try {
    Error.prepareStackTrace = (_error, callSites) => callSites;
    Error.stackTraceLimit = Math.max(originalStackTraceLimit, depth + 2);

    const holder: { stack?: unknown } = {};
    Error.captureStackTrace(holder, callerFileUrl);
    const callSites = holder.stack as CallSite[] | undefined;

    const fileName = callSites?.[depth]?.getFileName();
    return fileName ? toFileUrl(fileName) : undefined;
  } finally {
    Error.prepareStackTrace = originalPrepareStackTrace;
    Error.stackTraceLimit = originalStackTraceLimit;
  }
}

function toFileUrl(fileName: string): string | undefined {
  if (fileName.startsWith("file:")) return fileName;

  // CommonJS frames report a path rather than a URL. Anything that is neither
  // — `node:internal`, `eval`, a test-runner wrapper — has no directory to
  // resolve a sibling module against.
  const isAbsolutePath =
    fileName.startsWith("/") || /^[A-Za-z]:[\\/]/.test(fileName);
  return isAbsolutePath ? pathToFileURL(fileName).href : undefined;
}

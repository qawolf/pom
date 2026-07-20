/**
 * Cleanup Utilities
 *
 * Provides fail-safe reporting for cleanup sequence failures.
 * Cleanup sequences reset server-side state (cart, addresses, prefs)
 * between test runs. When a cleanup fails, it is logged but does NOT
 * abort the test — the test continues and the failure is reported
 * separately for investigation.
 *
 * API endpoint documentation: https://task-wolf.com/docs/users/automation/apis/cleanup-alerts/
 */

const cleanupApiUrl = "https://task-wolf.com/apis/cleanup-fail";

export type ReportCleanupFailedParams = {
  dedupKey?: string;
  errorMsg?: string;
};

/**
 * POST cleanup failure details to the automation Cleanup Failure API.
 * No-ops when `QAWOLF_RUN_ID` is unset (e.g. editor runs).
 */
export async function reportCleanupFailed({
  dedupKey,
  errorMsg,
}: ReportCleanupFailedParams = {}): Promise<unknown> {
  const payload = {
    dedupKey,
    errorMsg,
    runId: process.env.QAWOLF_RUN_ID,
    suiteId: process.env.QAWOLF_SUITE_ID,
    teamId: process.env.QAWOLF_TEAM_ID,
    workflowId: process.env.QAWOLF_WORKFLOW_ID,
  };

  if (!payload.runId) return;

  try {
    const response = await fetch(cleanupApiUrl, {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (response.ok) return await response.json();

    throw Error(`HTTP error! Status: ${response.status}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw Error(`Fetch or parsing error! ${msg}`);
  }
}

/**
 * Report a cleanup sequence failure to the automation stack.
 * Logs the error but does NOT throw — the test continues.
 *
 * @param cleanupName - Identifier for the cleanup (e.g., "cart-cleanup")
 * @param error - The error thrown by the cleanup sequence
 */
export function reportCleanupFailure(
  cleanupName: string,
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  console.warn(`[CLEANUP FAILED] ${cleanupName}: ${message}`);
  if (stack) console.warn(`[CLEANUP STACK] ${stack}`);

  const errorMsg = stack ? `${message}\n${stack}` : message;
  reportCleanupFailed({ dedupKey: cleanupName, errorMsg }).catch(
    (reportErr) => {
      const reportMsg =
        reportErr instanceof Error ? reportErr.message : String(reportErr);
      console.warn(`[CLEANUP REPORT FAILED] ${reportMsg}`);
    },
  );
}

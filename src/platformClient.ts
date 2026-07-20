/**
 * Lightweight tRPC HTTP client for the QAW platform API.
 *
 * Used at runtime by getInbox (email polling) and potentially other
 * platform features. Requires QAW_TOKEN env var for authentication.
 */

const BASE_URL = "https://app.qawolf.com/api/trpc";

/** tRPC v10 response envelope: `{ result: { data: { json: <actual> } } }`. */
type TrpcResponseEnvelope = {
  data?: { json?: unknown };
  json?: unknown;
  result?: { data?: { json?: unknown } };
};

export async function callPlatformAPI<TResponse>(opts: {
  endpoint: string;
  input: Record<string, unknown>;
}): Promise<TResponse> {
  const token = process.env.QAW_TOKEN;
  if (!token) {
    throw Error(
      "QAW_TOKEN env var is required for platform API calls. " +
        "Set it in .env or pass it via the environment.",
    );
  }

  const inputJson = JSON.stringify(opts.input);
  const url = `${BASE_URL}/${opts.endpoint}?input=${encodeURIComponent(inputJson)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    method: "GET",
  });

  if (!res.ok) {
    throw Error(
      `Platform API ${opts.endpoint} returned ${res.status}: ${res.statusText}`,
    );
  }

  const body = (await res.json()) as TrpcResponseEnvelope;

  const envelope = body.result?.data || body.data || body;
  return (envelope?.json ?? envelope) as TResponse;
}

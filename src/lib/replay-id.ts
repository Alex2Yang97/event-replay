// Day 1: reversible base64url-encoded ticker+timestamp so /replay/[id] works
// without KV. Day 2 swaps this for sha1(ticker + rounded_minute_ET) + a KV
// lookup, and this helper goes away.

export type ReplayInput = {
  ticker: string;
  timestamp: string;
};

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + padding, "base64").toString("utf8");
}

export function encodeReplayId(input: ReplayInput): string {
  return base64UrlEncode(JSON.stringify(input));
}

export function decodeReplayId(id: string): ReplayInput | null {
  try {
    const parsed = JSON.parse(base64UrlDecode(id));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.ticker !== "string" ||
      typeof parsed.timestamp !== "string"
    ) {
      return null;
    }
    return { ticker: parsed.ticker, timestamp: parsed.timestamp };
  } catch {
    return null;
  }
}

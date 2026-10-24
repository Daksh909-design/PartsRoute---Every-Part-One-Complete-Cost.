export const staticSite = process.env.NEXT_PUBLIC_STATIC_DEMO === "true";
export const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(
  /\/$/,
  "",
);
export const liveAvailable = !staticSite || Boolean(apiBase);
export const temporaryBackend =
  /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(apiBase);
export const repository =
  "https://github.com/Daksh909-design/PartsRoute---Every-Part-One-Complete-Cost./";
export const homePath = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/`;
export const hostedSite = "https://partsroute.onrender.com/";

export async function requestApi(
  path: string,
  token: string,
  init: RequestInit = {},
) {
  if (staticSite && !apiBase)
    throw new Error(
      "This sample site has no live server connected. Open Live setup for deployment instructions.",
    );
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...init,
      signal: AbortSignal.timeout(6000),
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    throw new Error(
      error instanceof Error &&
        ["TimeoutError", "AbortError"].includes(error.name)
        ? "The server did not respond within six seconds. Use Resume to check an existing quote before starting another."
        : "Cannot reach the live service. Check your connection or use the sample calculator. If you already started a quote, use Resume when the service returns.",
    );
  }
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error(
      "The server returned a web page instead of an API response. Check the backend URL and deployment.",
    );
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || `The request failed (${response.status}).`);
  return body;
}

export const money = (amount: number | null) =>
  amount === null
    ? "Unknown"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(amount / 100);
export const when = (date: string) =>
  new Date(date).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

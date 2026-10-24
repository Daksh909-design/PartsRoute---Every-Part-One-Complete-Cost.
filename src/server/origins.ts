export function allowedOrigin(
  origin: string | null,
  requestUrl: string,
  host?: string | null,
): boolean {
  if (!origin) return true;
  const configured = [
    process.env.APP_ORIGIN,
    process.env.RENDER_EXTERNAL_URL,
    ...(process.env.APP_ALLOWED_ORIGINS || "").split(","),
  ]
    .map((value) => value?.trim())
    .filter(Boolean);
  const url = new URL(requestUrl);
  // Next may expose its internal hostname in request.url. Host is the actual
  // HTTP authority; forwarded host headers do not grant cross-origin access.
  const requestOrigin = host ? `${url.protocol}//${host}` : url.origin;
  return (
    origin === url.origin ||
    origin === requestOrigin ||
    configured.includes(origin)
  );
}

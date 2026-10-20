export function allowedOrigin(
  origin: string | null,
  requestUrl: string,
): boolean {
  if (!origin) return true;
  const configured = [
    process.env.APP_ORIGIN,
    process.env.RENDER_EXTERNAL_URL,
    ...(process.env.APP_ALLOWED_ORIGINS || "").split(","),
  ]
    .map((value) => value?.trim())
    .filter(Boolean);
  return origin === new URL(requestUrl).origin || configured.includes(origin);
}

import { aiConfig } from "../../../server/ai-provider";
export async function GET() {
  return Response.json({
    service: "PartsRoute",
    status: "ok",
    liveConfigured: Boolean(
      process.env.DATABASE_URL &&
      process.env.TINYFISH_API_KEY &&
      process.env[aiConfig().keyName] &&
      (process.env.APP_ACCESS_TOKEN?.length ?? 0) >= 24,
    ),
  });
}

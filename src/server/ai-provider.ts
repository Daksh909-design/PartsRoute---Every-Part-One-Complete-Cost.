import { OpenAIProvider, type AIProvider, type Usage } from "./ai";
import { GeminiProvider } from "./gemini";
export function aiConfig() {
  const provider = process.env.AI_PROVIDER || "gemini";
  if (provider !== "gemini" && provider !== "openai")
    throw new Error("AI_PROVIDER must be gemini or openai.");
  return {
    provider,
    name: provider === "gemini" ? "Gemini" : "OpenAI",
    keyName: provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY",
    model:
      provider === "gemini"
        ? process.env.GEMINI_MODEL || "gemini-3.5-flash-lite"
        : process.env.OPENAI_MODEL || "gpt-6-luna",
  };
}
export function createAIProvider(
  record: (usage: Usage) => Promise<void>,
  deadline = Infinity,
  signal?: AbortSignal,
): AIProvider {
  return aiConfig().provider === "gemini"
    ? new GeminiProvider(record, undefined, undefined, deadline, signal)
    : new OpenAIProvider(record, undefined, deadline, signal);
}

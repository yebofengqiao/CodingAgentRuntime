import { settings } from "@openhands-rl/backend-core/config";

export function llmConfigFromSettings(modelOverride?: string) {
  if (!settings.llmApiKey) {
    throw new Error("LLM_API_KEY environment variable is required.");
  }

  return {
    apiKey: settings.llmApiKey,
    model: modelOverride || settings.llmModel,
    baseUrl: settings.llmBaseUrl || undefined,
  };
}

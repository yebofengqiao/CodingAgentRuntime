import { existsSync } from "node:fs";
import { resolve } from "node:path";

import dotenv from "dotenv";

function findRepoRoot(start = process.cwd()): string {
  let current = resolve(start);
  while (true) {
    if (existsSync(resolve(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = resolve(current, "..");
    if (parent === current) {
      return start;
    }
    current = parent;
  }
}

function resolvePath(value: string, root: string): string {
  return value.startsWith("/") ? value : resolve(root, value);
}

const repoRoot = findRepoRoot();
const evaluationAssetsRoot = resolve(repoRoot, "packages/evaluation-assets");

dotenv.config({ path: resolve(repoRoot, ".env") });
dotenv.config({ path: resolve(evaluationAssetsRoot, ".env") });

export const settings = {
  repoRoot,
  mysqlUrl: process.env.MYSQL_URL ?? "mysql://openhands:openhands@127.0.0.1:3306/openhands_rl",
  redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  mongodbUrl: process.env.MONGODB_URL ?? "mongodb://127.0.0.1:27017/openhands_rl",
  artifactRoot: resolvePath(process.env.ARTIFACT_ROOT ?? "./runtime-data/artifacts", repoRoot),
  workspaceRoot: resolvePath(process.env.WORKSPACE_ROOT ?? "./runtime-data/workspaces", repoRoot),
  evaluationAssetsRoot: resolvePath(
    process.env.EVALUATION_ASSETS_ROOT ?? "./packages/evaluation-assets",
    repoRoot,
  ),
  // Business fine-tuning intentionally keeps prompt strategy fixed at the platform default.
  // Case-specific prompt deltas should be expressed through case assets instead of variant axes.
  businessFineTuningDefaultPromptVersion:
    process.env.BUSINESS_FINE_TUNING_DEFAULT_PROMPT_VERSION ?? "base-v1",
  evaluationExecutorBackend: process.env.EVALUATION_EXECUTOR_BACKEND ?? "mock",
  evaluationWorkerConcurrency: Math.max(
    1,
    Number(process.env.EVALUATION_WORKER_CONCURRENCY ?? "1") || 1,
  ),
  conversationFrontendUrl:
    process.env.CONVERSATION_FRONTEND_URL ??
    process.env.CONVERSATION_APP_BASE_URL ??
    "http://127.0.0.1:3000",
  evaluationFrontendUrl:
    process.env.EVALUATION_FRONTEND_URL ??
    process.env.EVALUATION_APP_BASE_URL ??
    "http://127.0.0.1:3001",
  conversationAppBaseUrl:
    process.env.CONVERSATION_APP_BASE_URL ??
    process.env.CONVERSATION_FRONTEND_URL ??
    "http://127.0.0.1:3000",
  evaluationAppBaseUrl:
    process.env.EVALUATION_APP_BASE_URL ??
    process.env.EVALUATION_FRONTEND_URL ??
    "http://127.0.0.1:3001",
  conversationApiBaseUrl: process.env.CONVERSATION_API_BASE_URL ?? "http://127.0.0.1:4000",
  evaluationApiBaseUrl: process.env.EVALUATION_API_BASE_URL ?? "http://127.0.0.1:4001",
  platformContextRoot: resolvePath(
    process.env.PLATFORM_CONTEXT_ROOT ??
      process.env.CONVERSATION_CONTEXT_ROOT ??
      "./packages/backend-core/src/context/platform",
    repoRoot,
  ),
  conversationContextRoot: process.env.CONVERSATION_CONTEXT_ROOT
    ? resolvePath(process.env.CONVERSATION_CONTEXT_ROOT, repoRoot)
    : resolve(repoRoot, "packages/backend-core/src/context/platform"),
  llmApiKey: process.env.LLM_API_KEY ?? "",
  llmModel: process.env.LLM_MODEL ?? "openai/gpt-4o-mini",
  llmBaseUrl: process.env.LLM_BASE_URL ?? "",
};

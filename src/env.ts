const DEFAULT_MODEL = "gpt-5.5";
const DEFAULT_MAX_OUTPUT_TOKENS = 900;
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const runtimeEnv = process.env;

function optionalString(value: string | undefined) {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

function readPositiveInteger(name: string, value: string | undefined, fallback: number) {
  const parsedValue = optionalString(value);

  if (parsedValue === undefined) {
    return fallback;
  }

  const numberValue = Number(parsedValue);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return numberValue;
}

function readOpenAiModel(value: string | undefined) {
  const model = optionalString(value);

  if (model === undefined) {
    return DEFAULT_MODEL;
  }

  if (model.startsWith("openai/")) {
    return model.slice("openai/".length);
  }

  if (model.includes("/")) {
    throw new Error("OPENAI_MODEL must be an OpenAI model id, for example gpt-5.5.");
  }

  return model;
}

export const env = {
  openaiApiKey: optionalString(runtimeEnv.OPENAI_API_KEY),
  openaiBaseURL: optionalString(runtimeEnv.OPENAI_BASE_URL),
  openaiOrganization: optionalString(runtimeEnv.OPENAI_ORGANIZATION),
  openaiProject: optionalString(runtimeEnv.OPENAI_PROJECT),
  openaiModel: readOpenAiModel(runtimeEnv.OPENAI_MODEL ?? runtimeEnv.AI_MODEL),
  aiMaxOutputTokens: readPositiveInteger(
    "AI_MAX_OUTPUT_TOKENS",
    runtimeEnv.AI_MAX_OUTPUT_TOKENS,
    DEFAULT_MAX_OUTPUT_TOKENS,
  ),
  aiRequestTimeoutMs: readPositiveInteger(
    "AI_REQUEST_TIMEOUT_MS",
    runtimeEnv.AI_REQUEST_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS,
  ),
};

export function assertOpenAiAuthConfigured() {
  if (env.openaiApiKey) {
    return;
  }

  throw new Error("Missing OPENAI_API_KEY. Add it to your environment before running the TUI.");
}

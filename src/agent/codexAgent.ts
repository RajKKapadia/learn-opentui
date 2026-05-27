import {
  ToolLoopAgent,
  type FinishReason,
  type LanguageModelUsage,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { assertOpenAiAuthConfigured, env } from "../env";
import { createAbortError } from "../utils/abort";

export type AgentRunOptions = {
  prompt: string;
  abortSignal?: AbortSignal;
  model: string;
  onDelta?: (delta: string, fullText: string) => void;
};

export type AgentRunResult = {
  finishReason: FinishReason;
  model: string;
  text: string;
  totalUsage: LanguageModelUsage;
};

const instructions = [
  "You are a concise terminal coding assistant.",
  "Answer the user's request directly and structure longer answers for terminal readability.",
  "If the request is ambiguous, state the assumption you are making and continue with the most useful answer.",
].join(" ");

function createCodexAgent(model: string) {
  const openai = createOpenAI({
    apiKey: env.openaiApiKey,
    baseURL: env.openaiBaseURL,
    organization: env.openaiOrganization,
    project: env.openaiProject,
  });

  return new ToolLoopAgent({
    id: "opentui-codex-agent",
    instructions,
    maxOutputTokens: env.aiMaxOutputTokens,
    model: openai(model),
  });
}

export async function streamAgentAnswer({
  abortSignal,
  model,
  onDelta,
  prompt,
}: AgentRunOptions): Promise<AgentRunResult> {
  assertOpenAiAuthConfigured();

  if (abortSignal?.aborted) {
    throw createAbortError();
  }

  const agent = createCodexAgent(model);
  const result = await agent.stream({
    prompt,
    timeout: {
      totalMs: env.aiRequestTimeoutMs,
    },
    ...(abortSignal ? { abortSignal } : {}),
  });

  let text = "";

  for await (const delta of result.textStream) {
    if (abortSignal?.aborted) {
      throw createAbortError();
    }

    text += delta;
    onDelta?.(delta, text);
  }

  const [finishReason, totalUsage] = await Promise.all([
    result.finishReason,
    result.totalUsage,
  ]);

  return {
    finishReason,
    model,
    text,
    totalUsage,
  };
}

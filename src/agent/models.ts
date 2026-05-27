export type OpenAiModelOption = {
  id: string;
  name: string;
  description: string;
};

export const AVAILABLE_OPENAI_MODELS: OpenAiModelOption[] = [
  {
    id: "gpt-5.5",
    name: "gpt-5.5",
    description: "Default high-capability model",
  },
  {
    id: "gpt-5.4-mini",
    name: "gpt-5.4-mini",
    description: "Faster, lighter GPT-5 model",
  },
  {
    id: "gpt-5.1-codex",
    name: "gpt-5.1-codex",
    description: "Code-focused model",
  },
  {
    id: "gpt-4.1-mini",
    name: "gpt-4.1-mini",
    description: "Small general-purpose model",
  },
];

export function getAvailableOpenAiModels(defaultModel: string) {
  if (AVAILABLE_OPENAI_MODELS.some((model) => model.id === defaultModel)) {
    return AVAILABLE_OPENAI_MODELS;
  }

  return [
    {
      id: defaultModel,
      name: defaultModel,
      description: "Configured default model",
    },
    ...AVAILABLE_OPENAI_MODELS,
  ];
}

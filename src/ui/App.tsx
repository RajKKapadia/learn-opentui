import { TextAttributes, type SelectOption } from "@opentui/core";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { streamAgentAnswer, type AgentRunResult } from "../agent/codexAgent";
import { getAvailableOpenAiModels } from "../agent/models";
import { env } from "../env";
import { isAbortError } from "../utils/abort";
import { COLORS } from "./theme";
import { formatError, truncateEnd, truncateMiddle } from "./text";

const DIRECTORY = "~/Desktop/My-Learning/learn-opentui";

type AgentStatus = "idle" | "running" | "complete" | "error" | "aborted";
type CommandName = "/models" | "/status" | "/clear" | "/help" | "/exit";
type CommandDefinition = {
  name: CommandName;
  description: string;
  group: "Session" | "Workspace";
  aliases?: string[];
};

type AppLayout = {
  appWidth: number;
  commandPaletteHeight: number;
  contentWidth: number;
  headerContentWidth: number;
  headerInfoWidth: number;
  headerMainWidth: number;
  inputWidth: number;
  mainContentWidth: number;
  mainWidth: number;
  showHeaderInfo: boolean;
  workspaceHeight: number;
};

const AVAILABLE_COMMANDS: CommandDefinition[] = [
  {
    name: "/models",
    description: "Switch the OpenAI model for this session",
    group: "Session",
    aliases: ["/model"],
  },
  {
    name: "/status",
    description: "Show model, directory, state, and token usage",
    group: "Session",
  },
  {
    name: "/clear",
    description: "Clear the current answer and reset the workspace",
    group: "Workspace",
  },
  {
    name: "/help",
    description: "Show the available slash commands",
    group: "Workspace",
  },
  {
    name: "/exit",
    description: "Quit the terminal UI",
    group: "Session",
    aliases: ["/quit", "exit", "quit"],
  },
];

function getStatusColor(status: AgentStatus) {
  if (status === "error") {
    return COLORS.error;
  }

  if (status === "running") {
    return COLORS.warning;
  }

  if (status === "aborted") {
    return COLORS.accentWarm;
  }

  return COLORS.success;
}

function getModeLabel(
  status: AgentStatus,
  showModelPicker: boolean,
  showCommandSuggestions: boolean,
) {
  if (showModelPicker) {
    return "model";
  }

  if (showCommandSuggestions) {
    return "command";
  }

  if (status === "running") {
    return "streaming";
  }

  if (status === "complete") {
    return "complete";
  }

  if (status === "error") {
    return "attention";
  }

  if (status === "aborted") {
    return "stopped";
  }

  return "ready";
}

function getCommandSuggestions(prompt: string) {
  const normalizedPrompt = prompt.toLowerCase();

  if (!normalizedPrompt.startsWith("/")) {
    return [];
  }

  return AVAILABLE_COMMANDS.filter(
    (command) =>
      command.name.startsWith(normalizedPrompt) ||
      command.aliases?.some((alias) => alias.startsWith(normalizedPrompt)),
  );
}

function findExactCommand(prompt: string) {
  const normalizedPrompt = prompt.toLowerCase();

  return AVAILABLE_COMMANDS.find(
    (command) =>
      command.name === normalizedPrompt ||
      command.aliases?.some((alias) => alias === normalizedPrompt),
  );
}

function formatUsage(result: AgentRunResult | null) {
  const totalTokens = result?.totalUsage.totalTokens;

  if (typeof totalTokens !== "number") {
    return "tokens pending";
  }

  return `${totalTokens.toLocaleString()} tokens`;
}

function getCommandHelpText() {
  return AVAILABLE_COMMANDS.map((command) => {
    const aliases = command.aliases?.length ? ` (${command.aliases.join(", ")})` : "";
    return `${command.name}${aliases}\n  ${command.description}`;
  }).join("\n\n");
}

function getStatusReport(
  status: AgentStatus,
  result: AgentRunResult | null,
  errorMessage: string | null,
  selectedModel: string,
) {
  return [
    `State: ${status}`,
    `Model: ${selectedModel}`,
    `Directory: ${DIRECTORY}`,
    `Usage: ${formatUsage(result)}`,
    errorMessage ? `Last error: ${errorMessage}` : "Last error: none",
  ].join("\n");
}

function getStatusText(
  status: AgentStatus,
  result: AgentRunResult | null,
  errorMessage: string | null,
  selectedModel: string,
  showModelPicker: boolean,
  showCommandSuggestions: boolean,
) {
  if (showModelPicker) {
    return "choose a model for the next request";
  }

  if (showCommandSuggestions) {
    return "command palette open";
  }

  if (status === "running") {
    return "agent is thinking";
  }

  if (status === "error") {
    return errorMessage ?? "agent failed";
  }

  if (status === "aborted") {
    return "request stopped";
  }

  if (status === "complete" && result !== null) {
    return `done: ${result.finishReason}`;
  }

  return `${selectedModel} ready`;
}

function getWorkspaceTitle(showModelPicker: boolean) {
  if (showModelPicker) {
    return "Models";
  }

  return "Transcript";
}

function CommandPalette({
  commands,
  highlightedCommandIndex,
  width,
}: {
  commands: CommandDefinition[];
  highlightedCommandIndex: number;
  width: number;
}) {
  return (
    <box style={{ flexDirection: "column", width }}>
      {commands.map((command, index) => {
        const isHighlighted = index === highlightedCommandIndex;
        const aliasText = command.aliases?.length ? ` alias ${command.aliases.join(", ")}` : "";

        return (
          <box
            key={command.name}
            backgroundColor={isHighlighted ? COLORS.promptBackground : COLORS.background}
            style={{
              flexDirection: "column",
              height: 1,
              paddingLeft: 1,
              paddingRight: 1,
              width,
            }}
          >
            <text>
              <span fg={isHighlighted ? COLORS.accent : COLORS.muted}>
                {isHighlighted ? "> " : "  "}
              </span>
              <span fg={isHighlighted ? COLORS.text : COLORS.secondaryText} attributes={TextAttributes.BOLD}>
                {command.name}
              </span>
              <span fg={COLORS.muted}>
                {truncateEnd(
                  ` ${command.group}${aliasText} - ${command.description}`,
                  Math.max(1, width - command.name.length - 4),
                )}
              </span>
            </text>
          </box>
        );
      })}
    </box>
  );
}

function Transcript({
  answerText,
  status,
  width,
}: {
  answerText: string;
  status: AgentStatus;
  width: number;
}) {
  return (
    <box style={{ flexDirection: "column", width }}>
      <text>
        <span fg={COLORS.muted}>assistant </span>
        <span fg={getStatusColor(status)}>{status}</span>
      </text>
      <text>{" "}</text>
      <text
        fg={status === "error" ? COLORS.error : COLORS.secondaryText}
        wrapMode="word"
        style={{ width }}
      >
        {answerText}
      </text>
    </box>
  );
}

export function App() {
  const renderer = useRenderer();
  const { height: terminalHeight, width: terminalWidth } = useTerminalDimensions();
  const modelOptions = useMemo<SelectOption[]>(
    () =>
      getAvailableOpenAiModels(env.openaiModel).map((model) => ({
        name: model.name,
        description: model.description,
        value: model.id,
      })),
    [],
  );
  const [selectedModel, setSelectedModel] = useState(env.openaiModel);
  const [highlightedModelIndex, setHighlightedModelIndex] = useState(() =>
    Math.max(
      0,
      modelOptions.findIndex((model) => model.value === env.openaiModel),
    ),
  );
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedCommandIndex, setHighlightedCommandIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<AgentRunResult | null>(null);
  const activeRunRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);

  useEffect(() => {
    return () => activeRunRef.current?.abort();
  }, []);

  const commandSuggestions = useMemo(() => getCommandSuggestions(query), [query]);
  const showCommandSuggestions = commandSuggestions.length > 0 && !showModelPicker;

  useEffect(() => {
    setHighlightedCommandIndex(0);
  }, [query]);

  useKeyboard((key) => {
    if (showCommandSuggestions && (key.name === "up" || key.name === "down")) {
      key.preventDefault();
      key.stopPropagation();

      setHighlightedCommandIndex((currentIndex) => {
        const direction = key.name === "up" ? -1 : 1;
        return (currentIndex + direction + commandSuggestions.length) % commandSuggestions.length;
      });

      return;
    }

    if (key.name === "escape") {
      key.preventDefault();

      if (showModelPicker) {
        setShowModelPicker(false);
        return;
      }

      if (showCommandSuggestions) {
        setQuery("");
        return;
      }

      if (activeRunRef.current !== null) {
        activeRunRef.current.abort();
        activeRunRef.current = null;
        setStatus("aborted");
        return;
      }

      renderer.destroy();
    }
  });

  const layout = useMemo<AppLayout>(() => {
    const appWidth = Math.max(40, terminalWidth);
    const contentWidth = Math.max(12, appWidth - 4);
    const showHeaderInfo = appWidth >= 76;
    const headerInfoWidth = showHeaderInfo ? 34 : 0;
    const headerMainWidth = showHeaderInfo
      ? Math.max(24, contentWidth - headerInfoWidth - 1)
      : contentWidth;
    const commandPaletteHeight = showCommandSuggestions
      ? Math.min(7, Math.max(3, commandSuggestions.length + 2))
      : 0;
    const workspaceHeight = Math.max(6, terminalHeight - 9 - commandPaletteHeight);

    return {
      appWidth,
      commandPaletteHeight,
      contentWidth,
      headerContentWidth: contentWidth,
      headerInfoWidth,
      headerMainWidth,
      inputWidth: Math.max(8, appWidth - 10),
      mainContentWidth: Math.max(12, appWidth - 4),
      mainWidth: appWidth,
      showHeaderInfo,
      workspaceHeight,
    };
  }, [commandSuggestions.length, showCommandSuggestions, terminalHeight, terminalWidth]);

  async function submitQuery(rawQuery: string) {
    const prompt = rawQuery.trim();
    const promptCommandSuggestions = getCommandSuggestions(prompt);
    const command =
      findExactCommand(prompt) ??
      (prompt.startsWith("/")
        ? promptCommandSuggestions[highlightedCommandIndex] ?? promptCommandSuggestions[0]
        : undefined);

    if (!prompt) {
      setStatus("idle");
      setAnswer("");
      setErrorMessage(null);
      setResult(null);
      return;
    }

    if (command?.name === "/models") {
      activeRunRef.current?.abort();
      activeRunRef.current = null;
      runIdRef.current += 1;
      setHighlightedModelIndex(
        Math.max(
          0,
          modelOptions.findIndex((model) => model.value === selectedModel),
        ),
      );
      setShowModelPicker(true);
      setAnswer("");
      setErrorMessage(null);
      setResult(null);
      setStatus("idle");
      return;
    }

    if (command?.name === "/status") {
      activeRunRef.current?.abort();
      activeRunRef.current = null;
      runIdRef.current += 1;
      setShowModelPicker(false);
      setAnswer(getStatusReport(status, result, errorMessage, selectedModel));
      setErrorMessage(null);
      setResult(null);
      setStatus("idle");
      return;
    }

    if (command?.name === "/clear") {
      activeRunRef.current?.abort();
      activeRunRef.current = null;
      runIdRef.current += 1;
      setShowModelPicker(false);
      setAnswer("");
      setErrorMessage(null);
      setResult(null);
      setStatus("idle");
      return;
    }

    if (command?.name === "/help") {
      activeRunRef.current?.abort();
      activeRunRef.current = null;
      runIdRef.current += 1;
      setShowModelPicker(false);
      setAnswer(getCommandHelpText());
      setErrorMessage(null);
      setResult(null);
      setStatus("idle");
      return;
    }

    if (command?.name === "/exit") {
      activeRunRef.current?.abort();
      activeRunRef.current = null;
      runIdRef.current += 1;
      renderer.destroy();
      return;
    }

    if (prompt.startsWith("/")) {
      setShowModelPicker(false);
      setAnswer("");
      setErrorMessage(`Unknown command: ${prompt}`);
      setResult(null);
      setStatus("error");
      return;
    }

    setShowModelPicker(false);
    activeRunRef.current?.abort();

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;

    const controller = new AbortController();
    activeRunRef.current = controller;

    setAnswer("");
    setErrorMessage(null);
    setResult(null);
    setStatus("running");

    try {
      const nextResult = await streamAgentAnswer({
        abortSignal: controller.signal,
        model: selectedModel,
        onDelta: (_delta, fullText) => {
          if (runIdRef.current === runId) {
            setAnswer(fullText);
          }
        },
        prompt,
      });

      if (runIdRef.current !== runId) {
        return;
      }

      setAnswer(nextResult.text);
      setResult(nextResult);
      setStatus("complete");
    } catch (error) {
      if (runIdRef.current !== runId) {
        return;
      }

      if (controller.signal.aborted || isAbortError(error)) {
        setStatus("aborted");
        return;
      }

      setErrorMessage(formatError(error));
      setStatus("error");
    } finally {
      if (activeRunRef.current === controller) {
        activeRunRef.current = null;
      }
    }
  }

  const modeLabel = getModeLabel(status, showModelPicker, showCommandSuggestions);
  const title = truncateEnd("OpenAI Workbench", Math.max(8, layout.headerMainWidth - 24));
  const directory = truncateMiddle(DIRECTORY, Math.max(10, layout.headerMainWidth - 6));
  const statusText = getStatusText(status, result, errorMessage, selectedModel, showModelPicker, showCommandSuggestions);
  const footerText = truncateEnd(
    `${modeLabel} | ${statusText} | ${formatUsage(result)}`,
    layout.appWidth,
  );
  const answerText =
    answer ||
    (status === "error"
      ? errorMessage ?? "The agent failed before returning an answer."
      : status === "running"
        ? "Thinking..."
        : "Ready for a coding request.");

  return (
    <box
      style={{
        backgroundColor: COLORS.background,
        flexDirection: "column",
        height: "100%",
        width: "100%",
      }}
    >
      <box
        backgroundColor={COLORS.panel}
        border
        borderColor={COLORS.borderStrong}
        borderStyle="single"
        style={{
          flexDirection: "row",
          height: 5,
          justifyContent: "space-between",
          paddingLeft: 1,
          paddingRight: 1,
          width: layout.appWidth,
        }}
      >
        <box
          style={{
            flexDirection: "column",
            justifyContent: "center",
            width: layout.headerMainWidth,
          }}
        >
          <text>
            <span fg={COLORS.accent}>{"> "}</span>
            <span fg={COLORS.text} attributes={TextAttributes.BOLD}>
              {title}
            </span>
            <span fg={COLORS.muted}> / local agent console</span>
          </text>
          <text>
            <span fg={COLORS.muted}>cwd </span>
            <span fg={COLORS.secondaryText}>{directory}</span>
          </text>
          <text>
            <span fg={COLORS.muted}>commands </span>
            <span fg={COLORS.accent}>/models</span>
            <span fg={COLORS.muted}> </span>
            <span fg={COLORS.accent}>/status</span>
            <span fg={COLORS.muted}> </span>
            <span fg={COLORS.accent}>/exit</span>
          </text>
        </box>

        {layout.showHeaderInfo ? (
          <box
            backgroundColor={COLORS.surfaceMuted}
            style={{
              flexDirection: "column",
              justifyContent: "center",
              paddingLeft: 1,
              width: layout.headerInfoWidth,
            }}
          >
            <text>
              <span fg={COLORS.muted}>state </span>
              <span fg={getStatusColor(status)} attributes={TextAttributes.BOLD}>
                {truncateEnd(modeLabel, layout.headerInfoWidth - 8)}
              </span>
            </text>
            <text>
              <span fg={COLORS.muted}>model </span>
              <span fg={COLORS.text}>{truncateEnd(selectedModel, layout.headerInfoWidth - 8)}</span>
            </text>
            <text>
              <span fg={COLORS.muted}>usage </span>
              <span fg={COLORS.accent}>{truncateEnd(formatUsage(result), layout.headerInfoWidth - 8)}</span>
            </text>
          </box>
        ) : null}
      </box>

      <scrollbox
        border
        borderColor={COLORS.border}
        borderStyle="single"
        stickyScroll={!showModelPicker}
        stickyStart="bottom"
        title={getWorkspaceTitle(showModelPicker)}
        style={{
          height: layout.workspaceHeight,
          paddingLeft: 1,
          paddingRight: 1,
          width: layout.mainWidth,
        }}
      >
        {showModelPicker ? (
          <select
            backgroundColor={COLORS.background}
            descriptionColor={COLORS.muted}
            focused
            focusedBackgroundColor={COLORS.background}
            focusedTextColor={COLORS.text}
            onChange={(index) => setHighlightedModelIndex(index)}
            onSelect={(index, option) => {
              const nextModel = typeof option?.value === "string" ? option.value : option?.name;

              if (!nextModel) {
                return;
              }

              setSelectedModel(nextModel);
              setHighlightedModelIndex(index);
              setShowModelPicker(false);
              setAnswer(`Model set to ${nextModel}.`);
              setErrorMessage(null);
              setResult(null);
              setStatus("idle");
            }}
            options={modelOptions}
            selectedBackgroundColor={COLORS.promptBackground}
            selectedDescriptionColor={COLORS.secondaryText}
            selectedIndex={highlightedModelIndex}
            selectedTextColor={COLORS.text}
            showDescription
            textColor={COLORS.secondaryText}
            width={layout.mainContentWidth}
            height={layout.workspaceHeight - 2}
          />
        ) : (
          <Transcript answerText={answerText} status={status} width={layout.mainContentWidth} />
        )}
      </scrollbox>

      {showCommandSuggestions ? (
        <scrollbox
          border
          borderColor={COLORS.accent}
          borderStyle="single"
          stickyScroll={false}
          title="Command Palette"
          style={{
            height: layout.commandPaletteHeight,
            paddingLeft: 1,
            paddingRight: 1,
            width: layout.appWidth,
          }}
        >
          <CommandPalette
            commands={commandSuggestions}
            highlightedCommandIndex={highlightedCommandIndex}
            width={layout.mainContentWidth}
          />
        </scrollbox>
      ) : null}

      <box
        backgroundColor={COLORS.promptBackground}
        border
        borderColor={showCommandSuggestions ? COLORS.accent : COLORS.border}
        borderStyle="single"
        style={{
          alignItems: "center",
          flexDirection: "row",
          height: 3,
          paddingLeft: 1,
          paddingRight: 1,
          width: layout.appWidth,
        }}
      >
        <text fg={COLORS.secondaryText} attributes={TextAttributes.BOLD} style={{ width: 5 }}>
          you
        </text>
        <input
          backgroundColor={COLORS.promptBackground}
          cursorColor={COLORS.text}
          focused={!showModelPicker}
          focusedBackgroundColor={COLORS.promptBackground}
          maxLength={500}
          onInput={setQuery}
          onSubmit={(value) => {
            const submittedValue = typeof value === "string" ? value : query;
            setQuery("");
            void submitQuery(submittedValue);
          }}
          placeholder="ask, or type /"
          textColor={COLORS.inputText}
          value={query}
          width={layout.inputWidth}
        />
      </box>

      <text fg={getStatusColor(status)} style={{ width: layout.appWidth }}>
        {footerText}
      </text>
    </box>
  );
}

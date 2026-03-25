import {
  AgentContext,
  default_base_system_prompt,
  resolve_runtime_context,
  type ResolvedRuntimeContext,
} from "../Context/context";
import {
  createTextContentBlock,
  textContentBlocksToText,
  type ConversationState,
} from "../Event/event";
import type { ConversationCallbackType } from "../Event/callback";
import { ToolRuntime, type ToolDefinition } from "../Tool/tool";

export type LlmConfig = {
  apiKey: string;
  model: string;
  baseUrl?: string | null;
};

export type WorkspaceProtocol = {
  working_dir: string;
};

export type ConversationProtocol = {
  state: ConversationState;
  workspace: WorkspaceProtocol;
  finish(): void;
};

export type AgentBaseOptions = {
  llmConfig: LlmConfig;
  tool_runtime?: ToolRuntime;
  runtime_context?: ResolvedRuntimeContext;
  agent_context?: AgentContext;
  tool_concurrency_limit?: number;
};

export class AgentBase {
  protected readonly llmConfig: LlmConfig;
  protected readonly tool_runtime: ToolRuntime;
  protected readonly runtime_context?: ResolvedRuntimeContext;
  protected readonly agent_context?: AgentContext;
  protected readonly base_system_prompt: string;
  protected readonly _tool_concurrency_limit: number;
  protected _tools: Record<string, ToolDefinition>;
  protected _initialized: boolean;

  constructor({
    llmConfig,
    tool_runtime = new ToolRuntime(),
    runtime_context,
    agent_context,
    tool_concurrency_limit,
  }: AgentBaseOptions) {
    this.llmConfig = llmConfig;
    this.tool_runtime = tool_runtime;
    this.runtime_context = runtime_context;
    this.agent_context = agent_context ?? runtime_context?.agent_context;
    this.base_system_prompt =
      runtime_context?.base_system_prompt ?? default_base_system_prompt();
    const configuredConcurrency = tool_concurrency_limit ?? 1;
    this._tool_concurrency_limit =
      Number.isInteger(configuredConcurrency) && configuredConcurrency > 0
        ? configuredConcurrency
        : 1;
    this._tools = {};
    this._initialized = false;
  }

  get initialized(): boolean {
    return this._initialized;
  }

  get tools_map(): Record<string, ToolDefinition> {
    return { ...this._tools };
  }

  get tool_definitions(): ToolDefinition[] {
    return Object.values(this._tools);
  }

  get tool_concurrency_limit(): number {
    return this._tool_concurrency_limit;
  }

  get static_system_message(): string {
    return this.base_system_prompt;
  }

  get dynamic_context(): string | null {
    const working_dir =
      this.runtime_context?.workspace_context_root ??
      this.runtime_context?.context_root ??
      process.cwd();
    return (
      this.agent_context?.get_system_message_suffix({
        working_dir,
        context_root: this.runtime_context?.context_root ?? working_dir,
        workspace_context_root:
          this.runtime_context?.workspace_context_root ??
          this.runtime_context?.context_root ??
          working_dir,
        platform_context_root: this.runtime_context?.platform_context_root ?? null,
      }) ?? null
    );
  }

  get system_message(): string {
    return textContentBlocksToText([
      createTextContentBlock(this.static_system_message),
      ...(this.dynamic_context ? [createTextContentBlock(this.dynamic_context)] : []),
    ]);
  }

  protected _resolve_runtime_context(working_dir: string): ResolvedRuntimeContext {
    if (this.runtime_context) {
      return this.runtime_context;
    }

    return resolve_runtime_context(
      {
        workspace_context_root: working_dir,
        base_system_prompt: this.base_system_prompt,
        system_message_suffix: this.agent_context?.system_message_suffix,
        user_message_suffix: this.agent_context?.user_message_suffix,
        current_datetime: this.agent_context?.current_datetime,
        explicit_skills: this.agent_context?.skills ?? [],
        load_platform_context: false,
        load_workspace_context: false,
      },
      working_dir,
    );
  }

  get_dynamic_context(
    _state: ConversationState,
    conversation?: ConversationProtocol,
  ): string | null {
    const working_dir =
      conversation?.workspace.working_dir ??
      this.runtime_context?.workspace_context_root ??
      this.runtime_context?.context_root ??
      process.cwd();
    const context_root =
      this.runtime_context?.workspace_context_root ??
      this.runtime_context?.context_root ??
      working_dir;
    return (
      this.agent_context?.get_system_message_suffix({
        working_dir,
        context_root,
        workspace_context_root: context_root,
        platform_context_root: this.runtime_context?.platform_context_root ?? null,
      }) ?? null
    );
  }

  init_state(
    state: ConversationState,
    _onEvent: ConversationCallbackType,
    _conversation?: ConversationProtocol,
  ): Promise<void> | void {
    this._initialize(state);
  }

  protected _initialize(_state: ConversationState): void {
    if (this._initialized) {
      return;
    }

    const tools = this.tool_runtime.get_tool_definitions();
    const seenNames = new Set<string>();
    const toolMap: Record<string, ToolDefinition> = {};
    for (const tool of tools) {
      if (seenNames.has(tool.name)) {
        throw new Error(`Duplicate tool names found: ${tool.name}`);
      }
      seenNames.add(tool.name);
      toolMap[tool.name] = tool;
    }

    this._tools = toolMap;
    this._initialized = true;
  }
}

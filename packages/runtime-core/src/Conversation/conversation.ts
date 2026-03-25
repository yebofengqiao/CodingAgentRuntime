import { Agent, type LlmConfig } from "../Agent";
import {
  resolve_runtime_context,
  type RuntimeContextConfig,
} from "../Context";
import type { ConversationCallbackType } from "../Event/callback";
import type { ConversationState } from "../Event/event";
import { BaseConversation } from "./base";
import {
  LocalConversation,
  LocalWorkspace,
  type ConversationOptions,
  type ConversationRunOptions,
  type RuntimeRunResult,
} from "./local_conversation";

export type RuntimeRunOptions = {
  state: ConversationState;
  workspace_dir: string;
  llm_config: LlmConfig;
  on_event: ConversationCallbackType;
  cancel_requested?: () => boolean;
  runtime_context?: RuntimeContextConfig;
};

export interface Conversation extends LocalConversation {}

export class Conversation {
  constructor(options: ConversationOptions) {
    return new LocalConversation(options) as unknown as Conversation;
  }

  static async run({
    state,
    workspace_dir,
    llm_config,
    on_event,
    cancel_requested,
    runtime_context,
  }: RuntimeRunOptions): Promise<RuntimeRunResult> {
    const resolved_runtime_context = resolve_runtime_context(runtime_context, workspace_dir);
    const conversation = new Conversation({
      agent: new Agent({ llmConfig: llm_config, runtime_context: resolved_runtime_context }),
      workspace: LocalWorkspace.fromPath(workspace_dir),
      state,
      callbacks: [on_event],
      runtime_context: resolved_runtime_context,
    });

    return conversation.run({ cancel_requested });
  }
}

export { BaseConversation, type ConversationStateProtocol } from "./base";

export {
  LocalConversation,
  LocalWorkspace,
  reset_workspace_directory,
  type AgentProtocol,
  type ConversationOptions,
  type ConversationRunOptions,
} from "./local_conversation";

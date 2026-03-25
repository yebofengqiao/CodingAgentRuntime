import { maybe_build_condensation_event } from "../Context/condenser";
import {
  create_event,
  createTextContentBlock,
  get_pending_approval_actions,
  get_unmatched_actions,
  type Event,
  type ConversationState,
  type MessagePayload,
} from "../Event/event";
import type { ConversationCallbackType } from "../Event/callback";
import { AgentBase, type AgentBaseOptions, type ConversationProtocol } from "./base";
import { ParallelToolExecutor } from "./parallel_executor";
import {
  build_system_prompt_event,
  get_last_user_message,
  plan_with_llm,
  type ActionPlan,
  type ActionPlanner,
} from "./utils";

export type { LlmConfig } from "./base";
export {
  actions_from_tool_calls,
  build_system_prompt_event,
  build_user_message_event,
  get_last_user_message,
  normalize_actions,
  normalize_actions_from_tools,
  normalize_llm_model,
  normalize_security_risk,
  parse_structured_payload,
  plan_with_llm,
  prepare_llm_messages,
  type ActionPlan,
  type ActionPlanner,
} from "./utils";

export type AgentOptions = {
  planner?: ActionPlanner;
} & AgentBaseOptions;

const INIT_STATE_PREFIX_SCAN_WINDOW = 3;

class ActionBatch {
  private readonly results_by_id: Record<string, Event[]>;

  private constructor(results_by_id: Record<string, Event[]>) {
    this.results_by_id = results_by_id;
  }

  static async prepare(
    action_events: Event[],
    executor: ParallelToolExecutor,
    runner: (action_event: Event) => Promise<Event[]>,
  ): Promise<ActionBatch> {
    const results = await executor.execute_batch(action_events, runner);
    const results_by_id = Object.fromEntries(
      action_events.map((event, index) => [event.id, results[index] ?? []]),
    );
    return new ActionBatch(results_by_id);
  }

  async emit(action_events: Event[], on_event: ConversationCallbackType): Promise<void> {
    for (const action_event of action_events) {
      for (const event of this.results_by_id[action_event.id] ?? []) {
        await on_event(event);
      }
    }
  }
}

export class Agent extends AgentBase {
  private readonly planner: ActionPlanner;
  private readonly _parallel_executor: ParallelToolExecutor;

  constructor({
    planner = plan_with_llm,
    ...baseOptions
  }: AgentOptions) {
    super(baseOptions);
    this.planner = planner;
    this._parallel_executor = new ParallelToolExecutor(this.tool_concurrency_limit);
  }

  async init_state(
    state: ConversationState,
    on_event: ConversationCallbackType,
    conversation?: ConversationProtocol,
  ): Promise<void> {
    super.init_state(state, on_event, conversation);

    const prefixEvents = state.events.slice(0, INIT_STATE_PREFIX_SCAN_WINDOW);
    const hasSystemPrompt = prefixEvents.some((event) => event.kind === "system_prompt");
    if (hasSystemPrompt) {
      return;
    }

    const hasUserMessage = prefixEvents.some(
      (event) => event.kind === "message" && event.source === "user",
    );
    if (hasUserMessage) {
      const error = new Error(
        "Unexpected state: user message exists before SystemPromptEvent. " +
          `prefix_events=${prefixEvents.map((event) => `${event.kind}:${event.source}`).join(",") || "none"}`,
      );
      error.name = "AssertionError";
      throw error;
    }

    const working_dir = conversation?.workspace.working_dir ?? process.cwd();
    await on_event(
      build_system_prompt_event({
        runtime_context: this._resolve_runtime_context(working_dir),
        working_dir,
        tools: this.tool_definitions,
      }),
    );
  }

  async step(
    conversation: ConversationProtocol,
    on_event: ConversationCallbackType,
  ): Promise<void> {
    const state = conversation.state;

    const pending_actions = get_unmatched_actions(state.events);
    if (pending_actions.length > 0) {
      await this.execute_actions(conversation, pending_actions, on_event);
      return;
    }

    const pending_approval_actions = get_pending_approval_actions(state.events);
    if (pending_approval_actions.length > 0) {
      state.execution_status = "waiting_for_confirmation";
      return;
    }

    if (!get_last_user_message(state.events)) {
      conversation.finish();
      return;
    }

    const condensation_event = this.runtime_context
      ? maybe_build_condensation_event(state.events, this.runtime_context.condenser)
      : null;
    if (condensation_event) {
      await on_event(condensation_event);
      return;
    }

    let plan: ActionPlan;
    try {
      plan = await this.planner(this.tools_map, state.events, this.llmConfig);
    } catch (error) {
      state.execution_status = "error";
      await on_event(
        create_event("conversation_error", "environment", {
          code: error instanceof Error ? error.name : "RuntimeError",
          detail: error instanceof Error ? error.message : String(error),
        }),
      );
      return;
    }

    if (plan.actions.length > 0) {
      const action_events: Event[] = [];
      let has_waiting_approval = false;
      for (const [index, action] of plan.actions.entries()) {
        const requires_confirmation = action.security_risk === "high";
        const action_event = create_event("action", "agent", {
          tool_name: action.tool_name,
          arguments: action.arguments,
          summary: action.summary,
          security_risk: action.security_risk,
          thought: index === 0 ? plan.thought : "",
          requires_confirmation,
          executable: !requires_confirmation,
        });
        action_events.push(action_event);
        await on_event(action_event);
        if (requires_confirmation) {
          has_waiting_approval = true;
        }
      }

      if (has_waiting_approval) {
        state.execution_status = "waiting_for_confirmation";
        return;
      }

      await this.execute_actions(conversation, action_events, on_event);
      return;
    }

    const reply = plan.assistantReply.trim();
    await on_event(
      create_event<MessagePayload>("message", "agent", {
        llm_message: {
          role: "assistant",
          content: [createTextContentBlock(reply)],
        },
        activated_skills: [],
        extended_content: [],
      }),
    );
    conversation.finish();
  }

  private async execute_actions(
    conversation: ConversationProtocol,
    action_events: Event[],
    on_event: ConversationCallbackType,
  ): Promise<void> {
    const batch = await ActionBatch.prepare(
      action_events,
      this._parallel_executor,
      async (action_event) => this.execute_action(conversation, action_event),
    );
    await batch.emit(action_events, on_event);
  }

  private async execute_action(
    conversation: ConversationProtocol,
    action_event: Event,
  ): Promise<Event[]> {
    const tool_name =
      typeof action_event.payload.tool_name === "string" ? action_event.payload.tool_name : "";
    const arguments_ =
      action_event.payload.arguments && typeof action_event.payload.arguments === "object"
        ? (action_event.payload.arguments as Record<string, unknown>)
        : null;

    if (!tool_name || !arguments_) {
      return [
        create_event("agent_error", "agent", {
          tool_name: tool_name || "unknown",
          action_id: action_event.id,
          error: "Invalid tool payload.",
        }),
      ];
    }

    try {
      if (!(tool_name in this.tools_map)) {
        throw new Error(`Tool '${tool_name}' is not initialized.`);
      }
      const result = this.tool_runtime.execute(
        tool_name,
        arguments_,
        conversation.workspace.working_dir,
      );
      return [
        create_event("observation", "environment", {
          action_id: action_event.id,
          tool_name,
          result,
        }),
      ];
    } catch (error) {
      return [
        create_event("agent_error", "agent", {
          tool_name,
          action_id: action_event.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      ];
    }
  }
}

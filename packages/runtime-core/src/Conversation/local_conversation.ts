import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { basename, resolve } from "node:path";

import { build_user_message_event } from "../Agent";
import {
  merge_activated_knowledge_skills,
  recover_activated_knowledge_skills,
  type ResolvedRuntimeContext,
} from "../Context/context";
import {
  ConversationState,
  create_event,
  createTextContentBlock,
  type ConversationExecutionStatus,
  type Event,
  type MessagePayload,
} from "../Event/event";
import type { ConversationCallbackType } from "../Event/callback";

export type RuntimeRunResult = {
  execution_status: ConversationExecutionStatus;
};

export type AgentProtocol = {
  init_state(
    state: ConversationState,
    on_event: ConversationCallbackType,
    conversation: LocalConversation,
  ): Promise<void> | void;
  step(
    conversation: LocalConversation,
    on_event: ConversationCallbackType,
  ): Promise<void> | void;
};

export class LocalWorkspace {
  readonly working_dir: string;

  constructor(working_dir: string) {
    this.working_dir = working_dir;
  }

  static fromPath(path: string): LocalWorkspace {
    const root = resolve(path);
    mkdirSync(root, { recursive: true });
    return new LocalWorkspace(root);
  }
}

export type ConversationOptions = {
  agent: AgentProtocol;
  workspace?: string | LocalWorkspace;
  state?: ConversationState;
  max_iterations?: number;
  callbacks?: ConversationCallbackType[];
  runtime_context?: ResolvedRuntimeContext;
};

export type ConversationRunOptions = {
  cancel_requested?: () => boolean;
};

function discoverProjectFileAgents(root: string): string[] {
  const candidates = [
    resolve(root, ".agents", "agents"),
    resolve(root, ".openhands", "agents"),
  ];
  const names: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }
    for (const entry of readdirSync(candidate, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue;
      }
      const name = basename(entry.name, ".md");
      if (seen.has(name)) {
        continue;
      }
      seen.add(name);
      names.push(name);
    }
  }

  return names;
}

export class LocalConversation {
  readonly agent: AgentProtocol;
  readonly workspace: LocalWorkspace;
  readonly state: ConversationState;
  readonly runtime_context?: ResolvedRuntimeContext;

  private readonly _on_event: ConversationCallbackType;
  private _plugins_loaded = false;
  private _file_based_agents_registered = false;
  private _agent_ready = false;
  private _registered_file_agent_names: string[] = [];

  constructor({
    agent,
    workspace = "./workspace/minimal",
    state,
    max_iterations = 50,
    callbacks = [],
    runtime_context,
  }: ConversationOptions) {
    this.agent = agent;
    this.workspace =
      workspace instanceof LocalWorkspace ? workspace : LocalWorkspace.fromPath(workspace);
    this.state = state ?? ConversationState.create(max_iterations);
    this.runtime_context = runtime_context;
    if (!state) {
      this.state.max_iterations = max_iterations;
    }
    this.state.activated_knowledge_skills = recover_activated_knowledge_skills(this.state.events);

    this._on_event = this.compose_callbacks([
      ...callbacks,
      (event) => {
        this.state.events.push(event);
        if (event.kind === "message" && event.source === "user") {
          const activated_skills = Array.isArray(event.payload.activated_skills)
            ? event.payload.activated_skills.filter((item): item is string => typeof item === "string")
            : [];
          this.state.activated_knowledge_skills = merge_activated_knowledge_skills(
            this.state.activated_knowledge_skills,
            activated_skills,
          );
        }
      },
    ]);
  }

  get registered_file_agents(): string[] {
    return [...this._registered_file_agent_names];
  }

  get id(): string {
    return this.state.id;
  }

  async send_message(message: string): Promise<void> {
    await this._ensure_agent_ready();
    if (this.state.execution_status === "finished") {
      this.state.execution_status = "idle";
    }
    if (!this.runtime_context) {
      await this._on_event(
        create_event<MessagePayload>("message", "user", {
          llm_message: {
            role: "user",
            content: [createTextContentBlock(message)],
          },
          activated_skills: [],
          extended_content: [],
        }),
      );
      return;
    }
    await this._on_event(
      build_user_message_event({
        raw_text: message,
        prior_events: this.state.events,
        runtime_context: this.runtime_context,
        skip_skill_names: this.state.activated_knowledge_skills,
      }),
    );
  }

  async run({ cancel_requested }: ConversationRunOptions = {}): Promise<RuntimeRunResult> {
    await this._ensure_agent_ready();

    if (
      this.state.execution_status === "idle" ||
      this.state.execution_status === "paused" ||
      this.state.execution_status === "error" ||
      this.state.execution_status === "finished"
    ) {
      this.state.execution_status = "running";
    }

    let iterations = 0;
    const blocked_statuses = new Set<ConversationExecutionStatus>([
      "paused",
      "stuck",
      "waiting_for_confirmation",
      "finished",
    ]);
    try {
      while (iterations < this.state.max_iterations) {
        if (cancel_requested?.()) {
          this.state.execution_status = "error";
          await this._on_event(
            create_event("conversation_error", "environment", {
              code: "Cancelled",
            }),
          );
          return { execution_status: this.state.execution_status };
        }

        if (blocked_statuses.has(this.state.execution_status)) {
          break;
        }

        await this.agent.step(this, this._on_event);
        iterations += 1;
      }
    } catch (error) {
      this.state.execution_status = "error";
      await this._on_event(
        create_event("conversation_error", "environment", {
          code: error instanceof Error ? error.name : "RuntimeError",
          detail: error instanceof Error ? error.message : String(error),
        }),
      );
      return { execution_status: this.state.execution_status };
    }

    if (iterations >= this.state.max_iterations) {
      this.state.execution_status = "error";
      await this._on_event(
        create_event("conversation_error", "environment", {
          code: "MaxIterationsReached",
        }),
      );
    }

    return { execution_status: this.state.execution_status };
  }

  finish(): void {
    this.state.execution_status = "finished";
  }

  async _ensure_plugins_loaded(): Promise<void> {
    if (this._plugins_loaded) {
      return;
    }
    this._plugins_loaded = true;
  }

  async _register_file_based_agents(): Promise<void> {
    if (this._file_based_agents_registered) {
      return;
    }

    const scan_roots = [
      this.workspace.working_dir,
      this.runtime_context?.platform_context_root ?? null,
      this.runtime_context?.workspace_context_root ?? null,
      this.runtime_context?.context_root ?? null,
    ].filter((root, index, items): root is string => {
      return typeof root === "string" && items.indexOf(root) === index;
    });

    const registered: string[] = [];
    const seen = new Set<string>();
    for (const root of scan_roots) {
      for (const agent_name of discoverProjectFileAgents(root)) {
        if (seen.has(agent_name)) {
          continue;
        }
        seen.add(agent_name);
        registered.push(agent_name);
      }
    }

    this._registered_file_agent_names = registered;
    this._file_based_agents_registered = true;
  }

  async _ensure_agent_ready(): Promise<void> {
    if (this._agent_ready) {
      return;
    }
    await this._ensure_plugins_loaded();
    await this._register_file_based_agents();
    await this.agent.init_state(this.state, this._on_event, this);
    this._agent_ready = true;
  }

  private compose_callbacks(callbacks: ConversationCallbackType[]): ConversationCallbackType {
    return async (event: Event) => {
      for (const callback of callbacks) {
        await callback(event);
      }
    };
  }
}

export function reset_workspace_directory(workspace_dir: string): void {
  rmSync(workspace_dir, { recursive: true, force: true });
  mkdirSync(workspace_dir, { recursive: true });
}

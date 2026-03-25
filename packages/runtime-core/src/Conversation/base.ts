import type { ConversationExecutionStatus, ConversationState } from "../Event/event";

export interface ConversationStateProtocol {
  id: string;
  events: ConversationState["events"];
  execution_status: ConversationExecutionStatus;
  activated_knowledge_skills: string[];
}

export abstract class BaseConversation {
  abstract get id(): string;
  abstract get state(): ConversationStateProtocol;
  abstract send_message(message: string): Promise<void> | void;
  abstract run(): Promise<{ execution_status: ConversationExecutionStatus }> | void;
  abstract finish(): void;
}

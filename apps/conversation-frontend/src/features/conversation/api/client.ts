import { joinApiUrl, requestJson } from "@/shared/api/http";

import type {
  ActionDecisionPayload,
  ActionDecisionResponse,
  ConversationCreated,
  ConversationEvent,
  ConversationItem,
  ConversationRun,
  PostConversationMessagePayload,
  PostConversationMessageResponse,
} from "../model/types";

export function resolveConversationApiBaseUrl(): string {
  return import.meta.env.VITE_CONVERSATION_API_BASE_URL ?? "http://127.0.0.1:4000";
}

export function getConversationFileUrl(path: string): string {
  return joinApiUrl(resolveConversationApiBaseUrl(), path);
}

export function listConversations(): Promise<ConversationItem[]> {
  return requestJson<ConversationItem[]>(resolveConversationApiBaseUrl(), "/conversations");
}

export function createConversation(): Promise<ConversationCreated> {
  return requestJson<ConversationCreated>(resolveConversationApiBaseUrl(), "/conversations", {
    method: "POST",
  });
}

export function listConversationEvents(
  conversationId: string,
  afterSeq = 0,
  limit = 500,
): Promise<ConversationEvent[]> {
  const params = new URLSearchParams({
    after_seq: String(afterSeq),
    limit: String(limit),
  });

  return requestJson<ConversationEvent[]>(
    resolveConversationApiBaseUrl(),
    `/conversations/${conversationId}/events?${params.toString()}`,
  );
}

export function postConversationMessage(
  conversationId: string,
  payload: PostConversationMessagePayload,
): Promise<PostConversationMessageResponse> {
  return requestJson<PostConversationMessageResponse>(
    resolveConversationApiBaseUrl(),
    `/conversations/${conversationId}/messages`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function deleteConversation(conversationId: string): Promise<void> {
  return requestJson<void>(resolveConversationApiBaseUrl(), `/conversations/${conversationId}`, {
    method: "DELETE",
  });
}

export function listConversationRuns(
  conversationId: string,
  limit = 100,
): Promise<ConversationRun[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  return requestJson<ConversationRun[]>(
    resolveConversationApiBaseUrl(),
    `/conversations/${conversationId}/runs?${params.toString()}`,
  );
}

export function approveAction(
  conversationId: string,
  actionId: string,
  payload?: ActionDecisionPayload,
): Promise<ActionDecisionResponse> {
  return requestJson<ActionDecisionResponse>(
    resolveConversationApiBaseUrl(),
    `/conversations/${conversationId}/actions/${actionId}/approve`,
    {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    },
  );
}

export function rejectAction(
  conversationId: string,
  actionId: string,
  payload?: ActionDecisionPayload,
): Promise<ActionDecisionResponse> {
  return requestJson<ActionDecisionResponse>(
    resolveConversationApiBaseUrl(),
    `/conversations/${conversationId}/actions/${actionId}/reject`,
    {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    },
  );
}

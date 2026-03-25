import { useEffect } from "react";
import { Drawer, Grid, Layout } from "antd";

import { ChatPanel } from "@/features/conversation/ui/ChatPanel";
import { ConversationSidebar } from "@/features/conversation/ui/ConversationSidebar";
import { EventTimeline } from "@/features/conversation/ui/EventTimeline";
import { useConversationStore } from "@/features/conversation/model/store";

export default function ConversationPage() {
  const screens = Grid.useBreakpoint();
  const isDesktop = Boolean(screens.lg);
  const {
    conversations,
    activeConversationId,
    events,
    runs,
    pendingActionId,
    status,
    busy,
    isSending,
    isDeciding,
    eventsDrawerOpen,
    lastError,
    bootstrap,
    dispose,
    selectConversation,
    createConversation,
    deleteConversation,
    sendMessage,
    approvePendingAction,
    rejectPendingAction,
    setEventsDrawerOpen,
  } = useConversationStore();

  useEffect(() => {
    void bootstrap();
    return () => {
      dispose();
    };
  }, [bootstrap, dispose]);

  return (
    <>
      <Layout
        style={{
          minHeight: "100vh",
          height: "100vh",
          background: "transparent",
        }}
      >
        <div
          style={{
            display: "flex",
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            flexDirection: isDesktop ? "row" : "column",
          }}
        >
          <div
            style={{
              width: isDesktop ? 320 : "100%",
              flex: isDesktop ? "0 0 320px" : "0 0 auto",
              minWidth: 0,
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <ConversationSidebar
              conversations={conversations}
              activeConversationId={activeConversationId}
              onSelect={(conversationId) => {
                void selectConversation(conversationId);
              }}
              onCreate={() => {
                void createConversation();
              }}
              onDelete={(conversationId) => {
                void deleteConversation(conversationId);
              }}
              busy={busy}
              compact={!isDesktop}
            />
          </div>

          <Layout.Content
            style={{
              padding: isDesktop ? 20 : 12,
              minWidth: 0,
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <ChatPanel
              status={status}
              events={events}
              activeConversationId={activeConversationId}
              onSend={sendMessage}
              onOpenEventsDrawer={() => setEventsDrawerOpen(true)}
              busy={busy}
              isSending={isSending}
              latestRun={runs.length > 0 ? runs[0] : null}
              pendingActionId={pendingActionId}
              onApproveAction={approvePendingAction}
              onRejectAction={rejectPendingAction}
              isDeciding={isDeciding}
              lastError={lastError}
            />
          </Layout.Content>
        </div>
      </Layout>

      <Drawer
        placement="right"
        width={720}
        open={eventsDrawerOpen}
        onClose={() => setEventsDrawerOpen(false)}
        destroyOnClose={false}
        closable={false}
        styles={{ body: { padding: 16 } }}
      >
        <EventTimeline events={events} onClose={() => setEventsDrawerOpen(false)} />
      </Drawer>
    </>
  );
}

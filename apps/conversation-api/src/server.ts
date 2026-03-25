import { createConversationApiApp } from "./app/create-app";

async function start() {
  const app = await createConversationApiApp();
  const host = process.env.CONVERSATION_API_HOST ?? "127.0.0.1";
  const port = Number(process.env.CONVERSATION_API_PORT ?? "4000");
  await app.listen({ host, port });
}

void start();

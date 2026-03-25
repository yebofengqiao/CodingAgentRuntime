import { createEvaluationApiApp } from "./app/create-app";

async function start() {
  const app = await createEvaluationApiApp();
  const host = process.env.EVALUATION_API_HOST ?? "127.0.0.1";
  const port = Number(process.env.EVALUATION_API_PORT ?? "4001");
  await app.listen({ host, port });
}

void start();
